/**
 * Content Negotiator Interface
 * 
 * Defines the contract for content negotiation using Chain of Responsibility pattern.
 */

import { ContentType } from '../types/serialization-types';

export interface IContentNegotiator {
  /**
   * Negotiates the best content type based on accept header
   * 
   * @param acceptHeader - Accept header value
   * @returns Negotiated content type
   */
  negotiate(acceptHeader: string): ContentType;

  /**
   * Sets the next negotiator in the chain
   * 
   * @param next - Next negotiator in chain
   */
  setNext(next: IContentNegotiator): IContentNegotiator;

  /**
   * Gets the supported content types for this negotiator
   * 
   * @returns Array of supported content types
   */
  getSupportedContentTypes(): ContentType[];

  /**
   * Gets the priority of this negotiator (lower = higher priority)
   * 
   * @returns Priority value
   */
  getPriority(): number;
}
