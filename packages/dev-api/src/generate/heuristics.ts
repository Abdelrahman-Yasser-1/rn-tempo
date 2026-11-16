import type { Faker } from '@faker-js/faker';

export type LeafKind = 'string' | 'number' | 'date';

/** `createdAt`, `created_at` and `CreatedAt` all become `createdat`. */
export function normalizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

type Producer = (faker: Faker) => unknown;

/** Values that look like the field they are named after. Checked against the schema by the caller. */
const STRING_HINTS: Record<string, Producer> = {
  email: (f) => f.internet.email().toLowerCase(),
  emailaddress: (f) => f.internet.email().toLowerCase(),
  phone: (f) => f.phone.number(),
  phonenumber: (f) => f.phone.number(),
  mobile: (f) => f.phone.number(),
  firstname: (f) => f.person.firstName(),
  lastname: (f) => f.person.lastName(),
  fullname: (f) => f.person.fullName(),
  name: (f) => f.person.fullName(),
  username: (f) => f.internet.username().toLowerCase(),
  gender: (f) => f.person.sex().toLowerCase(),
  image: (f) => f.image.url({ width: 640, height: 480 }),
  images: (f) => f.image.url({ width: 640, height: 480 }),
  thumbnail: (f) => f.image.url({ width: 160, height: 160 }),
  avatar: (f) => f.image.avatar(),
  photo: (f) => f.image.url({ width: 640, height: 480 }),
  picture: (f) => f.image.url({ width: 640, height: 480 }),
  title: (f) => f.commerce.productName(),
  description: (f) => f.commerce.productDescription(),
  category: (f) => f.commerce.department().toLowerCase(),
  brand: (f) => f.company.name(),
  company: (f) => f.company.name(),
  url: (f) => f.internet.url(),
  website: (f) => f.internet.url(),
  city: (f) => f.location.city(),
  country: (f) => f.location.country(),
  address: (f) => f.location.streetAddress(),
  street: (f) => f.location.streetAddress(),
  zip: (f) => f.location.zipCode(),
  zipcode: (f) => f.location.zipCode(),
  currency: (f) => f.finance.currencyCode(),
  password: (f) => f.internet.password(),
  message: (f) => f.lorem.sentence(),
  bio: (f) => f.lorem.sentences(2),
  color: (f) => f.color.human(),
};

const NUMBER_HINTS: Record<string, Producer> = {
  price: (f) => f.number.float({ min: 1, max: 999, fractionDigits: 2 }),
  rating: (f) => f.number.float({ min: 1, max: 5, fractionDigits: 1 }),
  stock: (f) => f.number.int({ min: 0, max: 500 }),
  quantity: (f) => f.number.int({ min: 1, max: 20 }),
  age: (f) => f.number.int({ min: 18, max: 80 }),
  discountpercentage: (f) => f.number.float({ min: 0, max: 30, fractionDigits: 2 }),
  weight: (f) => f.number.int({ min: 1, max: 50 }),
  latitude: (f) => f.location.latitude(),
  longitude: (f) => f.location.longitude(),
};

/** `createdAt`, `updatedAt`, `publishedAt` and the like. */
function isTimestampName(name: string): boolean {
  return /(at|date|time|on)$/.test(name) && /^(created|updated|deleted|published|modified|expires?|start|end|birth|sent|read|last)/.test(name);
}

/**
 * Candidate values for a field name, best first. Callers keep the first one the schema accepts, so
 * a hint that does not fit (a `price` string, a short `title`) falls back to plain generation.
 */
export function hintCandidates(rawName: string | undefined, kind: LeafKind, faker: Faker): unknown[] {
  if (rawName === undefined) return [];
  const name = normalizeName(rawName);
  if (kind === 'number') {
    const producer = NUMBER_HINTS[name];
    return producer === undefined ? [] : [producer(faker)];
  }
  if (isTimestampName(name)) {
    const date = name.startsWith('birth')
      ? faker.date.birthdate()
      : /^(expires?|start)/.test(name)
        ? faker.date.future({ years: 1 })
        : faker.date.past({ years: 2 });
    return kind === 'date' ? [date] : [date.toISOString(), date.toISOString().replace(/\.\d+Z$/, 'Z')];
  }
  if (kind === 'date') return [];
  const producer = STRING_HINTS[name];
  return producer === undefined ? [] : [producer(faker)];
}
