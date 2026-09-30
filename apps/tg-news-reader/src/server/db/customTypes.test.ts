import { describe, expect, it } from 'vitest';
import {
  numberArrayFromDriver,
  numberArrayToDriver,
  stringArrayFromDriver,
  stringArrayToDriver,
} from './customTypes.js';

describe('jsonStringArray', () => {
  it('serialises string array to JSON', () => {
    expect(stringArrayToDriver(['a', 'b', 'c'])).toBe('["a","b","c"]');
  });

  it('serialises empty array', () => {
    expect(stringArrayToDriver([])).toBe('[]');
  });

  it('deserialises JSON string to array', () => {
    expect(stringArrayFromDriver('["x","y"]')).toEqual(['x', 'y']);
  });

  it('deserialises empty JSON array', () => {
    expect(stringArrayFromDriver('[]')).toEqual([]);
  });

  it('handles already-parsed array (bypass case)', () => {
    expect(stringArrayFromDriver(['already', 'parsed'] as unknown as string)).toEqual(['already', 'parsed']);
  });
});

describe('jsonNumberArray', () => {
  it('serialises number array to JSON', () => {
    expect(numberArrayToDriver([1, 2, 3])).toBe('[1,2,3]');
  });

  it('serialises empty array', () => {
    expect(numberArrayToDriver([])).toBe('[]');
  });

  it('deserialises JSON string to number array', () => {
    expect(numberArrayFromDriver('[10,20,30]')).toEqual([10, 20, 30]);
  });

  it('handles already-parsed array (bypass case)', () => {
    expect(numberArrayFromDriver([1, 2] as unknown as string)).toEqual([1, 2]);
  });
});
