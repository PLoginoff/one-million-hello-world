/**
 * Content Negotiation Manager
 *
 * Manages the chain of responsibility for content negotiation.
 */

import { IContentNegotiator } from './IContentNegotiator';
import { ContentType } from '../types/serialization-types';
import { BaseContentNegotiator } from './BaseContentNegotiator';
import { JSONNegotiator } from './JSONNegotiator';
import { XMLNegotiator } from './XMLNegotiator';
import { TextNegotiator } from './TextNegotiator';

export class ContentNegotiationManager {
  private _chain: IContentNegotiator | null = null;
  private _negotiators: BaseContentNegotiator[] = [];

  constructor() {
    this._buildChain();
  }

  /**
   * Negotiates content type based on accept header
   *
   * @param acceptHeader - Accept header value
   * @returns Negotiated content type
   */
  negotiate(acceptHeader: string): ContentType {
    const trimmed = acceptHeader.trim();
    if (!trimmed) {
      return ContentType.JSON;
    }

    const parsed = this._parseAcceptHeader(trimmed);
    for (const { type } of parsed) {
      for (const negotiator of this._negotiators) {
        if ((negotiator as any)._canHandle(type)) {
          return (negotiator as any)._mapToContentType(type);
        }
      }
    }

    return ContentType.JSON;
  }

  /**
   * Adds a custom negotiator to the chain
   *
   * @param negotiator - Custom negotiator to add
   */
  addNegotiator(negotiator: IContentNegotiator): void {
    if (!this._chain) {
      this._chain = negotiator;
      this._negotiators.push(negotiator as BaseContentNegotiator);
      return;
    }

    let current = this._chain;
    while (current.getPriority() < negotiator.getPriority() && (current as any)._next) {
      current = (current as any)._next;
    }

    const next = (current as any)._next;
    (current as any)._next = negotiator;
    this._negotiators.push(negotiator as BaseContentNegotiator);
    if (next) {
      negotiator.setNext(next);
    }
  }

  /**
   * Resets the chain to default negotiators
   */
  resetChain(): void {
    this._buildChain();
  }

  private _parseAcceptHeader(acceptHeader: string): Array<{ type: string; q: number }> {
    const types = acceptHeader.split(',').map((t) => t.trim());
    const parsed: Array<{ type: string; q: number }> = [];

    for (const type of types) {
      const [mimeType, qValue] = type.split(';');
      const q = qValue ? parseFloat(qValue.trim().replace('q=', '')) : 1.0;
      parsed.push({ type: mimeType.trim(), q });
    }

    return parsed.sort((a, b) => b.q - a.q);
  }

  private _buildChain(): void {
    const jsonNegotiator = new JSONNegotiator();
    const xmlNegotiator = new XMLNegotiator();
    const textNegotiator = new TextNegotiator();

    jsonNegotiator.setNext(xmlNegotiator).setNext(textNegotiator);
    this._chain = jsonNegotiator;
    this._negotiators = [jsonNegotiator, xmlNegotiator, textNegotiator];
  }
}
