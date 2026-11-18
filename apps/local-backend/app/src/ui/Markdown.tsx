import type { ReactNode } from 'react';

/**
 * A small, safe Markdown preview. It builds React elements from the text: every piece of the source is placed in the
 * page as a text node, so `<script>` or `<img onerror=...>` in the Markdown shows as the characters it is and is never
 * parsed as HTML. There is no HTML pass-through and no `dangerouslySetInnerHTML`. Links are shown as text with their
 * address, never as clickable anchors, so a preview cannot take the window somewhere else.
 *
 * Supported: headings (`#` to `######`), paragraphs, `-`/`*` and `1.` lists, `>` quotes, fenced code, and inline
 * `**bold**`, `*italic*`, `` `code` `` and `[text](url)`.
 */
const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]*\]\([^)\s]*\))/;

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    const key = `${keyBase}-${String(index)}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2 && !part.startsWith('**')) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]*)\]\(([^)\s]*)\)$/.exec(part);
    if (link !== null) return <span key={key}>{`${link[1] ?? ''} (${link[2] ?? ''})`}</span>;
    return part;
  });
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string };

function blocks(source: string): Block[] {
  const out: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length > 0) out.push({ kind: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.trimStart().startsWith('```')) {
      flush();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? '').trimStart().startsWith('```')) {
        code.push(lines[i] ?? '');
        i += 1;
      }
      out.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (line.trim() === '') flush();
    else if (heading !== null) {
      flush();
      out.push({ kind: 'heading', level: (heading[1] ?? '#').length, text: heading[2] ?? '' });
    } else if (bullet !== null || numbered !== null) {
      flush();
      const ordered = numbered !== null;
      const text = (ordered ? numbered[1] : bullet?.[1]) ?? '';
      const last = out[out.length - 1];
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(text);
      else out.push({ kind: 'list', ordered, items: [text] });
    } else if (quote !== null) {
      flush();
      const last = out[out.length - 1];
      if (last?.kind === 'quote') last.text += ` ${quote[1] ?? ''}`;
      else out.push({ kind: 'quote', text: quote[1] ?? '' });
    } else paragraph.push(line.trim());
  }
  flush();
  return out;
}

export function Markdown({ source, label }: { source: string; label: string }) {
  return (
    <div className="md-preview" role="region" aria-label={label}>
      {blocks(source).map((block, index) => {
        const key = `b${String(index)}`;
        switch (block.kind) {
          case 'heading':
            return (
              <p key={key} className={`md-h md-h${String(block.level)}`}>
                {inline(block.text, key)}
              </p>
            );
          case 'list': {
            const items = block.items.map((item, at) => <li key={`${key}-${String(at)}`}>{inline(item, `${key}-${String(at)}`)}</li>);
            return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
          }
          case 'quote':
            return <blockquote key={key}>{inline(block.text, key)}</blockquote>;
          case 'code':
            return (
              <pre key={key}>
                <code>{block.text}</code>
              </pre>
            );
          case 'paragraph':
            return <p key={key}>{inline(block.text, key)}</p>;
        }
      })}
    </div>
  );
}
