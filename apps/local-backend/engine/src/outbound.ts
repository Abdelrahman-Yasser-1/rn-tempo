import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

import { defaultResolve, isPrivateAddress, type Lookup } from './import/fetch-url.ts';

/** The rules of calls the engine makes to an address somebody typed (webhooks, the inbox replay). Same SSRF rules as URL imports. */
export interface OutboundPolicy {
  /** Allow localhost, private, link-local addresses. True on a desktop or local web backend, false on a team server. */
  allowPrivate: boolean;
  /** Refuse `http:`. True on a team server unless `allowPrivate` is on. */
  requireHttps: boolean;
  /** Resolves a host name. Tests pass a fake. */
  resolve?: Lookup;
}

export class OutboundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundError';
  }
}

const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** The URL, or a refusal saying why it may not be called. */
export function checkOutboundUrl(raw: string, policy: OutboundPolicy): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OutboundError('That is not a valid URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new OutboundError('Only http: and https: URLs are called.');
  if (url.username !== '' || url.password !== '') throw new OutboundError('A URL with a user name or password is not accepted.');
  if (policy.requireHttps && url.protocol !== 'https:') throw new OutboundError('This server calls https: addresses only.');
  const host = url.hostname.toLowerCase();
  const bare = host.replace(/^\[|\]$/g, '');
  const loopback = LOOPBACK_NAMES.has(host) || host.endsWith('.localhost');
  if (!policy.allowPrivate && (loopback || (isIP(bare) !== 0 && isPrivateAddress(bare)))) {
    throw new OutboundError('This server does not call addresses on a private network (the local machine, 10.x, 192.168.x, link-local...).');
  }
  return url;
}

/** Resolves the host and refuses a private answer (unless allowed). Returns the address to connect to. */
async function safeAddress(url: URL, policy: OutboundPolicy): Promise<string> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) return host;
  let addresses: string[];
  try {
    addresses = await (policy.resolve ?? defaultResolve)(host);
  } catch {
    throw new OutboundError(`Could not find the host ${url.hostname}.`);
  }
  const first = addresses[0];
  if (first === undefined) throw new OutboundError(`Could not find the host ${url.hostname}.`);
  if (!policy.allowPrivate && addresses.some(isPrivateAddress)) throw new OutboundError('This server does not call addresses on a private network.');
  return first;
}

export interface OutboundRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Buffer | string;
  timeoutMs: number;
}

export interface OutboundResponse {
  status: number;
  /** The first 2 KB of the answer. */
  body: string;
}

/** Sends one request: it never follows a redirect, connects to the address that was checked, and keeps 2 KB of the answer. */
export type Transport = (request: OutboundRequest, policy: OutboundPolicy) => Promise<OutboundResponse>;

export const MAX_RESPONSE_BYTES = 2048;

export const httpTransport: Transport = async (input, policy) => {
  const url = checkOutboundUrl(input.url, policy);
  const address = await safeAddress(url, policy);
  return new Promise<OutboundResponse>((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const bytes = Buffer.from(input.body);
    const request = send(
      {
        protocol: url.protocol,
        hostname: address,
        port: url.port === '' ? undefined : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: input.method,
        headers: { ...input.headers, host: url.host, 'content-length': String(bytes.length) },
        ...(url.protocol === 'https:' ? { servername: url.hostname.replace(/^\[|\]$/g, '') } : {}),
      },
      (response: IncomingMessage) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') });
        };
        response.on('data', (chunk: Buffer) => {
          if (size < MAX_RESPONSE_BYTES) chunks.push(chunk.subarray(0, MAX_RESPONSE_BYTES - size));
          size += chunk.length;
          if (size >= MAX_RESPONSE_BYTES) {
            response.destroy();
            finish();
          }
        });
        response.on('end', finish);
        response.on('error', finish);
        response.on('close', finish);
      },
    );
    const timer = setTimeout(() => {
      request.destroy(new OutboundError(`No answer within ${String(Math.round(input.timeoutMs / 1000))} seconds.`));
    }, input.timeoutMs);
    request.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.on('close', () => clearTimeout(timer));
    request.end(bytes);
  });
};
