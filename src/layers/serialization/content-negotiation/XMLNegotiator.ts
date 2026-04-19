/**
 * XML Content Negotiator
 * 
 * Handles XML content type negotiation.
 */

import { BaseContentNegotiator } from './BaseContentNegotiator';
import { ContentType } from '../types/serialization-types';

export class XMLNegotiator extends BaseContentNegotiator {
  constructor() {
    super(20);
  }

  getSupportedContentTypes(): ContentType[] {
    return [ContentType.XML];
  }

  protected _canHandle(type: string): boolean {
    return type.includes('application/xml') || type.includes('text/xml');
  }

  protected _mapToContentType(type: string): ContentType {
    return ContentType.XML;
  }

  protected _getDefaultContentType(): ContentType {
    return ContentType.JSON;
  }
}
