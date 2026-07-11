/**
 * DeadLetter Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the DeadLetter Layer (Layer 58 of the architecture).
 */

export { IDeadLetter } from './interfaces/IDeadLetter';
export { DeadLetter } from './implementations/DeadLetter';
export * from './types/dead-letter-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
