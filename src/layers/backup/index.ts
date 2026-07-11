/**
 * Backup Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Backup Layer (Layer 39 of the architecture).
 */

export { IBackup } from './interfaces/IBackup';
export { Backup } from './implementations/Backup';
export * from './types/backup-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
