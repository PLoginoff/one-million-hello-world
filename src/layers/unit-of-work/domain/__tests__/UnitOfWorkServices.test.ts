/**
 * Domain service tests for UnitOfWork
 */

import { UnitOfWorkExecutionService } from '../services/UnitOfWorkExecutionService';
import { UnitOfWorkValidationService } from '../services/UnitOfWorkValidationService';
import { UnitOfWorkQueryService } from '../services/UnitOfWorkQueryService';
import { UnitOfWorkInMemoryRepository } from '../repositories/UnitOfWorkInMemoryRepository';
import { UnitOfWorkMapper } from '../mappers/UnitOfWorkMapper';
import { UnitOfWorkCommandHandler } from '../handlers/UnitOfWorkCommandHandler';
import { UnitOfWorkQueryHandler } from '../handlers/UnitOfWorkQueryHandler';

describe('Services: UnitOfWork', () => {
  describe('UnitOfWorkExecutionService', () => {
    it('should start and complete execution', () => {
      var svc = new UnitOfWorkExecutionService();
      var rec = svc.start('exec-1', { test: true });
      expect(rec.status).toBe('running');
      var done = svc.complete('exec-1', { result: 'ok' });
      expect(done!.status).toBe('completed');
      expect(done!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle failures', () => {
      var svc = new UnitOfWorkExecutionService();
      svc.start('exec-2', 'test');
      var failed = svc.fail('exec-2', 'something went wrong');
      expect(failed!.status).toBe('failed');
      expect(failed!.error).toBe('something went wrong');
    });

    it('should track active executions', () => {
      var svc = new UnitOfWorkExecutionService();
      svc.start('exec-3', 'test');
      svc.start('exec-4', 'test');
      expect(svc.getActiveExecutions().length).toBe(2);
    });

    it('should compute success rate', () => {
      var svc = new UnitOfWorkExecutionService();
      svc.start('e1', ''); svc.complete('e1', '');
      svc.start('e2', ''); svc.fail('e2', 'err');
      expect(svc.getSuccessRate()).toBeCloseTo(0.5, 5);
    });

    it('should cancel active execution', () => {
      var svc = new UnitOfWorkExecutionService();
      svc.start('exec-5', 'test');
      expect(svc.cancel('exec-5')).toBe(true);
      expect(svc.getActiveExecutions().length).toBe(0);
    });
  });

  describe('UnitOfWorkValidationService', () => {
    it('should validate required fields', () => {
      var svc = new UnitOfWorkValidationService();
      svc.addRequiredRule('name');
      var report = svc.validate({ name: '' });
      expect(report.valid).toBe(false);
    });

    it('should pass valid data', () => {
      var svc = new UnitOfWorkValidationService();
      svc.addRequiredRule('name');
      var report = svc.validate({ name: 'test' });
      expect(report.valid).toBe(true);
    });

    it('should validate types', () => {
      var svc = new UnitOfWorkValidationService();
      svc.addTypeRule('count', 'number');
      var report = svc.validate({ count: 'not a number' });
      expect(report.valid).toBe(false);
    });

    it('should validate ranges', () => {
      var svc = new UnitOfWorkValidationService();
      svc.addRangeRule('age', 0, 120);
      var report = svc.validate({ age: 150 });
      expect(report.valid).toBe(false);
    });

    it('should throw on invalid data', () => {
      var svc = new UnitOfWorkValidationService();
      svc.addRequiredRule('field');
      expect(() => svc.validateOrThrow({ field: '' })).toThrow();
    });
  });

  describe('UnitOfWorkQueryService', () => {
    it('should insert and find by id', () => {
      var svc = new UnitOfWorkQueryService();
      svc.insert('1', { name: 'test' });
      var item = svc.findById('1');
      expect(item).not.toBeNull();
      expect(item!.name).toBe('test');
    });

    it('should query with filter', () => {
      var svc = new UnitOfWorkQueryService();
      svc.insert('1', { name: 'a', type: 'x' });
      svc.insert('2', { name: 'b', type: 'y' });
      var result = svc.query({ filter: { type: 'x' } });
      expect(result.items.length).toBe(1);
    });

    it('should sort results', () => {
      var svc = new UnitOfWorkQueryService();
      svc.insert('1', { name: 'c' });
      svc.insert('2', { name: 'a' });
      svc.insert('3', { name: 'b' });
      var result = svc.query({ sort: { field: 'name', direction: 'asc' } });
      expect(result.items[0].name).toBe('a');
    });

    it('should paginate', () => {
      var svc = new UnitOfWorkQueryService();
      for (var i = 0; i < 10; i++) svc.insert(String(i), { idx: i });
      var result = svc.query({ limit: 3, offset: 5 });
      expect(result.items.length).toBe(3);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('UnitOfWorkInMemoryRepository', () => {
    it('should save and find', () => {
      var repo = new UnitOfWorkInMemoryRepository();
      repo.save({ id: '1', version: 0, data: { x: 1 }, createdAt: Date.now(), updatedAt: Date.now() });
      var found = repo.findById('1');
      expect(found).not.toBeNull();
      expect(found!.data.x).toBe(1);
    });

    it('should check existence', () => {
      var repo = new UnitOfWorkInMemoryRepository();
      repo.save({ id: '1', version: 0, data: {}, createdAt: 0, updatedAt: 0 });
      expect(repo.exists('1')).toBe(true);
      expect(repo.exists('2')).toBe(false);
    });

    it('should delete', () => {
      var repo = new UnitOfWorkInMemoryRepository();
      repo.save({ id: '1', version: 0, data: {}, createdAt: 0, updatedAt: 0 });
      expect(repo.delete('1')).toBe(true);
      expect(repo.count()).toBe(0);
    });
  });

  describe('UnitOfWorkMapper', () => {
    it('should map entity to DTO', () => {
      var mapper = new UnitOfWorkMapper();
      var dto = mapper.toDto({
        id: '1', status: 'active', createdAt: 1000, updatedAt: 2000,
        attributes: { key: 'val' }, tags: ['a'],
      });
      expect(dto.id).toBe('1');
      expect(dto.tags).toEqual(['a']);
    });

    it('should map DTO to entity', () => {
      var mapper = new UnitOfWorkMapper();
      var entity = mapper.toEntity({
        id: '1', status: 'active', createdAt: '1970-01-01T00:00:01.000Z',
        updatedAt: '1970-01-01T00:00:02.000Z', attributes: {}, tags: [],
      });
      expect(entity.createdAt).toBe(1000);
    });
  });

  describe('UnitOfWorkCommandHandler', () => {
    it('should handle registered command', async () => {
      var handler = new UnitOfWorkCommandHandler();
      handler.register('create', async () => 'created');
      var result = await handler.handle({ type: 'create', payload: {}, metadata: { commandId: 'cmd-1' } });
      expect(result.success).toBe(true);
      expect(result.result).toBe('created');
    });

    it('should fail for unregistered command', async () => {
      var handler = new UnitOfWorkCommandHandler();
      var result = await handler.handle({ type: 'unknown', payload: {}, metadata: {} });
      expect(result.success).toBe(false);
    });
  });

  describe('UnitOfWorkQueryHandler', () => {
    it('should handle query with caching', async () => {
      var handler = new UnitOfWorkQueryHandler();
      handler.register('get', async () => 'data');
      var r1 = await handler.handle({ type: 'get', params: {} });
      expect(r1.success).toBe(true);
      expect(r1.cached).toBe(false);
      var r2 = await handler.handle({ type: 'get', params: {} });
      expect(r2.cached).toBe(true);
    });
  });
});
