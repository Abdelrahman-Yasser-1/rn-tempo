import { pino, type DestinationStream, type Logger } from 'pino';

/**
 * Fixed paths that pino redacts itself. `redactDeep` covers bodies of any shape; these are the
 * second line of defence for the objects we log directly.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-tempo-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.otp',
  '*.code',
  '*.email',
  '*.phone',
  'password',
  'token',
  'refreshToken',
  'accessToken',
  'otp',
  'code',
  'email',
  'phone',
];

/** A pino logger that redacts secrets and personal data. Writes JSON lines to `destination`. */
export function createLogger(options: { level?: string; destination?: DestinationStream } = {}): Logger {
  return pino(
    {
      name: 'tempo-api',
      level: options.level ?? 'info',
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    },
    options.destination,
  );
}
