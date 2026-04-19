/**
 * Base Content Negotiator
 * 
 * Abstract base class providing common functionality for content negotiators.
 */

import { IContentNegotiator } from './IContentNegotiator';
import { ContentType } from '../types/serialization-types';

export abstract class BaseNegotiator implements IContentNegotiator {
  protected _name: string;
  protected _priority: number;
  protected _supportedTypes: ContentType[];
  protected _next?: IContentNegotiator;

  constructor(name: string, priority: number, supportedTypes: ContentType[]) {
    this._name = name;
    this._priority = priority;
    this._supportedTypes = supportedTypes;
  }

  abstract negotiate(acceptHeader: string): ContentType;

  getSupportedContentTypes(): ContentType[] {
    return [...this._supportedTypes];
  }

  getPriority(): number {
    return this._priority;
  }

  setPriority(priority: number): void {
    this._priority = priority;
  }

  setNext(negotiator: IContentNegotiator): IContentNegotiator {
    this._next = negotiator;
    return this._next;
  }

  getNext(): IContentNegotiator | undefined {
    return this._next;
  }

  /**
   * Gets negotiator name
   * 
   * @returns Negotiator name
   */
  getName(): string {
    return this._name;
  }

  /**
   * Adds a supported content type
   * 
   * @param contentType - Content type to add
   */
  addSupportedType(contentType: ContentType): void {
    if (!this._supportedTypes.includes(contentType)) {
      this._supportedTypes.push(contentType);
    }
  }

  /**
   * Removes a supported content type
   * 
   * @param contentType - Content type to remove
   */
  removeSupportedType(contentType: ContentType): void {
    const index = this._supportedTypes.indexOf(contentType);
    if (index > -1) {
      this._supportedTypes.splice(index, 1);
    }
  }

  /**
   * Checks if content type is supported
   * 
   * @param contentType - Content type to check
   * @returns True if supported
   */
  isSupported(contentType: ContentType): boolean {
    return this._supportedTypes.includes(contentType);
  }

  /**
   * Parses accept header into array of content types with priorities
   * 
   * @param acceptHeader - Accept header string
   * @returns Array of content types with q-values
   */
  protected _parseAcceptHeader(acceptHeader: string): Array<{ type: string; q: number }> {
    return acceptHeader
      .split(',')
      .map(part => {
        const [type, qPart] = part.trim().split(';');
        const q = qPart?.includes('q=') ? parseFloat(qPart.split('=')[1]) : 1.0;
        return { type: type.trim(), q: isNaN(q) ? 1.0 : q };
      })
      .sort((a, b) => b.q - a.q);
  }

  /**
   * Extracts the base type from content type (e.g., "application/json" -> "application")
   * 
   * @param contentType - Content type string
   * @returns Base type
   */
  protected _extractBaseType(contentType: string): string {
    return contentType.split('/')[0] || '*';
  }

  /**
   * Checks if accept header accepts a specific content type
   * 
   * @param acceptHeader - Accept header string
   * @param contentType - Content type to check
   * @returns True if accepted
   */
  protected _accepts(acceptHeader: string, contentType: string): boolean {
    if (acceptHeader === '*/*' || acceptHeader === contentType) {
      return true;
    }

    const acceptParts = acceptHeader.split('/');
    const contentParts = contentType.split('/');

    if (acceptParts[0] === '*' && acceptParts[1] === '*') {
      return true;
    }

    if (acceptParts[0] === contentParts[0] && acceptParts[1] === '*') {
      return true;
    }

    return acceptHeader === contentType;
  }
}
