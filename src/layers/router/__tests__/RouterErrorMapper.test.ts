/**
 * Router Error Mapper Unit Tests
 */

import { RouterErrorMapper } from '../utils/RouterErrorMapper';
import { RouterError } from '../utils/RouterError';

describe('RouterErrorMapper', () => {
  it('should map ROUTE_NOT_FOUND to 404', () => {
    const error = RouterError.notFound('/hello', 'GET');
    const mapped = RouterErrorMapper.map(error);
    expect(mapped.statusCode).toBe(404);
    expect(mapped.code).toBe('ROUTE_NOT_FOUND');
    expect(mapped.details).toEqual({ path: '/hello', method: 'GET' });
  });

  it('should map METHOD_NOT_ALLOWED to 405', () => {
    const error = RouterError.methodNotAllowed('/hello', 'POST');
    const mapped = RouterErrorMapper.map(error);
    expect(mapped.statusCode).toBe(405);
  });

  it('should map INVALID_ROUTE to 400', () => {
    const error = RouterError.invalidRoute('Bad route', '/hello');
    const mapped = RouterErrorMapper.map(error);
    expect(mapped.statusCode).toBe(400);
  });

  it('should map unknown RouterError code to 500', () => {
    const error = new RouterError('UNKNOWN', 'Something', '/path', 'GET');
    const mapped = RouterErrorMapper.map(error);
    expect(mapped.statusCode).toBe(500);
  });

  it('should map generic Error to 500', () => {
    const error = new Error('Generic error');
    const mapped = RouterErrorMapper.map(error);
    expect(mapped.statusCode).toBe(500);
    expect(mapped.code).toBe('INTERNAL_ERROR');
  });

  it('should support custom mapping registration', () => {
    RouterErrorMapper.registerMapping('CUSTOM', 418);
    const error = new RouterError('CUSTOM', 'Custom');
    const mapped = RouterErrorMapper.map(error);
    expect(mapped.statusCode).toBe(418);
  });
});
