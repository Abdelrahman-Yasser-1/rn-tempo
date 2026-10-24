import { formatName } from './formatName';

describe('formatName', () => {
  it('AC-1: prefixes the name', () => {
    expect(formatName('a')).toContain(':a');
  });
});
