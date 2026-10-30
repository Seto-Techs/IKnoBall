import { describe, expect, it } from 'vitest';
import { hashUserId } from './user-hash';

/**
 * What a log line may say about a person.
 *
 * The property that matters is that the digest cannot be turned back into a
 * Discord id by enumerating ids — which is a property of the key, not of the
 * string, so it cannot be asserted here. What can be asserted is the shape: short,
 * hex, stable inside one process, different for different ids, and never the id
 * itself.
 */
describe('hashUserId', () => {
  it('is stable for the same id inside one process', () => {
    // A log is only useful if the same person is the same string on every line.
    expect(hashUserId('123456789012345678')).toBe(hashUserId('123456789012345678'));
  });

  it('differs for different ids', () => {
    expect(hashUserId('123456789012345678')).not.toBe(hashUserId('123456789012345679'));
  });

  it('is ten hex characters and nothing else', () => {
    expect(hashUserId('123456789012345678')).toMatch(/^[0-9a-f]{10}$/);
  });

  it('never contains the id it hashes', () => {
    const id = '123456789012345678';
    const hashed = hashUserId(id);

    // The digest is shorter than a snowflake, so a substring match is impossible —
    // which is the point: the log cannot be grepped for a raw id.
    expect(hashed).not.toBe(id);
    expect(hashed).not.toContain(id);
  });

  it('handles the empty string without throwing', () => {
    // Not a real id, but a malformed payload must not take the log line down.
    expect(hashUserId('')).toMatch(/^[0-9a-f]{10}$/);
  });
});
