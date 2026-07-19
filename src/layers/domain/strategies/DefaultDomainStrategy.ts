/**
 * Default Domain Strategy
 *
 * Basic domain strategy that validates and returns messages as-is.
 */

import { IDomainStrategy } from './IDomainStrategy';
import { HelloWorldMessage } from '../entities/HelloWorldMessage';
import { DomainResult } from '../types/domain-types';

export class DefaultDomainStrategy implements IDomainStrategy {
  getName(): string {
    return 'DEFAULT';
  }

  async process(message: HelloWorldMessage): Promise<DomainResult<HelloWorldMessage>> {
    if (message.content.value.length === 0) {
      return Promise.resolve({
        success: false,
        error: { code: 'EMPTY_MESSAGE', message: 'Message content cannot be empty' },
      });
    }
    return Promise.resolve({ success: true, value: message });
  }
}
