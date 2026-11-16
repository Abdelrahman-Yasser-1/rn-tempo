import type { Faker } from '@faker-js/faker';

/** Thrown for regex features the sampler does not model (lookarounds, backreferences). */
export class UnsupportedRegexError extends Error {}

const MAX_REPEAT = 5;
const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
const DIGITS = '0123456789'.split('');
const WORD = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'];

type Node =
  | { kind: 'chars'; chars: string[] }
  | { kind: 'seq'; items: Node[] }
  | { kind: 'alt'; options: Node[] }
  | { kind: 'repeat'; node: Node; min: number; max: number };

function escapeSet(char: string): string[] | undefined {
  switch (char) {
    case 'd': return DIGITS;
    case 'D': return PRINTABLE.filter((c) => !DIGITS.includes(c));
    case 'w': return WORD;
    case 'W': return PRINTABLE.filter((c) => !WORD.includes(c));
    case 's': return [' '];
    case 'S': return PRINTABLE.filter((c) => c !== ' ');
    default: return undefined;
  }
}

class Parser {
  private index = 0;
  private readonly source: string;
  constructor(source: string) {
    this.source = source;
  }

  parse(): Node {
    const node = this.alternation();
    if (this.index < this.source.length) throw new UnsupportedRegexError(`unexpected ${this.source[this.index]}`);
    return node;
  }

  private peek(): string | undefined {
    return this.source[this.index];
  }

  private alternation(): Node {
    const options: Node[] = [this.sequence()];
    while (this.peek() === '|') {
      this.index++;
      options.push(this.sequence());
    }
    return options.length === 1 ? (options[0] as Node) : { kind: 'alt', options };
  }

  private sequence(): Node {
    const items: Node[] = [];
    for (let c = this.peek(); c !== undefined && c !== '|' && c !== ')'; c = this.peek()) {
      const atom = this.atom();
      if (atom !== undefined) items.push(this.quantified(atom));
    }
    return { kind: 'seq', items };
  }

  private quantified(node: Node): Node {
    const c = this.peek();
    let min: number;
    let max: number;
    if (c === '*') [min, max] = [0, MAX_REPEAT];
    else if (c === '+') [min, max] = [1, MAX_REPEAT];
    else if (c === '?') [min, max] = [0, 1];
    else if (c === '{') {
      const end = this.source.indexOf('}', this.index);
      const match = /^\{(\d+)(,(\d*))?\}$/.exec(this.source.slice(this.index, end + 1));
      if (end < 0 || match === null) return node;
      min = Number(match[1]);
      max = match[2] === undefined ? min : match[3] === '' ? min + MAX_REPEAT : Number(match[3]);
      this.index = end;
    } else return node;
    this.index++;
    if (this.peek() === '?') this.index++; // lazy quantifiers sample the same set
    return { kind: 'repeat', node, min, max };
  }

  private atom(): Node | undefined {
    const c = this.source[this.index++] as string;
    if (c === '^' || c === '$') return undefined;
    if (c === '.') return { kind: 'chars', chars: PRINTABLE };
    if (c === '(') {
      if (this.peek() === '?') {
        const kind = this.source.slice(this.index, this.index + 2);
        if (kind !== '?:') throw new UnsupportedRegexError(`group ${kind}`);
        this.index += 2;
      }
      const node = this.alternation();
      if (this.peek() !== ')') throw new UnsupportedRegexError('unclosed group');
      this.index++;
      return node;
    }
    if (c === '[') return this.charClass();
    if (c === '\\') return this.escape();
    return { kind: 'chars', chars: [c] };
  }

  private escape(): Node | undefined {
    const c = this.source[this.index++] as string;
    if (c === 'b' || c === 'B') return undefined;
    if (/[1-9]/.test(c) || c === 'k') throw new UnsupportedRegexError('backreference');
    const set = escapeSet(c);
    if (set !== undefined) return { kind: 'chars', chars: set };
    return { kind: 'chars', chars: [c === 'n' ? '\n' : c === 't' ? '\t' : c] };
  }

  private charClass(): Node {
    let negate = false;
    if (this.peek() === '^') {
      negate = true;
      this.index++;
    }
    const chars: string[] = [];
    while (this.peek() !== ']') {
      if (this.peek() === undefined) throw new UnsupportedRegexError('unclosed class');
      let c = this.source[this.index++] as string;
      if (c === '\\') {
        c = this.source[this.index++] as string;
        const set = escapeSet(c);
        if (set !== undefined) {
          chars.push(...set);
          continue;
        }
      }
      if (this.peek() === '-' && this.source[this.index + 1] !== ']' && this.source[this.index + 1] !== undefined) {
        this.index++;
        const to = this.source[this.index++] as string;
        for (let code = c.charCodeAt(0); code <= to.charCodeAt(0); code++) chars.push(String.fromCharCode(code));
      } else chars.push(c);
    }
    this.index++;
    return { kind: 'chars', chars: negate ? PRINTABLE.filter((p) => !chars.includes(p)) : chars };
  }
}

function emit(node: Node, faker: Faker): string {
  switch (node.kind) {
    case 'chars':
      if (node.chars.length === 0) throw new UnsupportedRegexError('empty class');
      return faker.helpers.arrayElement(node.chars);
    case 'seq':
      return node.items.map((item) => emit(item, faker)).join('');
    case 'alt':
      return emit(faker.helpers.arrayElement(node.options), faker);
    case 'repeat': {
      const count = faker.number.int({ min: node.min, max: Math.max(node.min, node.max) });
      return Array.from({ length: count }, () => emit(node.node, faker)).join('');
    }
  }
}

/**
 * Produces a string that matches a simple regex. Covers literals, classes, `\d\w\s`, groups,
 * alternation and quantifiers, which is what validation patterns use. Throws
 * `UnsupportedRegexError` for the rest, so callers can fall back to another strategy.
 */
export function sampleRegex(source: string, faker: Faker): string {
  return emit(new Parser(source).parse(), faker);
}
