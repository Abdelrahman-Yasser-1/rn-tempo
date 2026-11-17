import type { ServerInfo } from '../client/types';

export interface CertSummary {
  /** One line for the status row. */
  text: string;
  tone: 'ok' | 'warn' | 'bad';
}

const DAY_MS = 86_400_000;

/** The certificate state in words, from the files on disk and (when the server runs) its own report. */
export function summarizeCert(files: { hasCert: boolean }, info: ServerInfo | undefined, now = Date.now()): CertSummary {
  if (!files.hasCert) return { text: 'No certificate yet. Create one to serve HTTPS.', tone: 'bad' };
  if (info === undefined) return { text: 'A certificate exists. Start the server to see its expiry and whether it covers your LAN address.', tone: 'ok' };
  if (info.scheme !== 'https') return { text: 'A certificate exists, but this server was started without HTTPS. Stop it and start it again.', tone: 'warn' };
  const notAfter = info.cert.notAfter === undefined ? undefined : Date.parse(info.cert.notAfter);
  if (notAfter !== undefined && notAfter < now) return { text: `Expired on ${new Date(notAfter).toLocaleDateString()}. Recreate it.`, tone: 'bad' };
  const parts = ['Valid'];
  if (notAfter !== undefined) parts.push(`until ${new Date(notAfter).toLocaleDateString()} (${Math.round((notAfter - now) / DAY_MS)} days)`);
  if (info.cert.coversLanIp === false) return { text: `${parts.join(' ')}, but it does not cover your current LAN address. Recreate it, then restart the server.`, tone: 'warn' };
  if (info.cert.coversLanIp === true) parts.push('and covers your LAN address');
  return { text: `${parts.join(' ')}.`, tone: 'ok' };
}

/** The address a phone opens to download the public CA, when the server is on HTTPS and on the LAN. */
export function caDownloadUrl(info: ServerInfo | undefined): string | null {
  if (info?.scheme !== 'https' || info.urls.lan === undefined) return null;
  return `${info.urls.lan}/__tempo/ca.pem`;
}
