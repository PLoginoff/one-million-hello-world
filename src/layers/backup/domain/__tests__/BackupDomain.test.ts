/**
 * Backup Domain Entity Tests
 */

import { BackupEntity } from '../entities/BackupEntity';
import { BackupValueObject } from '../value-objects/BackupValueObject';
import { BackupDomainService } from '../services/BackupDomainService';

describe('Backup Domain', () => {
  it('should create entity', () => {
    const entity = BackupEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = BackupValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new BackupDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
