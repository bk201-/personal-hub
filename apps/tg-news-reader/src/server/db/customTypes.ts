import { customType } from 'drizzle-orm/sqlite-core';

/** Serialize a string[] to JSON TEXT for SQLite. */
export function stringArrayToDriver(value: string[]): string {
  return JSON.stringify(value);
}

/** Deserialize a JSON TEXT (or already-parsed array) back to string[]. */
export function stringArrayFromDriver(value: string): string[] {
  return typeof value === 'string' ? (JSON.parse(value) as string[]) : (value as unknown as string[]);
}

/** Serialize a number[] to JSON TEXT for SQLite. */
export function numberArrayToDriver(value: number[]): string {
  return JSON.stringify(value);
}

/** Deserialize a JSON TEXT (or already-parsed array) back to number[]. */
export function numberArrayFromDriver(value: string): number[] {
  return typeof value === 'string' ? (JSON.parse(value) as number[]) : (value as unknown as number[]);
}

/**
 * SQLite TEXT column that auto-serializes/deserializes a JSON string array.
 * Stored as TEXT ('["a","b"]'), returned as string[].
 */
export const jsonStringArray = customType<{ data: string[]; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver: stringArrayToDriver,
  fromDriver: stringArrayFromDriver,
});

/**
 * SQLite TEXT column that auto-serializes/deserializes a JSON number array.
 * Stored as TEXT ('[1,2,3]'), returned as number[].
 */
export const jsonNumberArray = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver: numberArrayToDriver,
  fromDriver: numberArrayFromDriver,
});
