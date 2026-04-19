/**
 * Content Negotiation Manager
 * 
 * Manages the chain of responsibility for content negotiation.
 */

import { IContentNegotiator } from './IContentNegotiator';
import { ContentType } from '../types/serialization-types';
import { JSONNegotiator } from './JSONNegotiator';
import { XMLNegotiator } from './XMLNegotiator';
import { TextNegotiator } from './TextNegotiator';

export class ContentNegotiationManager {
  private _chain: IContentNegotiator | null = null;

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
    if (!this._chain) {
      return ContentType.JSON;
    }
    return this._chain.negotiate(acceptHeader);
  }

  /**
   * Adds a custom negotiator to the chain
   * 
   * @param negotiator - Custom negotiator to add
   */
  addNegotiator(negotiator: IContentNegotiator): void {
    if (!this._chain) {
      this._chain = negotiator;
      return;
    }

    let current = this._chain;
    while (current.getPriority() < negotiator.getPriority() && (current as any)._next) {
      current = (current as any)._next;
    }

    const next = (current as any)._next;
    (current as any)._next = negotiator;
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

  private _buildChain(): void {
    const jsonNegotiator = new JSONNegotiator();
    const xmlNegotiator = new XMLNegotiator();
    const textNegotiator = new TextNegotiator();

    jsonNegotiator.setNext(xmlNegotiator).setNext(textNegotiator);
    this._chain = jsonNegotiator;
  }
}
