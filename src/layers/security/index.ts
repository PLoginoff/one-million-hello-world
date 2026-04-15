/**
 * Security Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Security Layer (Layer 3 of the 25-layer architecture).
 * 
 * The Security Layer provides authentication, authorization, CORS validation,
 * and threat detection for HTTP requests.
 * 
 * @module SecurityLayer
 */

export { ISecurityManager } from './interfaces/ISecurityManager';
export { SecurityManager } from './implementations/SecurityManager';
export * from './types/security-types';
