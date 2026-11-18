import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Markdown } from './Markdown';

describe('Markdown preview', () => {
  it('renders headings, lists, quotes, code and inline styles as elements made from text', () => {
    render(<Markdown label="Preview" source={'# Title\n\nSome *soft* and **hard** `code`.\n\n- one\n- two\n\n1. first\n2. second\n\n> quoted\n\n```\nlet x = 1 < 2;\n```'} />);
    const view = screen.getByRole('region', { name: 'Preview' });
    expect(view.querySelector('.md-h1')?.textContent).toBe('Title');
    expect(view.querySelector('em')?.textContent).toBe('soft');
    expect(view.querySelector('strong')?.textContent).toBe('hard');
    expect(view.querySelector('p code')?.textContent).toBe('code');
    expect([...view.querySelectorAll('ul li')].map((item) => item.textContent)).toEqual(['one', 'two']);
    expect([...view.querySelectorAll('ol li')].map((item) => item.textContent)).toEqual(['first', 'second']);
    expect(view.querySelector('blockquote')?.textContent).toBe('quoted');
    expect(view.querySelector('pre code')?.textContent).toBe('let x = 1 < 2;');
  });

  it.each([
    ['<script>alert(1)</script>', 'script'],
    ['<img src=x onerror=alert(1)>', 'img'],
    ['<iframe src="https://evil.example"></iframe>', 'iframe'],
    ['<b onclick="x()">bold?</b>', 'b'],
    ['[x](https://evil.example)', 'a'],
    ['![x](https://evil.example/p.png)', 'img'],
  ])('never turns %s into a %s element', (source, tag) => {
    render(<Markdown label="Preview" source={source} />);
    const view = screen.getByRole('region', { name: 'Preview' });
    expect(view.querySelector(tag)).toBeNull();
    expect(view.querySelector('[onerror], [onclick], [href], [src]')).toBeNull();
    expect(view.textContent).not.toBe('');
  });

  it('handles empty and odd input without throwing', () => {
    render(<Markdown label="Preview" source={'**\n*\n`\n[](\n```\nunclosed'} />);
    expect(screen.getByRole('region', { name: 'Preview' })).toBeInTheDocument();
  });
});
