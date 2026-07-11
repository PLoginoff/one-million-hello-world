/**
 * Snapshot Domain Entity Tests
 */

import { SnapshotEntity } from '../entities/SnapshotEntity';
import { SnapshotValueObject } from '../value-objects/SnapshotValueObject';
import { SnapshotDomainService } from '../services/SnapshotDomainService';

describe('Snapshot Domain', () => {
  it('should create entity', () => {
    const entity = SnapshotEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = SnapshotValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new SnapshotDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
