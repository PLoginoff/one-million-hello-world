/**
 * Validation Error Mapper Unit Tests
 */

import { ValidationErrorMapper } from '../utils/ValidationErrorMapper';
import { ValidationError } from '../utils/ValidationError';

describe('ValidationErrorMapper', () => {
  it('should map error severity to 400', () => {
    const error = ValidationError.required('name');
    const mapped = ValidationErrorMapper.map(error);
    expect(mapped.httpStatus).toBe(400);
    expect(mapped.field).toBe('name');
    expect(mapped.severity).toBe('error');
  });

  it('should map critical severity to 422', () => {
    const error = new ValidationError('CRITICAL', 'Critical error', 'field', 'critical');
    const mapped = ValidationErrorMapper.map(error);
    expect(mapped.httpStatus).toBe(422);
  });

  it('should map warning severity to 200', () => {
    const error = new ValidationError('WARN', 'Warning', 'field', 'warning');
    const mapped = ValidationErrorMapper.map(error);
    expect(mapped.httpStatus).toBe(200);
  });

  it('should map generic Error to 500', () => {
    const error = new Error('Generic');
    const mapped = ValidationErrorMapper.map(error);
    expect(mapped.httpStatus).toBe(500);
    expect(mapped.code).toBe('INTERNAL_ERROR');
  });

  it('should support custom severity mapping', () => {
    ValidationErrorMapper.registerSeverityMapping('critical', 451);
    const error = new ValidationError('CUSTOM', 'Custom', 'field', 'critical');
    const mapped = ValidationErrorMapper.map(error);
    expect(mapped.httpStatus).toBe(451);
  });
});
