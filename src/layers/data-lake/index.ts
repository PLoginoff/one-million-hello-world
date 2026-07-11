/**
 * DataLake Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the DataLake Layer (Layer 76 of the architecture).
 */

export { IDataLake } from './interfaces/IDataLake';
export { DataLake } from './implementations/DataLake';
export * from './types/data-lake-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
