/**
 * JSON Content Negotiator
 * 
 * Handles JSON content type negotiation.
 */

import { BaseContentNegotiator } from './BaseContentNegotiator';
import { ContentType } from '../types/serialization-types';

export class JSONNegotiator extends BaseContentNegotiator {
  constructor() {
    super(10);
  }

  getSupportedContentTypes(): ContentType[] {
    return [ContentType.JSON];
  }

  protected _canHandle(type: string): boolean {
    return type.includes('application/json') || type.includes('text/json') || type === '*/*';
  }

  protected _mapToContentType(type: string): ContentType {
    return ContentType.JSON;
  }

  protected _getDefaultContentType(): ContentType {
    return ContentType.JSON;
  }
}
