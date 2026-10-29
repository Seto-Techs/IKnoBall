import { describe, expect, it } from 'vitest';
import { isOperator, operatorIds } from './operator';

/**
 * Who may run `/status`.
 *
 * The load-bearing case is the first one: unset must mean nobody, because the
 * alternative — "unset means everyone" — publishes the bot's connection, database
 * counts, and queue depth to every server that has it.
 */
describe('operatorIds', () => {
  it('is empty when the variable is unset', () => {
    expect(operatorIds(undefined).size).toBe(0);
    expect(operatorIds('').size).toBe(0);
    expect(operatorIds('   ').size).toBe(0);
  });

  it('reads a comma-separated list, ignoring blanks and padding', () => {
    expect([...operatorIds(' 111 , 222 ,,333 ')]).toEqual(['111', '222', '333']);
  });

  it('does not treat a single id differently from a list', () => {
    expect([...operatorIds('999')]).toEqual(['999']);
  });
});

describe('isOperator', () => {
  it('fails closed: nobody is an operator while the allow-list is unset', () => {
    const allowList = operatorIds(undefined);

    expect(isOperator('123456789012345678', allowList)).toBe(false);
    expect(isOperator('', allowList)).toBe(false);
  });

  it('accepts exactly the ids on the list', () => {
    const allowList = operatorIds('111,222');

    expect(isOperator('111', allowList)).toBe(true);
    expect(isOperator('222', allowList)).toBe(true);
    expect(isOperator('333', allowList)).toBe(false);
    // A prefix of a listed id is not the listed id.
    expect(isOperator('11', allowList)).toBe(false);
  });
});
