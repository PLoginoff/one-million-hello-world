/**
 * Legacy Domain Strategy Interface
 *
 * Defines the contract for legacy domain processing strategies.
 * Used by existing implementations like EventSourcingDomainStrategy.
 *
 * @module DomainLayer/Strategies
 */

import { HelloWorldMessage } from '../entities/HelloWorldMessage';
import { DomainResult } from '../types/domain-types';

/**
 * Interface for legacy domain processing strategies.
 */
export interface ILegacyDomainStrategy {
  /**
   * Gets the strategy name.
   *
   * @returns The strategy name
   */
  getName(): string;

  /**
   * Processes a HelloWorldMessage.
   *
   * @param message - The message to process
   * @returns Promise resolving to the domain result
   */
  process(message: HelloWorldMessage): Promise<DomainResult<HelloWorldMessage>>;
}
