import { parseInline, stripControlChars } from './markdownInline';
import type { InlineNode } from './markdownInline';

export { inlineToText, isSafeUrl, MAX_INLINE_DEPTH } from './markdownInline';
export type { InlineNode } from './markdownInline';

/** Longest source that is parsed; the rest is dropped. */
export const MAX_MARKDOWN_LENGTH = 20_000;
const SCAN_BUDGET = 200_000;
const MAX_HEADING_LEVEL = 3;
const MAX_NUMBER_DIGITS = 9;

type HeadingLevel = 1 | 2 | 3;
export type MarkdownBlock =
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'heading'; level: HeadingLevel; children: InlineNode[] }
  | { type: 'list'; isOrdered: boolean; start: number; items: InlineNode[][] };

type ListState = { isOrdered: boolean; start: number; texts: string[]; hasGap: boolean };
type ParserState = {
  blocks: MarkdownBlock[];
  paragraph: string[];
  list: ListState | undefined;
  inline: (text: string) => InlineNode[];
};
type ListItem = { isOrdered: boolean; start: number; text: string };

function isBlank(char: string | undefined): boolean {
  return char === ' ' || char === '\t';
}

/** `#`, `##` or `###` followed by a space; a closing run of `#` is dropped. */
function parseHeading(line: string): { level: HeadingLevel; text: string } | undefined {
  const trimmed = line.trimStart();
  let level = 0;
  while (trimmed[level] === '#') {
    level += 1;
  }
  if (level < 1 || level > MAX_HEADING_LEVEL || !isBlank(trimmed[level])) {
    return undefined;
  }
  let text = trimmed.slice(level).trim();
  let end = text.length;
  while (text[end - 1] === '#') {
    end -= 1;
  }
  if (end < text.length && isBlank(text[end - 1])) {
    text = text.slice(0, end).trimEnd();
  }
  return { level: level as HeadingLevel, text };
}

/** `- text`, `* text` or `12. text`. */
function parseListItem(line: string): ListItem | undefined {
  const trimmed = line.trimStart();
  if ((trimmed.startsWith('-') || trimmed.startsWith('*')) && isBlank(trimmed[1])) {
    return { isOrdered: false, start: 1, text: trimmed.slice(2).trim() };
  }
  let digits = 0;
  while (digits <= MAX_NUMBER_DIGITS && /\d/.test(trimmed[digits] ?? '')) {
    digits += 1;
  }
  if (
    digits < 1 ||
    digits > MAX_NUMBER_DIGITS ||
    trimmed[digits] !== '.' ||
    !isBlank(trimmed[digits + 1])
  ) {
    return undefined;
  }
  return {
    isOrdered: true,
    start: Number(trimmed.slice(0, digits)),
    text: trimmed.slice(digits + 2).trim(),
  };
}

function flushParagraph(state: ParserState): void {
  if (state.paragraph.length > 0) {
    state.blocks.push({ type: 'paragraph', children: state.inline(state.paragraph.join('\n')) });
    state.paragraph = [];
  }
}

function flushList(state: ParserState): void {
  const { list } = state;
  if (list) {
    state.blocks.push({
      type: 'list',
      isOrdered: list.isOrdered,
      start: list.start,
      items: list.texts.map(state.inline),
    });
    state.list = undefined;
  }
}

function addListItem(state: ParserState, item: ListItem): void {
  flushParagraph(state);
  let { list } = state;
  if (list?.isOrdered !== item.isOrdered) {
    flushList(state);
    list = { isOrdered: item.isOrdered, start: item.start, texts: [], hasGap: false };
    state.list = list;
  }
  list.texts.push(item.text);
  list.hasGap = false;
}

function addHeading(state: ParserState, heading: { level: HeadingLevel; text: string }): void {
  flushParagraph(state);
  flushList(state);
  const children = state.inline(heading.text);
  if (children.length > 0) {
    state.blocks.push({ type: 'heading', level: heading.level, children });
  }
}

function addTextLine(state: ParserState, line: string): void {
  const { list } = state;
  if (list && !list.hasGap) {
    // A line right under a list item continues that item.
    list.texts.push(`${list.texts.pop() ?? ''}\n${line.trim()}`);
    return;
  }
  flushList(state);
  state.paragraph.push(line.trimStart());
}

function addLine(state: ParserState, line: string): void {
  if (line.trim() === '') {
    flushParagraph(state);
    if (state.list) {
      state.list.hasGap = true;
    }
    return;
  }
  const heading = parseHeading(line);
  const item = heading ? undefined : parseListItem(line);
  if (heading) {
    addHeading(state, heading);
  } else if (item) {
    addListItem(state, item);
  } else {
    addTextLine(state, line);
  }
}

function parseBlocks(source: string): MarkdownBlock[] {
  const budget = { left: SCAN_BUDGET };
  const state: ParserState = {
    blocks: [],
    paragraph: [],
    list: undefined,
    inline: (text) => parseInline(text, { depth: 0, isInLink: false, budget }),
  };
  for (const line of source.split('\n')) {
    addLine(state, line);
  }
  flushParagraph(state);
  flushList(state);
  return state.blocks;
}

/** Drops a lone high surrogate left by cutting the text in the middle of a character. */
function capLength(source: string): string {
  if (source.length <= MAX_MARKDOWN_LENGTH) {
    return source;
  }
  const cut = source.slice(0, MAX_MARKDOWN_LENGTH);
  const last = cut.charCodeAt(cut.length - 1);
  const isHighSurrogate = last >= 0xd800 && last <= 0xdbff;
  return isHighSurrogate ? cut.slice(0, -1) : cut;
}

/**
 * Parses the safe Markdown subset into blocks: paragraphs, `#`-`###` headings, bullet and numbered
 * lists (one level) with bold, italic, inline code and http, https and mailto links. Anything else
 * stays plain text. The input is capped, scanning is budgeted and the function never throws.
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  if (typeof source !== 'string') {
    return [];
  }
  const text = stripControlChars(capLength(source).replaceAll('\r\n', '\n').replaceAll('\r', '\n'));
  try {
    return parseBlocks(text);
  } catch {
    return text.trim() === '' ? [] : [{ type: 'paragraph', children: [{ type: 'text', text }] }];
  }
}
