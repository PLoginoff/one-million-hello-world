/**
 * Service → Domain Integration Test
 *
 * Verifies that the Service layer delegates to the Domain layer
 * for entity creation and policy enforcement.
 */

import { Service } from '../../service/implementations/Service';
import { DomainFactory } from '../services/DomainFactory';
import { MessagePolicy } from '../services/MessagePolicy';
import { DefaultDomainStrategy } from '../strategies/DefaultDomainStrategy';
import { UseCase, ServiceContext } from '../../service/types/service-types';

describe('Service → Domain Integration', () => {
  let service: Service;
  let factory: DomainFactory;
  let policy: MessagePolicy;
  let strategy: DefaultDomainStrategy;

  beforeEach(() => {
    service = new Service();
    factory = new DomainFactory();
    policy = new MessagePolicy([], 1000000);
    strategy = new DefaultDomainStrategy();

    const createHelloUseCase: UseCase<{ language: string; format: string }, Record<string, unknown>> = {
      name: 'createHello',
      execute: async (input, _context: ServiceContext) => {
        const message = factory.createHelloWorldMessage('Hello World', {
          language: input.language,
          format: input.format,
        });

        const policyResult = policy.canServe(message, 0);
        if (!policyResult.allowed) {
          return {
            success: false,
            error: { code: 'POLICY_VIOLATION', message: policyResult.reason ?? 'Policy violation' },
          };
        }

        const domainResult = await strategy.process(message);
        if (!domainResult.success) {
          return {
            success: false,
            error: { code: domainResult.error!.code, message: domainResult.error!.message },
          };
        }

        return { success: true, data: domainResult.value!.toPayload() };
      },
    };

    service.registerUseCase(createHelloUseCase);
  });

  it('should create hello world message through domain', async () => {
    const context = service.createContext(undefined, 'corr-1', 'req-1');
    const result = await service.execute('createHello', { language: 'en', format: 'json' }, context);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect((result.data as Record<string, unknown>).message).toBe('Hello World');
  });

  it('should support multiple languages', async () => {
    const context = service.createContext(undefined, 'corr-1', 'req-1');
    const result = await service.execute('createHello', { language: 'es', format: 'json' }, context);

    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).language).toBe('es');
  });

  it('should enforce message policy', async () => {
    const blockingPolicy = new MessagePolicy(['xx'], 1000000);
    const blockedUseCase: UseCase<{ language: string; format: string }, Record<string, unknown>> = {
      name: 'blockedHello',
      execute: async (input, _context: ServiceContext) => {
        const message = factory.createHelloWorldMessage('Hello', {
          language: input.language,
          format: input.format,
        });
        const policyResult = blockingPolicy.canServe(message, 0);
        if (!policyResult.allowed) {
          return { success: false, error: { code: 'POLICY_VIOLATION', message: policyResult.reason ?? 'Blocked' } };
        }
        return { success: true, data: message.toPayload() };
      },
    };

    service.registerUseCase(blockedUseCase);
    const context = service.createContext(undefined, 'corr-1', 'req-1');
    const result = await service.execute('blockedHello', { language: 'xx', format: 'json' }, context);

    expect(result.success).toBe(false);
    expect(result.error!.code).toBe('POLICY_VIOLATION');
  });
});
