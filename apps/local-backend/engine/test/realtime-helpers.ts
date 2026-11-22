import type { BackendInput } from '../src/schema.ts';

export interface SseFrame {
  id?: string;
  event?: string;
  data?: string;
  retry?: string;
  comment?: string;
}

/** Parses an event stream by the WHATWG rules: lines end in LF, CRLF or CR, a blank line ends an event, `:` starts a comment. */
export function parseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  let rest = buffer;
  for (;;) {
    const end = /\r\n\r\n|\n\n|\r\r/.exec(rest);
    if (end === null) break;
    const block = rest.slice(0, end.index);
    rest = rest.slice(end.index + end[0].length);
    const frame: SseFrame = {};
    const data: string[] = [];
    for (const line of block.split(/\r\n|\n|\r/)) {
      if (line.startsWith(':')) frame.comment = line.slice(1).trim();
      else {
        const at = line.indexOf(':');
        const name = at < 0 ? line : line.slice(0, at);
        const value = at < 0 ? '' : line.slice(at + 1).replace(/^ /, '');
        if (name === 'data') data.push(value);
        else if (name === 'id' || name === 'event' || name === 'retry') frame[name] = value;
      }
    }
    if (data.length > 0) frame.data = data.join('\n');
    frames.push(frame);
  }
  return { frames, rest };
}

export interface SseStream {
  status: number;
  headers: Headers;
  /** The next event (comments are skipped unless `comments`). Rejects after `ms`. */
  next(ms?: number, comments?: boolean): Promise<SseFrame>;
  close(): void;
  /** Resolves when the server ends the stream. */
  ended: Promise<void>;
}

export async function openSse(url: string, headers: Record<string, string> = {}): Promise<SseStream> {
  const controller = new AbortController();
  const response = await fetch(url, { headers: { accept: 'text/event-stream', ...headers }, signal: controller.signal });
  const queue: SseFrame[] = [];
  const waiting: ((frame: SseFrame | undefined) => void)[] = [];
  let finished = false;
  let resolveEnded: () => void = () => undefined;
  const ended = new Promise<void>((done) => {
    resolveEnded = done;
  });
  const finish = (): void => {
    finished = true;
    for (const waiter of waiting.splice(0)) waiter(undefined);
    resolveEnded();
  };
  if (response.body === null) {
    finish();
  } else {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    void (async (): Promise<void> => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseFrames(buffer);
          buffer = parsed.rest;
          for (const frame of parsed.frames) {
            const waiter = waiting.shift();
            if (waiter === undefined) queue.push(frame);
            else waiter(frame);
          }
        }
      } catch {
        // aborted
      }
      finish();
    })();
  }
  return {
    status: response.status,
    headers: response.headers,
    next(ms = 3000, comments = false) {
      return new Promise<SseFrame>((resolve, reject) => {
        const take = (): boolean => {
          for (;;) {
            const frame = queue.shift();
            if (frame === undefined) return false;
            if (frame.comment !== undefined && frame.data === undefined && !comments) continue;
            resolve(frame);
            return true;
          }
        };
        if (take()) return;
        if (finished) return reject(new Error('the stream ended'));
        const timer = setTimeout(() => {
          const at = waiting.indexOf(again);
          if (at >= 0) waiting.splice(at, 1);
          reject(new Error(`no event within ${String(ms)} ms`));
        }, ms);
        const again = (frame: SseFrame | undefined): void => {
          if (frame === undefined) {
            clearTimeout(timer);
            reject(new Error('the stream ended'));
            return;
          }
          if (frame.comment !== undefined && frame.data === undefined && !comments) {
            waiting.push(again);
            return;
          }
          clearTimeout(timer);
          resolve(frame);
        };
        waiting.push(again);
      });
    },
    close: () => controller.abort(),
    ended,
  };
}

export const endpoints = (list: unknown[]): NonNullable<BackendInput['endpoints']> => list as NonNullable<BackendInput['endpoints']>;
