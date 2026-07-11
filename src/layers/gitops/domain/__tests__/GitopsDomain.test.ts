/**
 * Gitops Domain Entity Tests
 */

import { GitopsEntity } from '../entities/GitopsEntity';
import { GitopsValueObject } from '../value-objects/GitopsValueObject';
import { GitopsDomainService } from '../services/GitopsDomainService';

describe('Gitops Domain', () => {
  it('should create entity', () => {
    const entity = GitopsEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = GitopsValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new GitopsDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
