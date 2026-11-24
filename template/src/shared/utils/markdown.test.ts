import {
  inlineToText,
  isSafeUrl,
  MAX_INLINE_DEPTH,
  MAX_MARKDOWN_LENGTH,
  parseMarkdown,
} from './markdown';
import type { InlineNode } from './markdown';

const text = (value: string): InlineNode => ({ type: 'text', text: value });

describe('parseMarkdown blocks', () => {
  it('splits paragraphs on blank lines and joins soft line breaks with a space', () => {
    expect(parseMarkdown('one\ntwo\n\nthree')).toEqual([
      { type: 'paragraph', children: [text('one two')] },
      { type: 'paragraph', children: [text('three')] },
    ]);
  });

  it('keeps hard line breaks (two trailing spaces or a backslash)', () => {
    expect(parseMarkdown('one  \ntwo\\\nthree')).toEqual([
      {
        type: 'paragraph',
        children: [text('one'), { type: 'break' }, text('two'), { type: 'break' }, text('three')],
      },
    ]);
  });

  it('parses headings 1 to 3 and leaves deeper ones as text', () => {
    expect(parseMarkdown('# One\n## Two ##\n### Three\n#### Four\n#nospace')).toEqual([
      { type: 'heading', level: 1, children: [text('One')] },
      { type: 'heading', level: 2, children: [text('Two')] },
      { type: 'heading', level: 3, children: [text('Three')] },
      { type: 'paragraph', children: [text('#### Four #nospace')] },
    ]);
  });

  it('parses bullet lists with - and *', () => {
    expect(parseMarkdown('- a\n* b')).toEqual([
      { type: 'list', isOrdered: false, start: 1, items: [[text('a')], [text('b')]] },
    ]);
  });

  it('parses numbered lists and keeps the first number', () => {
    expect(parseMarkdown('3. c\n4. d')).toEqual([
      { type: 'list', isOrdered: true, start: 3, items: [[text('c')], [text('d')]] },
    ]);
  });

  it('keeps a list together across a blank line and continues an item on the next line', () => {
    expect(parseMarkdown('- a\n  more\n\n- b')).toEqual([
      { type: 'list', isOrdered: false, start: 1, items: [[text('a more')], [text('b')]] },
    ]);
  });

  it('ends a list at a blank line followed by text, and at a change of list type', () => {
    expect(parseMarkdown('- a\n\nafter\n\n1. n')).toEqual([
      { type: 'list', isOrdered: false, start: 1, items: [[text('a')]] },
      { type: 'paragraph', children: [text('after')] },
      { type: 'list', isOrdered: true, start: 1, items: [[text('n')]] },
    ]);
    expect(parseMarkdown('- a\n1. b')).toHaveLength(2);
  });

  it('does not take *emphasis* at the start of a line for a list item', () => {
    expect(parseMarkdown('*word* here')).toEqual([
      {
        type: 'paragraph',
        children: [{ type: 'em', children: [text('word')] }, text(' here')],
      },
    ]);
  });

  it('returns nothing for empty or blank input', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('  \n\n ')).toEqual([]);
    expect(parseMarkdown('# ')).toEqual([]);
  });

  it('normalizes Windows line endings', () => {
    expect(parseMarkdown('a\r\n\r\nb')).toHaveLength(2);
  });
});

describe('parseMarkdown inline', () => {
  const inline = (source: string) => {
    const [block] = parseMarkdown(source);
    return block?.type === 'paragraph' ? block.children : [];
  };

  it('parses bold, italic with * and _, and inline code', () => {
    expect(inline('**b** *i* _j_ `c`')).toEqual([
      { type: 'strong', children: [text('b')] },
      text(' '),
      { type: 'em', children: [text('i')] },
      text(' '),
      { type: 'em', children: [text('j')] },
      text(' '),
      { type: 'code', text: 'c' },
    ]);
  });

  it('nests bold, italic and links', () => {
    expect(inline('**a *b* [c](https://x.test)**')).toEqual([
      {
        type: 'strong',
        children: [
          text('a '),
          { type: 'em', children: [text('b')] },
          text(' '),
          { type: 'link', href: 'https://x.test', children: [text('c')] },
        ],
      },
    ]);
    expect(inline('***both***')).toEqual([
      { type: 'strong', children: [{ type: 'em', children: [text('both')] }] },
    ]);
  });

  it('does not format inside inline code', () => {
    expect(inline('`**not bold**`')).toEqual([{ type: 'code', text: '**not bold**' }]);
  });

  it('leaves unmatched markers, spaced markers and snake_case as text', () => {
    expect(inline('**open')).toEqual([text('**open')]);
    expect(inline('2 * 3 * 4')).toEqual([text('2 * 3 * 4')]);
    expect(inline('snake_case_name')).toEqual([text('snake_case_name')]);
    expect(inline('a `open')).toEqual([text('a `open')]);
  });

  it('unescapes backslash-escaped markers', () => {
    expect(inline('\\*not\\* \\[x](y)')).toEqual([text('*not* [x](y)')]);
  });

  it('parses http, https and mailto links', () => {
    expect(inline('[a](http://a.test) [b](HTTPS://b.test/p?q=1) [c](mailto:me@x.test)')).toEqual([
      { type: 'link', href: 'http://a.test', children: [text('a')] },
      text(' '),
      { type: 'link', href: 'HTTPS://b.test/p?q=1', children: [text('b')] },
      text(' '),
      { type: 'link', href: 'mailto:me@x.test', children: [text('c')] },
    ]);
  });

  it('keeps the words of a link with any other scheme and drops the target', () => {
    for (const url of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,hi',
      'tel:123',
      'file:///etc/passwd',
      '/relative',
      '//host/path',
      ' ',
    ]) {
      expect(inline(`[click **me**](${url})`)).toEqual([
        text('click '),
        { type: 'strong', children: [text('me')] },
      ]);
    }
  });

  it('does not make a link of a target with whitespace inside', () => {
    expect(inline('[a](java\tscript:alert(1))')).toEqual([text('[a](java\tscript:alert(1))')]);
  });

  it('does not nest links and ignores a title after the url', () => {
    expect(inline('[a [b](https://x.test)](https://y.test)')).toEqual([
      { type: 'link', href: 'https://x.test', children: [text('a [b')] },
      text('](https://y.test)'),
    ]);
    expect(inline('[w](https://x.test/a_(b))')).toEqual([
      { type: 'link', href: 'https://x.test/a_(b)', children: [text('w')] },
    ]);
    expect(inline('[a](https://x.test "title")')).toEqual([text('[a](https://x.test "title")')]);
  });

  it('shows HTML, images and tables as plain text', () => {
    expect(inline('<b>x</b> <script>alert(1)</script>')).toEqual([
      text('<b>x</b> <script>alert(1)</script>'),
    ]);
    expect(inline('![alt](https://x.test/a.png)')).toEqual([
      text('!'),
      { type: 'link', href: 'https://x.test/a.png', children: [text('alt')] },
    ]);
    expect(parseMarkdown('| a | b |\n| - | - |')).toEqual([
      { type: 'paragraph', children: [text('| a | b | | - | - |')] },
    ]);
  });
});

describe('parseMarkdown bounds and safety', () => {
  it('drops everything past the length cap', () => {
    const blocks = parseMarkdown(`${'a'.repeat(MAX_MARKDOWN_LENGTH)}tail`);
    const [first] = blocks;
    expect(first?.type === 'paragraph' && inlineToText(first.children)).toBe(
      'a'.repeat(MAX_MARKDOWN_LENGTH),
    );
  });

  it('does not split a surrogate pair at the cap', () => {
    const blocks = parseMarkdown(`${'a'.repeat(MAX_MARKDOWN_LENGTH - 1)}😀`);
    const [first] = blocks;
    expect(first?.type === 'paragraph' && inlineToText(first.children)).toBe(
      'a'.repeat(MAX_MARKDOWN_LENGTH - 1),
    );
  });

  it('stops nesting at the depth cap and keeps the rest as text', () => {
    const depth = MAX_INLINE_DEPTH + 3;
    const source = `${'*a '.repeat(depth)}x${' a*'.repeat(depth)}`;
    const [block] = parseMarkdown(source);
    expect(block?.type).toBe('paragraph');
    let levels = 0;
    let nodes: InlineNode[] = block?.type === 'paragraph' ? block.children : [];
    for (;;) {
      const nested = nodes.find((node) => node.type === 'em');
      if (nested?.type !== 'em') {
        break;
      }
      levels += 1;
      nodes = nested.children;
    }
    expect(levels).toBeLessThanOrEqual(MAX_INLINE_DEPTH + 1);
    expect(inlineToText(block?.type === 'paragraph' ? block.children : [])).toContain('x');
  });

  it('never throws and stays fast on malformed and hostile input', () => {
    const hostile = [
      '[',
      '](',
      '[]()',
      '[a](',
      '[a]((',
      '**',
      '****',
      '*',
      '_',
      '`',
      '``',
      '\\',
      '\u0000\u0001\u0007',
      '[[[[[[[[[[[[[[[[[[[[',
      '*_*_*_*_*_*_*_*_',
      '#'.repeat(5000),
      '- '.repeat(5000),
      '1. '.repeat(5000),
      '[a]('.repeat(4000),
      '**a'.repeat(6000),
      '*'.repeat(MAX_MARKDOWN_LENGTH),
      '[x](http://a.test)'.repeat(1100),
      '\n'.repeat(MAX_MARKDOWN_LENGTH),
      '😀'.repeat(MAX_MARKDOWN_LENGTH),
    ];
    const started = Date.now();
    for (const source of hostile) {
      expect(() => parseMarkdown(source)).not.toThrow();
    }
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('returns nothing for a value that is not a string', () => {
    expect(parseMarkdown(undefined as unknown as string)).toEqual([]);
    expect(parseMarkdown(42 as unknown as string)).toEqual([]);
  });
});

describe('isSafeUrl', () => {
  it('accepts only http, https and mailto', () => {
    expect(isSafeUrl('https://a.test')).toBe(true);
    expect(isSafeUrl('mailto:a@b.test')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('https:')).toBe(false);
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('https://a.test/ x')).toBe(false);
  });
});

describe('inlineToText', () => {
  it('flattens nodes to readable text', () => {
    expect(
      inlineToText([
        text('a '),
        { type: 'strong', children: [text('b')] },
        { type: 'break' },
        { type: 'code', text: 'c' },
      ]),
    ).toBe('a b c');
  });
});
