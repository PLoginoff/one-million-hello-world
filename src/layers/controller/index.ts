/**
 * Controller Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Controller Layer (Layer 8 of the 25-layer architecture).
 * 
 * The Controller Layer provides request handling, orchestration,
 * and response code generation.
 * 
 * @module ControllerLayer
 */

export { IController } from './interfaces/IController';
export { Controller } from './implementations/Controller';
export * from './types/controller-types';
