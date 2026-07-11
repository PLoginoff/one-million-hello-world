/**
 * ContractTesting Domain Entity Tests
 */

import { ContractTestingEntity } from '../entities/ContractTestingEntity';
import { ContractTestingValueObject } from '../value-objects/ContractTestingValueObject';
import { ContractTestingDomainService } from '../services/ContractTestingDomainService';

describe('ContractTesting Domain', () => {
  it('should create entity', () => {
    const entity = ContractTestingEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = ContractTestingValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new ContractTestingDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
