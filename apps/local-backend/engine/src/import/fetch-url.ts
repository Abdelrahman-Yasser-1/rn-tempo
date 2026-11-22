import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

import { DefinitionError } from '../schema.ts';

import { MAX_IMPORT_BYTES } from './openapi.ts';

export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_REDIRECTS = 3;

export type Lookup = (hostname: string) => Promise<string[]>;

export interface FetchOptions {
  /** Allow addresses on private networks, loopback and link-local. True on a desktop or local web backend, false on a team server (SSRF guard). */
  allowPrivate: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  /** Resolves a host name to its addresses. Tests pass a fake. */
  resolve?: Lookup;
}

export const defaultResolve: Lookup = (hostname) =>
  new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses: LookupAddress[]) => {
      if (error !== null) reject(error);
      else resolve(addresses.map((entry) => entry.address));
    });
  });

function v4Parts(address: string): number[] | undefined {
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : undefined;
}

/** True for loopback, private, link-local, carrier-grade NAT, multicast, reserved and unspecified addresses (v4 and v6). */
export function isPrivateAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, '').split('%')[0] ?? '';
  const kind = isIP(bare);
  if (kind === 4) {
    const [a = 0, b = 0, c = 0] = v4Parts(bare) ?? [];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (kind === 6) {
    const lower = bare.toLowerCase();
    const mapped = /^(?:0{0,4}:){0,4}(?:0{0,4}:)?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower) ?? /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped?.[1] !== undefined) return isPrivateAddress(mapped[1]);
    const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
    if (hexMapped !== null) {
      const hi = parseInt(hexMapped[1] ?? '0', 16);
      const lo = parseInt(hexMapped[2] ?? '0', 16);
      return isPrivateAddress(`${String(hi >> 8)}.${String(hi & 255)}.${String(lo >> 8)}.${String(lo & 255)}`);
    }
    return lower === '::' || lower === '::1' || /^fe[89ab]/.test(lower) || /^f[cd]/.test(lower) || /^ff/.test(lower) || lower.startsWith('64:ff9b:') || lower.startsWith('2001:db8');
  }
  return true;
}

const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** The URL, or a refusal saying why it may not be fetched: scheme, credentials, and a literal private address on a team server. */
export function checkImportUrl(raw: string, allowPrivate: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DefinitionError('That is not a valid URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new DefinitionError('Only https: URLs can be imported (http: only for localhost).');
  if (url.username !== '' || url.password !== '') throw new DefinitionError('A URL with a user name or password is not accepted.');
  const host = url.hostname.toLowerCase();
  const loopback = LOOPBACK_NAMES.has(host) || host.endsWith('.localhost');
  if (url.protocol === 'http:' && !loopback) throw new DefinitionError('Only https: URLs can be imported (http: only for localhost).');
  if (!allowPrivate && (loopback || (isIP(host.replace(/^\[|\]$/g, '')) !== 0 && isPrivateAddress(host)))) {
    throw new DefinitionError('This server does not fetch addresses on a private network (the local machine, 10.x, 192.168.x, link-local...). Upload the file instead, or ask the owner to allow private import URLs.');
  }
  return url;
}

/** Resolves the host and refuses when any answer is private (unless allowed). Returns an address to connect to. */
async function safeAddress(url: URL, options: FetchOptions): Promise<string | undefined> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) return host;
  let addresses: string[];
  try {
    addresses = await (options.resolve ?? defaultResolve)(host);
  } catch {
    throw new DefinitionError(`Could not find the host ${url.hostname}.`);
  }
  if (addresses.length === 0) throw new DefinitionError(`Could not find the host ${url.hostname}.`);
  if (!options.allowPrivate && addresses.some(isPrivateAddress)) {
    throw new DefinitionError('This server does not fetch addresses on a private network. Upload the file instead, or ask the owner to allow private import URLs.');
  }
  return addresses[0];
}

interface Got {
  status: number;
  location: string | undefined;
  text: string;
}

function once(url: URL, address: string | undefined, options: Required<Pick<FetchOptions, 'timeoutMs' | 'maxBytes'>>): Promise<Got> {
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    // The connection goes to the address that was checked, and TLS still verifies the host name of the URL.
    const request = send(
      {
        protocol: url.protocol,
        hostname: address ?? url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port === '' ? undefined : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: { host: url.host, accept: 'application/json, application/yaml, text/yaml, text/plain, */*;q=0.5', 'accept-encoding': 'identity', 'user-agent': 'tempo-local-backend-import' },
        ...(url.protocol === 'https:' ? { servername: url.hostname.replace(/^\[|\]$/g, '') } : {}),
      },
      (response: IncomingMessage) => {
        const status = response.statusCode ?? 0;
        const location = typeof response.headers.location === 'string' ? response.headers.location : undefined;
        if (status >= 300 && status < 400) {
          response.resume();
          resolve({ status, location, text: '' });
          return;
        }
        const length = Number(response.headers['content-length']);
        if (Number.isFinite(length) && length > options.maxBytes) {
          response.destroy();
          reject(new DefinitionError('That file is larger than 10 MB.'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            response.destroy();
            reject(new DefinitionError('That file is larger than 10 MB.'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => resolve({ status, location: undefined, text: Buffer.concat(chunks).toString('utf8') }));
        response.on('error', () => reject(new DefinitionError('The download was interrupted.')));
      },
    );
    const timer = setTimeout(() => {
      request.destroy();
      reject(new DefinitionError(`The server did not answer within ${String(Math.round(options.timeoutMs / 1000))} seconds.`));
    }, options.timeoutMs);
    request.on('error', (error) => {
      clearTimeout(timer);
      reject(error instanceof DefinitionError ? error : new DefinitionError(`Could not fetch the file: ${error.message}`));
    });
    request.on('close', () => clearTimeout(timer));
    request.end();
  });
}

/**
 * Downloads an API file. Only `https:` (and `http:` for localhost), at most 10 MB, 15 seconds for the whole download and
 * 3 redirects, each one checked again like the first URL. On a team server (`allowPrivate: false`) a host that is, or
 * resolves to, a private or link-local address is refused, and the connection goes to the address that was checked.
 */
export async function fetchApiFile(raw: string, options: FetchOptions): Promise<{ text: string; url: string }> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_IMPORT_BYTES;
  const deadline = Date.now() + timeoutMs;
  let url = checkImportUrl(raw, options.allowPrivate);
  for (let hop = 0; ; hop += 1) {
    const address = await safeAddress(url, options);
    const left = Math.max(1, deadline - Date.now());
    const got = await once(url, address, { timeoutMs: left, maxBytes });
    if (got.status >= 300 && got.status < 400) {
      if (got.location === undefined) throw new DefinitionError(`The server redirected (${String(got.status)}) without saying where.`);
      if (hop >= MAX_REDIRECTS) throw new DefinitionError(`The address redirected more than ${String(MAX_REDIRECTS)} times.`);
      let next: string;
      try {
        next = new URL(got.location, url).toString();
      } catch {
        throw new DefinitionError('The server redirected to an address that is not a URL.');
      }
      url = checkImportUrl(next, options.allowPrivate);
      continue;
    }
    if (got.status !== 200) throw new DefinitionError(`The server answered ${String(got.status)}; expected the file.`);
    return { text: got.text, url: url.toString() };
  }
}
