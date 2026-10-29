/**
 * StreamProcessing Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the StreamProcessing Layer (Layer 79 of the architecture).
 */

export { IStreamProcessing } from './interfaces/IStreamProcessing';
export { StreamProcessing } from './implementations/StreamProcessing';
export * from './types/stream-processing-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';

export * from "./implementations/StreamEngine";
