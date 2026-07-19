/**
 * Domain Error Taxonomy Unit Tests
 */

import { DomainErrorImpl } from '../errors/DomainError';

describe('DomainErrorImpl', () => {
  it('should create empty message error', () => {
    const error = DomainErrorImpl.emptyMessage();
    expect(error.code).toBe('EMPTY_MESSAGE');
    expect(error.message).toBe('Message content cannot be empty');
  });

  it('should create invalid language error with details', () => {
    const error = DomainErrorImpl.invalidLanguage('xx');
    expect(error.code).toBe('INVALID_LANGUAGE');
    expect(error.details).toEqual({ language: 'xx' });
  });

  it('should create invalid format error with details', () => {
    const error = DomainErrorImpl.invalidFormat('yaml');
    expect(error.code).toBe('INVALID_FORMAT');
    expect(error.details).toEqual({ format: 'yaml' });
  });

  it('should create message not found error', () => {
    const error = DomainErrorImpl.messageNotFound('hw-123');
    expect(error.code).toBe('MESSAGE_NOT_FOUND');
    expect(error.details).toEqual({ id: 'hw-123' });
  });

  it('should create policy violation error', () => {
    const error = DomainErrorImpl.policyViolation('Custom reason');
    expect(error.code).toBe('POLICY_VIOLATION');
    expect(error.message).toBe('Custom reason');
  });

  it('should create quota exceeded error', () => {
    const error = DomainErrorImpl.quotaExceeded(1000);
    expect(error.code).toBe('QUOTA_EXCEEDED');
    expect(error.details).toEqual({ limit: 1000 });
  });

  it('should create language blocked error', () => {
    const error = DomainErrorImpl.languageBlocked('fr');
    expect(error.code).toBe('LANGUAGE_BLOCKED');
    expect(error.details).toEqual({ language: 'fr' });
  });

  it('should serialize to JSON', () => {
    const error = DomainErrorImpl.invalidLanguage('xx');
    const json = error.toJSON();
    expect(json.name).toBe('DomainError');
    expect(json.code).toBe('INVALID_LANGUAGE');
    expect(json.message).toBeDefined();
  });
});
