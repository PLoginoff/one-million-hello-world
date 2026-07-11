/**
 * Migrations Domain Entity Tests
 */

import { MigrationsEntity } from '../entities/MigrationsEntity';
import { MigrationsValueObject } from '../value-objects/MigrationsValueObject';
import { MigrationsDomainService } from '../services/MigrationsDomainService';

describe('Migrations Domain', () => {
  it('should create entity', () => {
    const entity = MigrationsEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = MigrationsValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new MigrationsDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
