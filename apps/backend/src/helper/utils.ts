/**
 * Common utility functions used across the application
 * These are pure functions with no dependencies - no need for NestJS modules
 */

import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

/**
 * Generate a random alphanumeric string (uppercase)
 * @param length Length of the string to generate
 * @returns Random string like "A1B2C3D4E5"
 */
export function generateRandomId(length: number = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Format a date to ISO string
 * @param date Date to format (defaults to now)
 * @returns ISO string representation
 */
export function formatDate(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * Check if a string is empty or null/undefined
 * @param value String to check
 * @returns true if empty, null, or undefined
 */
export function isEmpty(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

/**
 * Sleep/delay for a specified number of milliseconds
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Hash a password using bcrypt
 * @param password Password to hash
 * @returns Hashed password
 */
export function bcryptHash(password: string): string {
  return bcrypt.hashSync(password, 10);
}

/**
 * Compare a password with a hash using bcrypt
 * @param password Password to compare
 * @param hash Hash to compare
 * @returns true if the password matches the hash, false otherwise
 */
export function bcryptCompare(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

/**
 * Generate a random refresh token
 * @returns Random refresh token
 */
export function generateRefreshToken() {
  return randomBytes(48).toString('hex'); // ~96 char
}

export function toBoolean(val: any): boolean {
  if (val === true || val === false) return val;
  if (val === "true") return true;
  if (val === "false") return false;
  if (val === 1) return true;
  if (val === 0) return false;
  return Boolean(val);
}

/**
 * Parse a date string in dd-mm-yyyy format to a Date object
 * @param dateStr Date string in dd-mm-yyyy format
 * @returns Date object or null if invalid
 */
export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (isNaN(date.getTime())) return null;
  return date;
}

