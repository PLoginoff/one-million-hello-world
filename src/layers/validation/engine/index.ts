/**
 * Validation Engine — public exports.
 *
 * @module ValidationLayer/Engine
 */

export * from './types';
// Named EngineCrossFieldRule to avoid collision with types/validation-types.
// resolve the ambiguity by keeping that one as the layer-level default and
// re-exporting the engine's under a distinct name.
export { SchemaCompiler } from './SchemaCompiler';
export { CoercionPipeline } from './CoercionPipeline';
export { ErrorPath } from './ErrorPath';
