/** Deepest inline nesting (bold in italic in a link ...); deeper markers stay plain text. */
export const MAX_INLINE_DEPTH = 4;

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: InlineNode[] }
  | { type: 'break' };

/** Characters the scanners may look ahead over in one document, so hostile input stays linear. */
export type ScanBudget = { left: number };
export type InlineContext = { depth: number; isInLink: boolean; budget: ScanBudget };
type Match = { nodes: InlineNode[]; end: number };

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto']);
const ESCAPABLE = new Set('\\`*_[]()#-+.!>'.split(''));
const ALNUM = /[\p{L}\p{N}]/u;
const SPACE = /\s/;
const MAX_CONTROL_CODE = 0x1f;
const DELETE_CODE = 0x7f;

function isControlCode(code: number): boolean {
  return code <= MAX_CONTROL_CODE || code === DELETE_CODE;
}

/** Removes control characters other than tab and newline, which never belong in prose. */
export function stripControlChars(source: string): string {
  let result = '';
  for (const char of source) {
    const code = char.codePointAt(0) ?? 0;
    if (!isControlCode(code) || char === '\t' || char === '\n') {
      result += char;
    }
  }
  return result;
}

function hasForbiddenChar(url: string): boolean {
  for (const char of url) {
    if (SPACE.test(char) || isControlCode(char.codePointAt(0) ?? 0)) {
      return true;
    }
  }
  return false;
}

/** Safe link targets only: `http:`, `https:` and `mailto:`, with no whitespace or control characters. */
export function isSafeUrl(url: string): boolean {
  const colon = url.indexOf(':');
  const hasTarget = colon >= 1 && colon < url.length - 1;
  return hasTarget && !hasForbiddenChar(url) && SAFE_SCHEMES.has(url.slice(0, colon).toLowerCase());
}

/** The readable text of inline nodes, without markers; used as an accessibility label. */
export function inlineToText(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.text;
        case 'break':
          return ' ';
        default:
          return inlineToText(node.children);
      }
    })
    .join('');
}

function indexOfCharged(text: string, token: string, from: number, budget: ScanBudget): number {
  const index = text.indexOf(token, from);
  budget.left -= (index === -1 ? text.length : index) - from + 1;
  return index;
}

function pushText(nodes: InlineNode[], text: string): void {
  const last = nodes.at(-1);
  if (last?.type === 'text') {
    last.text += text;
  } else if (text !== '') {
    nodes.push({ type: 'text', text });
  }
}

function isSpace(char: string | undefined): boolean {
  return char === undefined || SPACE.test(char);
}

/** Index of the closing `**` (the last two of a run of stars), or -1. */
function findStrongEnd(text: string, from: number, budget: ScanBudget): number {
  let search = from;
  while (budget.left > 0) {
    const index = indexOfCharged(text, '**', search, budget);
    if (index === -1) {
      return -1;
    }
    let end = index;
    while (text[end + 2] === '*') {
      end += 1;
      budget.left -= 1;
    }
    if (end > from && !isSpace(text[end - 1])) {
      return end;
    }
    search = end + 2;
  }
  return -1;
}

function isClosingEmphasis(text: string, marker: string, index: number, from: number): boolean {
  return index <= from || isSpace(text[index - 1])
    ? false
    : marker === '*' || !ALNUM.test(text[index + 1] ?? ' ');
}

/** Index of the closing single `*` or `_`, skipping double markers, or -1. */
function findEmphasisEnd(text: string, marker: string, from: number, budget: ScanBudget): number {
  let index = from;
  while (index < text.length && budget.left > 0) {
    budget.left -= 1;
    if (text[index] !== marker) {
      index += 1;
    } else if (text[index + 1] === marker) {
      index += 2;
    } else if (isClosingEmphasis(text, marker, index, from)) {
      return index;
    } else {
      index += 1;
    }
  }
  return -1;
}

/** Index of the `)` that closes a link target, allowing balanced parentheses inside it, or -1. */
function findUrlEnd(text: string, from: number, budget: ScanBudget): number {
  let open = 0;
  for (let index = from; index < text.length && budget.left > 0; index += 1) {
    budget.left -= 1;
    if (text[index] === '(') {
      open += 1;
    } else if (text[index] === ')') {
      if (open === 0) {
        return index;
      }
      open -= 1;
    }
  }
  return -1;
}

function nested(text: string, { depth, isInLink, budget }: InlineContext, isLink = isInLink) {
  return parseInline(text, { depth: depth + 1, isInLink: isLink, budget });
}

function scanEscape(text: string, index: number): Match | undefined {
  const next = text[index + 1];
  if (next === '\n') {
    return { nodes: [{ type: 'break' }], end: index + 2 };
  }
  return next !== undefined && ESCAPABLE.has(next)
    ? { nodes: [{ type: 'text', text: next }], end: index + 2 }
    : undefined;
}

/** A newline is a soft break (a space); two or more spaces before it make it a hard break. */
function scanLineEnd(text: string, index: number): Match {
  if (text[index] === '\n') {
    return { nodes: [{ type: 'text', text: ' ' }], end: index + 1 };
  }
  let end = index;
  while (text[end] === ' ') {
    end += 1;
  }
  if (text[end] !== '\n') {
    return { nodes: [{ type: 'text', text: text.slice(index, end) }], end };
  }
  const isHard = end - index >= 2;
  return {
    nodes: isHard ? [{ type: 'break' }] : [{ type: 'text', text: ' ' }],
    end: end + 1,
  };
}

function scanCode(text: string, index: number, { budget }: InlineContext): Match | undefined {
  const end = indexOfCharged(text, '`', index + 1, budget);
  if (end <= index + 1) {
    return undefined;
  }
  return {
    nodes: [{ type: 'code', text: text.slice(index + 1, end).replaceAll('\n', ' ') }],
    end: end + 1,
  };
}

function scanLink(text: string, index: number, context: InlineContext): Match | undefined {
  const { budget } = context;
  const labelEnd = indexOfCharged(text, ']', index + 1, budget);
  if (labelEnd <= index + 1 || text[labelEnd + 1] !== '(') {
    return undefined;
  }
  const urlEnd = findUrlEnd(text, labelEnd + 2, budget);
  const url = text.slice(labelEnd + 2, urlEnd).trim();
  if (urlEnd === -1 || SPACE.test(url)) {
    return undefined;
  }
  const children = nested(text.slice(index + 1, labelEnd), context, true);
  // Any other scheme (javascript:, data:, a relative path) keeps the words and drops the target.
  const nodes: InlineNode[] = isSafeUrl(url) ? [{ type: 'link', href: url, children }] : children;
  return { nodes, end: urlEnd + 1 };
}

function scanStrong(text: string, index: number, context: InlineContext): Match | undefined {
  const end = findStrongEnd(text, index + 2, context.budget);
  if (end <= index + 2 || isSpace(text[index + 2])) {
    return undefined;
  }
  return {
    nodes: [{ type: 'strong', children: nested(text.slice(index + 2, end), context) }],
    end: end + 2,
  };
}

function scanEmphasis(text: string, index: number, context: InlineContext): Match | undefined {
  const marker = text[index] ?? '';
  const isWordInternal = marker === '_' && ALNUM.test(text[index - 1] ?? ' ');
  if (isWordInternal || isSpace(text[index + 1])) {
    return undefined;
  }
  const end = findEmphasisEnd(text, marker, index + 1, context.budget);
  if (end <= index + 1) {
    return undefined;
  }
  return {
    nodes: [{ type: 'em', children: nested(text.slice(index + 1, end), context) }],
    end: end + 1,
  };
}

function scanFormatting(text: string, index: number, context: InlineContext): Match | undefined {
  const char = text[index];
  const next = text[index + 1];
  switch (char) {
    case '`':
      return scanCode(text, index, context);
    case '[':
      return context.isInLink ? undefined : scanLink(text, index, context);
    case '*':
      return next === '*' ? scanStrong(text, index, context) : scanEmphasis(text, index, context);
    case '_':
      return next === '_' ? undefined : scanEmphasis(text, index, context);
    default:
      return undefined;
  }
}

function scanAt(text: string, index: number, context: InlineContext): Match | undefined {
  const char = text[index];
  if (char === '\\') {
    return scanEscape(text, index);
  }
  if (char === '\n' || char === ' ') {
    return scanLineEnd(text, index);
  }
  return context.budget.left > 0 ? scanFormatting(text, index, context) : undefined;
}

/** Parses the inline markup of one block's text into nodes. */
export function parseInline(text: string, context: InlineContext): InlineNode[] {
  if (context.depth > MAX_INLINE_DEPTH) {
    return text === '' ? [] : [{ type: 'text', text }];
  }
  const nodes: InlineNode[] = [];
  let index = 0;
  while (index < text.length) {
    const match = scanAt(text, index, context);
    if (match) {
      for (const node of match.nodes) {
        if (node.type === 'text') {
          pushText(nodes, node.text);
        } else {
          nodes.push(node);
        }
      }
      index = match.end;
    } else {
      pushText(nodes, text[index] ?? '');
      index += 1;
    }
  }
  return nodes;
}
