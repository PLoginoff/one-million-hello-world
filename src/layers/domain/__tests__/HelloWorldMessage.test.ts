/**
 * HelloWorldMessage Entity Unit Tests
 */

import { HelloWorldMessage } from '../entities/HelloWorldMessage';
import { MessageContent } from '../value-objects/MessageContent';

describe('HelloWorldMessage', () => {
  it('should create message with default version', () => {
    const message = HelloWorldMessage.create('Hello World');
    expect(message.version).toBe(1);
    expect(message.auditTrail).toEqual([]);
  });

  it('should create message with custom options', () => {
    const content = MessageContent.create('Test');
    const message = new HelloWorldMessage('hw-1', content, 'es', 'xml', {
      version: 3,
      createdBy: 'user-1',
      updatedBy: 'user-2',
    });

    expect(message.version).toBe(3);
    expect(message.createdBy).toBe('user-1');
    expect(message.updatedBy).toBe('user-2');
  });

  it('should track language change in audit trail', () => {
    const message = HelloWorldMessage.create('Hello');
    const updated = message.withLanguage('es');

    expect(updated.language).toBe('es');
    expect(updated.auditTrail.length).toBe(1);
    expect(updated.auditTrail[0].action).toBe('language_change');
    expect(updated.auditTrail[0].value).toBe('es');
  });

  it('should track format change in audit trail', () => {
    const message = HelloWorldMessage.create('Hello');
    const updated = message.withFormat('xml');

    expect(updated.format).toBe('xml');
    expect(updated.auditTrail.length).toBe(1);
    expect(updated.auditTrail[0].action).toBe('format_change');
  });

  it('should bump version with audit entry', () => {
    const message = HelloWorldMessage.create('Hello');
    const updated = message.withVersion(2, 'user-1');

    expect(updated.version).toBe(2);
    expect(updated.updatedBy).toBe('user-1');
    expect(updated.auditTrail[0].action).toBe('version_bump');
  });

  it('should include version in payload', () => {
    const message = new HelloWorldMessage('hw-1', MessageContent.create('Test'), 'en', 'json', {
      version: 5,
      createdBy: 'admin',
    });

    const payload = message.toPayload();
    expect(payload.version).toBe(5);
    expect(payload.createdBy).toBe('admin');
  });

  it('should produce audit snapshot', () => {
    const message = HelloWorldMessage.create('Hello').withLanguage('es').withFormat('xml');
    const snapshot = message.toAuditSnapshot();

    expect(snapshot.auditTrail).toBeDefined();
    expect((snapshot.auditTrail as unknown[]).length).toBe(2);
  });
});
