/**
 * Controller Error Mapper Unit Tests
 */

import { ControllerErrorMapper } from '../utils/ControllerErrorMapper';
import { ControllerError } from '../utils/ControllerError';
import { HttpStatusCode } from '../types/controller-types';

describe('ControllerErrorMapper', () => {
  it('should map ControllerError.notFound to 404', () => {
    const error = ControllerError.notFound('Controller not found', 'ctrl-1');
    const mapped = ControllerErrorMapper.map(error);

    expect(mapped.statusCode).toBe(HttpStatusCode.NOT_FOUND);
    expect(mapped.code).toBe('CONTROLLER_NOT_FOUND');
    expect(mapped.message).toBe('Controller not found');
    expect(mapped.details).toEqual({ controllerId: 'ctrl-1' });
  });

  it('should map ControllerError.alreadyRegistered to 409', () => {
    const error = ControllerError.alreadyRegistered('Already exists', 'ctrl-1');
    const mapped = ControllerErrorMapper.map(error);

    expect(mapped.statusCode).toBe(HttpStatusCode.CONFLICT);
  });

  it('should map unknown ControllerError code to 500', () => {
    const error = new ControllerError('UNKNOWN_CODE', 'Something went wrong', 'ctrl-1');
    const mapped = ControllerErrorMapper.map(error);

    expect(mapped.statusCode).toBe(HttpStatusCode.INTERNAL_SERVER_ERROR);
  });

  it('should map generic Error to 500', () => {
    const error = new Error('Generic error');
    const mapped = ControllerErrorMapper.map(error);

    expect(mapped.statusCode).toBe(HttpStatusCode.INTERNAL_SERVER_ERROR);
    expect(mapped.code).toBe('INTERNAL_ERROR');
    expect(mapped.message).toBe('Generic error');
  });

  it('should map generic Error with empty message to default message', () => {
    const error = new Error('');
    const mapped = ControllerErrorMapper.map(error);

    expect(mapped.message).toBe('An unexpected error occurred');
  });

  it('should convert to ControllerResult', () => {
    const error = ControllerError.notFound('Not found', 'ctrl-1');
    const result = ControllerErrorMapper.toControllerResult(error);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe(HttpStatusCode.NOT_FOUND);
    expect(result.error!.message).toBe('Not found');
  });

  it('should support custom mapping registration', () => {
    ControllerErrorMapper.registerMapping('CUSTOM_CODE', HttpStatusCode.BAD_REQUEST);
    const error = new ControllerError('CUSTOM_CODE', 'Custom error');
    const mapped = ControllerErrorMapper.map(error);

    expect(mapped.statusCode).toBe(HttpStatusCode.BAD_REQUEST);
  });
});
