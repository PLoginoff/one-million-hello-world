/**
 * Domain service tests for Reporting
 */

import { ReportingExecutionService } from '../services/ReportingExecutionService';
import { ReportingValidationService } from '../services/ReportingValidationService';
import { ReportingQueryService } from '../services/ReportingQueryService';
import { ReportingInMemoryRepository } from '../repositories/ReportingInMemoryRepository';
import { ReportingMapper } from '../mappers/ReportingMapper';
import { ReportingCommandHandler } from '../handlers/ReportingCommandHandler';
import { ReportingQueryHandler } from '../handlers/ReportingQueryHandler';

describe('Services: Reporting', () => {
  describe('ReportingExecutionService', () => {
    it('should start and complete execution', () => {
      var svc = new ReportingExecutionService();
      var rec = svc.start('exec-1', { test: true });
      expect(rec.status).toBe('running');
      var done = svc.complete('exec-1', { result: 'ok' });
      expect(done!.status).toBe('completed');
      expect(done!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle failures', () => {
      var svc = new ReportingExecutionService();
      svc.start('exec-2', 'test');
      var failed = svc.fail('exec-2', 'something went wrong');
      expect(failed!.status).toBe('failed');
      expect(failed!.error).toBe('something went wrong');
    });

    it('should track active executions', () => {
      var svc = new ReportingExecutionService();
      svc.start('exec-3', 'test');
      svc.start('exec-4', 'test');
      expect(svc.getActiveExecutions().length).toBe(2);
    });

    it('should compute success rate', () => {
      var svc = new ReportingExecutionService();
      svc.start('e1', ''); svc.complete('e1', '');
      svc.start('e2', ''); svc.fail('e2', 'err');
      expect(svc.getSuccessRate()).toBeCloseTo(0.5, 5);
    });

    it('should cancel active execution', () => {
      var svc = new ReportingExecutionService();
      svc.start('exec-5', 'test');
      expect(svc.cancel('exec-5')).toBe(true);
      expect(svc.getActiveExecutions().length).toBe(0);
    });
  });

  describe('ReportingValidationService', () => {
    it('should validate required fields', () => {
      var svc = new ReportingValidationService();
      svc.addRequiredRule('name');
      var report = svc.validate({ name: '' });
      expect(report.valid).toBe(false);
    });

    it('should pass valid data', () => {
      var svc = new ReportingValidationService();
      svc.addRequiredRule('name');
      var report = svc.validate({ name: 'test' });
      expect(report.valid).toBe(true);
    });

    it('should validate types', () => {
      var svc = new ReportingValidationService();
      svc.addTypeRule('count', 'number');
      var report = svc.validate({ count: 'not a number' });
      expect(report.valid).toBe(false);
    });

    it('should validate ranges', () => {
      var svc = new ReportingValidationService();
      svc.addRangeRule('age', 0, 120);
      var report = svc.validate({ age: 150 });
      expect(report.valid).toBe(false);
    });

    it('should throw on invalid data', () => {
      var svc = new ReportingValidationService();
      svc.addRequiredRule('field');
      expect(() => svc.validateOrThrow({ field: '' })).toThrow();
    });
  });

  describe('ReportingQueryService', () => {
    it('should insert and find by id', () => {
      var svc = new ReportingQueryService();
      svc.insert('1', { name: 'test' });
      var item = svc.findById('1');
      expect(item).not.toBeNull();
      expect(item!.name).toBe('test');
    });

    it('should query with filter', () => {
      var svc = new ReportingQueryService();
      svc.insert('1', { name: 'a', type: 'x' });
      svc.insert('2', { name: 'b', type: 'y' });
      var result = svc.query({ filter: { type: 'x' } });
      expect(result.items.length).toBe(1);
    });

    it('should sort results', () => {
      var svc = new ReportingQueryService();
      svc.insert('1', { name: 'c' });
      svc.insert('2', { name: 'a' });
      svc.insert('3', { name: 'b' });
      var result = svc.query({ sort: { field: 'name', direction: 'asc' } });
      expect(result.items[0].name).toBe('a');
    });

    it('should paginate', () => {
      var svc = new ReportingQueryService();
      for (var i = 0; i < 10; i++) svc.insert(String(i), { idx: i });
      var result = svc.query({ limit: 3, offset: 5 });
      expect(result.items.length).toBe(3);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('ReportingInMemoryRepository', () => {
    it('should save and find', () => {
      var repo = new ReportingInMemoryRepository();
      repo.save({ id: '1', version: 0, data: { x: 1 }, createdAt: Date.now(), updatedAt: Date.now() });
      var found = repo.findById('1');
      expect(found).not.toBeNull();
      expect(found!.data.x).toBe(1);
    });

    it('should check existence', () => {
      var repo = new ReportingInMemoryRepository();
      repo.save({ id: '1', version: 0, data: {}, createdAt: 0, updatedAt: 0 });
      expect(repo.exists('1')).toBe(true);
      expect(repo.exists('2')).toBe(false);
    });

    it('should delete', () => {
      var repo = new ReportingInMemoryRepository();
      repo.save({ id: '1', version: 0, data: {}, createdAt: 0, updatedAt: 0 });
      expect(repo.delete('1')).toBe(true);
      expect(repo.count()).toBe(0);
    });
  });

  describe('ReportingMapper', () => {
    it('should map entity to DTO', () => {
      var mapper = new ReportingMapper();
      var dto = mapper.toDto({
        id: '1', status: 'active', createdAt: 1000, updatedAt: 2000,
        attributes: { key: 'val' }, tags: ['a'],
      });
      expect(dto.id).toBe('1');
      expect(dto.tags).toEqual(['a']);
    });

    it('should map DTO to entity', () => {
      var mapper = new ReportingMapper();
      var entity = mapper.toEntity({
        id: '1', status: 'active', createdAt: '1970-01-01T00:00:01.000Z',
        updatedAt: '1970-01-01T00:00:02.000Z', attributes: {}, tags: [],
      });
      expect(entity.createdAt).toBe(1000);
    });
  });

  describe('ReportingCommandHandler', () => {
    it('should handle registered command', async () => {
      var handler = new ReportingCommandHandler();
      handler.register('create', async () => 'created');
      var result = await handler.handle({ type: 'create', payload: {}, metadata: { commandId: 'cmd-1' } });
      expect(result.success).toBe(true);
      expect(result.result).toBe('created');
    });

    it('should fail for unregistered command', async () => {
      var handler = new ReportingCommandHandler();
      var result = await handler.handle({ type: 'unknown', payload: {}, metadata: {} });
      expect(result.success).toBe(false);
    });
  });

  describe('ReportingQueryHandler', () => {
    it('should handle query with caching', async () => {
      var handler = new ReportingQueryHandler();
      handler.register('get', async () => 'data');
      var r1 = await handler.handle({ type: 'get', params: {} });
      expect(r1.success).toBe(true);
      expect(r1.cached).toBe(false);
      var r2 = await handler.handle({ type: 'get', params: {} });
      expect(r2.cached).toBe(true);
    });
  });
});
