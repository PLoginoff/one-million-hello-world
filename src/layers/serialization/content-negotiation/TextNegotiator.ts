/**
 * Text Content Negotiator
 * 
 * Handles text content type negotiation.
 */

import { BaseContentNegotiator } from './BaseContentNegotiator';
import { ContentType } from '../types/serialization-types';

export class TextNegotiator extends BaseContentNegotiator {
  constructor() {
    super(30);
  }

  getSupportedContentTypes(): ContentType[] {
    return [ContentType.PLAIN_TEXT, ContentType.HTML];
  }

  protected _canHandle(type: string): boolean {
    return type.includes('text/plain') || type.includes('text/html');
  }

  protected _mapToContentType(type: string): ContentType {
    if (type.includes('text/html')) {
      return ContentType.HTML;
    }
    return ContentType.PLAIN_TEXT;
  }

  protected _getDefaultContentType(): ContentType {
    return ContentType.PLAIN_TEXT;
  }
}
