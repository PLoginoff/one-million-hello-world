/**
 * Domain Strategy Interface
 *
 * Defines contract for different domain processing strategies.
 */

import { HelloWorldMessage } from '../entities/HelloWorldMessage';
import { DomainResult } from '../types/domain-types';

export interface IDomainStrategy {
  getName(): string;
  process(message: HelloWorldMessage): Promise<DomainResult<HelloWorldMessage>>;
}
