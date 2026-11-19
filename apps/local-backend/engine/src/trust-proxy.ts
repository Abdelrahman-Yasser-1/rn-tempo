import { BlockList, isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

/** `--trust-proxy` with no value: the loopback and private ranges, which is where a proxy on the Docker network sits. */
export const PRIVATE_RANGES = ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '::1/128', 'fc00::/7'];

export interface Client {
  /** The address the request came from: the socket's, or (behind a trusted proxy) the one the proxy reports. */
  ip: string;
  /** Whether the browser used HTTPS: only a trusted proxy can say so (`X-Forwarded-Proto`). */
  https: boolean;
}

const strip = (address: string): string => (address.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address);

/**
 * Which peers are trusted to set `X-Forwarded-For` and `X-Forwarded-Proto`. A request from any other address has
 * those headers ignored, so a client reaching the server directly cannot claim to be on HTTPS or to be someone else.
 */
export class ProxyTrust {
  private readonly list = new BlockList();
  readonly enabled: boolean;

  /** `entries` are addresses or CIDR ranges (`10.0.0.0/8`, `::1`); `private` stands for `PRIVATE_RANGES`. */
  constructor(entries: readonly string[]) {
    this.enabled = entries.length > 0;
    for (const entry of entries.flatMap((item) => (item === 'private' ? PRIVATE_RANGES : [item]))) {
      const [address = '', bits] = entry.split('/');
      const family = isIP(address);
      if (family === 0 || (bits !== undefined && !/^\d{1,3}$/.test(bits))) throw new Error(`"${entry}" is not an address or a range such as 10.0.0.0/8.`);
      if (bits === undefined) this.list.addAddress(address, family === 4 ? 'ipv4' : 'ipv6');
      else this.list.addSubnet(address, Number(bits), family === 4 ? 'ipv4' : 'ipv6');
    }
  }

  private trusts(address: string): boolean {
    const clean = strip(address);
    const family = isIP(clean);
    return family !== 0 && this.list.check(clean, family === 4 ? 'ipv4' : 'ipv6');
  }

  client(req: IncomingMessage): Client {
    const peer = strip(req.socket.remoteAddress ?? '');
    if (!this.enabled || !this.trusts(peer)) return { ip: peer === '' ? 'unknown' : peer, https: false };
    const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]?.trim().toLowerCase();
    // Walk the chain from the right: the first address that is not one of our proxies is the client.
    const chain = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')
      .map((part) => strip(part.trim()))
      .filter((part) => isIP(part) !== 0);
    let ip = peer;
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      ip = chain[i] ?? ip;
      if (!this.trusts(ip)) break;
    }
    return { ip, https: proto === 'https' };
  }
}
