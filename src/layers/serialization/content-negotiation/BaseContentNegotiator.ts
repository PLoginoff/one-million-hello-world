/**
 * Base Content Negotiator
 * 
 * Abstract base class for content negotiators implementing Chain of Responsibility pattern.
 */

import { IContentNegotiator } from './IContentNegotiator';
import { ContentType } from '../types/serialization-types';

export abstract class BaseContentNegotiator implements IContentNegotiator {
  private _next: IContentNegotiator | null = null;
  private readonly _priority: number;

  constructor(priority: number = 100) {
    this._priority = priority;
  }

  setNext(next: IContentNegotiator): IContentNegotiator {
    this._next = next;
    return next;
  }

  getPriority(): number {
    return this._priority;
  }

  abstract getSupportedContentTypes(): ContentType[];

  negotiate(acceptHeader: string): ContentType {
    const parsedTypes = this._parseAcceptHeader(acceptHeader);
    
    for (const { type, q } of parsedTypes) {
      if (this._canHandle(type)) {
        return this._mapToContentType(type);
      }
    }

    if (this._next) {
      return this._next.negotiate(acceptHeader);
    }

    return this._getDefaultContentType();
  }

  protected abstract _canHandle(type: string): boolean;
  protected abstract _mapToContentType(type: string): ContentType;
  protected abstract _getDefaultContentType(): ContentType;

  private _parseAcceptHeader(acceptHeader: string): Array<{ type: string; q: number }> {
    const types = acceptHeader.split(',').map((t) => t.trim());
    const parsed: Array<{ type: string; q: number }> = [];

    for (const type of types) {
      const [mimeType, qValue] = type.split(';');
      const q = qValue ? parseFloat(qValue.replace('q=', '')) : 1.0;
      parsed.push({ type: mimeType.trim(), q });
    }

    return parsed.sort((a, b) => b.q - a.q);
  }
}
