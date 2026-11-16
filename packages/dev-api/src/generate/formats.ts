import type { Faker } from '@faker-js/faker';

/** Wraps a UTC date in the shapes `z.iso.datetime()` variants accept (offset, local, precision). */
function datetimeVariants(faker: Faker): string[] {
  const iso = faker.date.past({ years: 2 }).toISOString();
  return [iso, iso.replace(/\.\d+Z$/, 'Z'), iso.replace(/Z$/, ''), iso.replace(/\.\d+Z$/, ''), iso.replace(/Z$/, '+00:00')];
}

const base64url = (text: string): string => Buffer.from(text).toString('base64url');

/**
 * Plausible values for a Zod string format name (`z.email()`, `z.uuid()`, `z.iso.datetime()`).
 * Several candidates are returned when variants differ (with or without a timezone); the caller
 * keeps the first the schema accepts. An empty list means the format is unknown here.
 */
export function formatCandidates(format: string, faker: Faker): string[] {
  switch (format) {
    case 'email':
      return [faker.internet.email().toLowerCase()];
    case 'url':
    case 'uri':
    case 'httpurl':
      return [faker.internet.url()];
    case 'uuid':
    case 'guid':
    case 'uuidv4':
      return [faker.string.uuid()];
    case 'uuidv6':
    case 'uuidv7':
      return [faker.string.uuid().replace(/^(.{14})4/, `$1${format === 'uuidv6' ? '6' : '7'}`)];
    case 'datetime':
      return datetimeVariants(faker);
    case 'date':
      return [faker.date.past({ years: 2 }).toISOString().slice(0, 10)];
    case 'time':
      return [faker.date.past().toISOString().slice(11, 19), faker.date.past().toISOString().slice(11, 23)];
    case 'duration':
      return [`PT${faker.number.int({ min: 1, max: 12 })}H`];
    case 'ipv4':
      return [faker.internet.ipv4()];
    case 'ipv6':
      return [faker.internet.ipv6()];
    case 'cidrv4':
      return [`${faker.internet.ipv4()}/${faker.number.int({ min: 8, max: 32 })}`];
    case 'cidrv6':
      return [`${faker.internet.ipv6()}/${faker.number.int({ min: 16, max: 128 })}`];
    case 'mac':
      return [faker.internet.mac()];
    case 'base64':
      return [Buffer.from(faker.lorem.words(3)).toString('base64')];
    case 'base64url':
      return [base64url(faker.lorem.words(3))];
    case 'e164':
      return [`+1${faker.string.numeric({ length: 10, allowLeadingZeros: false })}`];
    case 'nanoid':
      return [faker.string.nanoid(21)];
    case 'ulid':
      return [faker.string.ulid()];
    case 'cuid':
      return [`c${faker.string.alphanumeric({ length: 24, casing: 'lower' })}`];
    case 'cuid2':
      return [faker.string.alpha({ length: 1, casing: 'lower' }) + faker.string.alphanumeric({ length: 23, casing: 'lower' })];
    case 'xid':
      return [faker.string.alphanumeric({ length: 20, casing: 'lower' })];
    case 'ksuid':
      return [faker.string.alphanumeric({ length: 27 })];
    case 'emoji':
      return [faker.internet.emoji()];
    case 'jwt':
      return [`${base64url('{"alg":"HS256","typ":"JWT"}')}.${base64url('{"sub":"1"}')}.${base64url(faker.string.alphanumeric(16))}`];
    default:
      return [];
  }
}
