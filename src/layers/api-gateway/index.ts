/**
 * ApiGateway Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the ApiGateway Layer (Layer 26 of the architecture).
 */

export { IApiGateway } from './interfaces/IApiGateway';
export { ApiGateway } from './implementations/ApiGateway';
export * from './types/api-gateway-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
