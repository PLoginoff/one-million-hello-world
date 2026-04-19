/**
 * Date Utilities
 * 
 * Utility functions for date manipulation.
 */

export class DateUtils {
  /**
   * Formats date to ISO string
   */
  static toISOString(date: Date): string {
    return date.toISOString();
  }

  /**
   * Formats date to locale string
   */
  static toLocaleString(date: Date, locale: string = 'en-US'): string {
    return date.toLocaleString(locale);
  }

  /**
   * Formats date to locale date string
   */
  static toLocaleDateString(date: Date, locale: string = 'en-US'): string {
    return date.toLocaleDateString(locale);
  }

  /**
   * Formats date to locale time string
   */
  static toLocaleTimeString(date: Date, locale: string = 'en-US'): string {
    return date.toLocaleTimeString(locale);
  }

  /**
   * Parses date from string
   */
  static parse(dateString: string): Date {
    return new Date(dateString);
  }

  /**
   * Gets current timestamp
   */
  static now(): number {
    return Date.now();
  }

  /**
   * Creates date from timestamp
   */
  static fromTimestamp(timestamp: number): Date {
    return new Date(timestamp);
  }

  /**
   * Adds days to date
   */
  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Adds hours to date
   */
  static addHours(date: Date, hours: number): Date {
    const result = new Date(date);
    result.setHours(result.getHours() + hours);
    return result;
  }

  /**
   * Adds minutes to date
   */
  static addMinutes(date: Date, minutes: number): Date {
    const result = new Date(date);
    result.setMinutes(result.getMinutes() + minutes);
    return result;
  }

  /**
   * Adds seconds to date
   */
  static addSeconds(date: Date, seconds: number): Date {
    const result = new Date(date);
    result.setSeconds(result.getSeconds() + seconds);
    return result;
  }

  /**
   * Adds milliseconds to date
   */
  static addMilliseconds(date: Date, milliseconds: number): Date {
    const result = new Date(date);
    result.setMilliseconds(result.getMilliseconds() + milliseconds);
    return result;
  }

  /**
   * Subtracts days from date
   */
  static subtractDays(date: Date, days: number): Date {
    return this.addDays(date, -days);
  }

  /**
   * Subtracts hours from date
   */
  static subtractHours(date: Date, hours: number): Date {
    return this.addHours(date, -hours);
  }

  /**
   * Subtracts minutes from date
   */
  static subtractMinutes(date: Date, minutes: number): Date {
    return this.addMinutes(date, -minutes);
  }

  /**
   * Gets difference in days between two dates
   */
  static diffDays(date1: Date, date2: Date): number {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round((date2.getTime() - date1.getTime()) / oneDay);
  }

  /**
   * Gets difference in hours between two dates
   */
  static diffHours(date1: Date, date2: Date): number {
    const oneHour = 60 * 60 * 1000;
    return Math.round((date2.getTime() - date1.getTime()) / oneHour);
  }

  /**
   * Gets difference in minutes between two dates
   */
  static diffMinutes(date1: Date, date2: Date): number {
    const oneMinute = 60 * 1000;
    return Math.round((date2.getTime() - date1.getTime()) / oneMinute);
  }

  /**
   * Gets difference in seconds between two dates
   */
  static diffSeconds(date1: Date, date2: Date): number {
    const oneSecond = 1000;
    return Math.round((date2.getTime() - date1.getTime()) / oneSecond);
  }

  /**
   * Checks if date is in the past
   */
  static isPast(date: Date): boolean {
    return date < new Date();
  }

  /**
   * Checks if date is in the future
   */
  static isFuture(date: Date): boolean {
    return date > new Date();
  }

  /**
   * Checks if date is today
   */
  static isToday(date: Date): boolean {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }

  /**
   * Checks if date is yesterday
   */
  static isYesterday(date: Date): boolean {
    const yesterday = this.addDays(new Date(), -1);
    return (
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear()
    );
  }

  /**
   * Checks if date is tomorrow
   */
  static isTomorrow(date: Date): boolean {
    const tomorrow = this.addDays(new Date(), 1);
    return (
      date.getDate() === tomorrow.getDate() &&
      date.getMonth() === tomorrow.getMonth() &&
      date.getFullYear() === tomorrow.getFullYear()
    );
  }

  /**
   * Gets start of day
   */
  static startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  /**
   * Gets end of day
   */
  static endOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  /**
   * Gets start of week
   */
  static startOfWeek(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = result.getDate() - day + (day === 0 ? -6 : 1);
    result.setDate(diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  /**
   * Gets end of week
   */
  static endOfWeek(date: Date): Date {
    const result = this.startOfWeek(date);
    result.setDate(result.getDate() + 6);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  /**
   * Gets start of month
   */
  static startOfMonth(date: Date): Date {
    const result = new Date(date);
    result.setDate(1);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  /**
   * Gets end of month
   */
  static endOfMonth(date: Date): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + 1);
    result.setDate(0);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  /**
   * Gets start of year
   */
  static startOfYear(date: Date): Date {
    const result = new Date(date);
    result.setMonth(0, 1);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  /**
   * Gets end of year
   */
  static endOfYear(date: Date): Date {
    const result = new Date(date);
    result.setMonth(11, 31);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  /**
   * Formats date to custom format
   */
  static format(date: Date, format: string): string {
    const map: Record<string, string> = {
      YYYY: date.getFullYear().toString(),
      MM: String(date.getMonth() + 1).padStart(2, '0'),
      DD: String(date.getDate()).padStart(2, '0'),
      HH: String(date.getHours()).padStart(2, '0'),
      mm: String(date.getMinutes()).padStart(2, '0'),
      ss: String(date.getSeconds()).padStart(2, '0'),
      SSS: String(date.getMilliseconds()).padStart(3, '0'),
    };

    return format.replace(/YYYY|MM|DD|HH|mm|ss|SSS/g, match => map[match]);
  }

  /**
   * Checks if date is valid
   */
  static isValid(date: Date): boolean {
    return date instanceof Date && !isNaN(date.getTime());
  }

  /**
   * Gets timezone offset in minutes
   */
  static getTimezoneOffset(date: Date): number {
    return date.getTimezoneOffset();
  }
}
