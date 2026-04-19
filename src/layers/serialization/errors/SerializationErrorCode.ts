/**
 * Serialization Error Codes
 * 
 * Enumeration of all possible serialization error codes.
 */

export enum SerializationErrorCode {
  // General errors
  UNKNOWN_ERROR = 'SER_000',
  INVALID_INPUT = 'SER_001',
  INVALID_OUTPUT = 'SER_002',

  // Serialization errors
  SERIALIZATION_FAILED = 'SER_100',
  UNSUPPORTED_FORMAT = 'SER_101',
  CIRCULAR_REFERENCE = 'SER_102',
  DATA_TOO_LARGE = 'SER_103',
  SERIALIZATION_TIMEOUT = 'SER_104',

  // Deserialization errors
  DESERIALIZATION_FAILED = 'SER_200',
  INVALID_FORMAT = 'SER_201',
  MALFORMED_DATA = 'SER_202',
  TYPE_MISMATCH = 'SER_203',
  MISSING_REQUIRED_FIELD = 'SER_204',

  // Content negotiation errors
  CONTENT_NEGOTIATION_FAILED = 'SER_300',
  UNSUPPORTED_CONTENT_TYPE = 'SER_301',
  INVALID_ACCEPT_HEADER = 'SER_302',

  // Versioning errors
  VERSIONING_FAILED = 'SER_400',
  INVALID_VERSION = 'SER_401',
  VERSION_MISMATCH = 'SER_402',
  VERSION_NOT_FOUND = 'SER_403',

  // Validation errors
  VALIDATION_FAILED = 'SER_500',
  SCHEMA_VALIDATION_FAILED = 'SER_501',
  TYPE_VALIDATION_FAILED = 'SER_502',

  // Plugin errors
  PLUGIN_ERROR = 'SER_600',
  PLUGIN_NOT_FOUND = 'SER_601',
  PLUGIN_LOAD_FAILED = 'SER_602',

  // Hook errors
  HOOK_ERROR = 'SER_700',
  HOOK_EXECUTION_FAILED = 'SER_701',
}

/**
 * Gets error message for error code
 * 
 * @param code - Error code
 * @returns Error message
 */
export function getErrorMessage(code: SerializationErrorCode): string {
  const messages: Record<SerializationErrorCode, string> = {
    [SerializationErrorCode.UNKNOWN_ERROR]: 'An unknown error occurred',
    [SerializationErrorCode.INVALID_INPUT]: 'Invalid input provided',
    [SerializationErrorCode.INVALID_OUTPUT]: 'Invalid output generated',

    [SerializationErrorCode.SERIALIZATION_FAILED]: 'Serialization failed',
    [SerializationErrorCode.UNSUPPORTED_FORMAT]: 'Unsupported serialization format',
    [SerializationErrorCode.CIRCULAR_REFERENCE]: 'Circular reference detected',
    [SerializationErrorCode.DATA_TOO_LARGE]: 'Data is too large to serialize',
    [SerializationErrorCode.SERIALIZATION_TIMEOUT]: 'Serialization operation timed out',

    [SerializationErrorCode.DESERIALIZATION_FAILED]: 'Deserialization failed',
    [SerializationErrorCode.INVALID_FORMAT]: 'Invalid data format',
    [SerializationErrorCode.MALFORMED_DATA]: 'Malformed data',
    [SerializationErrorCode.TYPE_MISMATCH]: 'Type mismatch',
    [SerializationErrorCode.MISSING_REQUIRED_FIELD]: 'Missing required field',

    [SerializationErrorCode.CONTENT_NEGOTIATION_FAILED]: 'Content negotiation failed',
    [SerializationErrorCode.UNSUPPORTED_CONTENT_TYPE]: 'Unsupported content type',
    [SerializationErrorCode.INVALID_ACCEPT_HEADER]: 'Invalid accept header',

    [SerializationErrorCode.VERSIONING_FAILED]: 'Versioning failed',
    [SerializationErrorCode.INVALID_VERSION]: 'Invalid version',
    [SerializationErrorCode.VERSION_MISMATCH]: 'Version mismatch',
    [SerializationErrorCode.VERSION_NOT_FOUND]: 'Version not found',

    [SerializationErrorCode.VALIDATION_FAILED]: 'Validation failed',
    [SerializationErrorCode.SCHEMA_VALIDATION_FAILED]: 'Schema validation failed',
    [SerializationErrorCode.TYPE_VALIDATION_FAILED]: 'Type validation failed',

    [SerializationErrorCode.PLUGIN_ERROR]: 'Plugin error',
    [SerializationErrorCode.PLUGIN_NOT_FOUND]: 'Plugin not found',
    [SerializationErrorCode.PLUGIN_LOAD_FAILED]: 'Plugin load failed',

    [SerializationErrorCode.HOOK_ERROR]: 'Hook error',
    [SerializationErrorCode.HOOK_EXECUTION_FAILED]: 'Hook execution failed',
  };

  return messages[code] || 'Unknown error';
}
