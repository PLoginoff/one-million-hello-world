/**
 * Domain → Repository Integration Test
 *
 * Verifies that the Domain layer persists entities through the Repository layer.
 */

import { InMemoryAdapter } from '../adapters/InMemoryAdapter';
import { HelloWorldMessage } from '../../domain/entities/HelloWorldMessage';
import { DomainEntity } from '../../domain/types/domain-types';
import { FilterOperator } from '../types/repository-types';

describe('Domain → Repository Integration', () => {
  let adapter: InMemoryAdapter<HelloWorldMessage & DomainEntity>;

  beforeEach(async () => {
    adapter = new InMemoryAdapter<HelloWorldMessage & DomainEntity>();
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.clear();
    await adapter.disconnect();
  });

  it('should persist and retrieve HelloWorldMessage', async () => {
    const message = HelloWorldMessage.create('Hello World');
    const entity = message as unknown as HelloWorldMessage & DomainEntity;

    await adapter.save(entity);
    const result = await adapter.findById(entity.id);

    expect(result.success).toBe(true);
    expect(result.data!.content.value).toBe('Hello World');
  });

  it('should query messages by language', async () => {
    const msg1 = HelloWorldMessage.create('Hello').withLanguage('en') as unknown as HelloWorldMessage & DomainEntity;
    const msg2 = HelloWorldMessage.create('Hola').withLanguage('es') as unknown as HelloWorldMessage & DomainEntity;

    await adapter.save(msg1);
    await adapter.save(msg2);

    const result = await adapter.find({
      filters: [{ field: 'language', operator: FilterOperator.EQUALS, value: 'es' }],
    });

    expect(result.success).toBe(true);
    expect(result.data!.length).toBe(1);
    expect(result.data![0].language).toBe('es');
  });

  it('should count messages', async () => {
    await adapter.save(HelloWorldMessage.create('Hello') as unknown as HelloWorldMessage & DomainEntity);
    await adapter.save(HelloWorldMessage.create('World') as unknown as HelloWorldMessage & DomainEntity);

    const result = await adapter.count();
    expect(result.data).toBe(2);
  });

  it('should update message and persist changes', async () => {
    const original = HelloWorldMessage.create('Hello') as unknown as HelloWorldMessage & DomainEntity;
    await adapter.save(original);

    const updated = original.withLanguage('es') as unknown as HelloWorldMessage & DomainEntity;
    await adapter.save(updated);

    const result = await adapter.findById(updated.id);
    expect(result.data!.language).toBe('es');
  });

  it('should delete message', async () => {
    const message = HelloWorldMessage.create('Hello') as unknown as HelloWorldMessage & DomainEntity;
    await adapter.save(message);

    await adapter.delete(message.id);
    const result = await adapter.findById(message.id);
    expect(result.success).toBe(false);
  });
});
