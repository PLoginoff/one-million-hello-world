/**
 * Network Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Network Layer (Layer 1 of the 25-layer architecture).
 * 
 * The Network Layer provides TCP/IP abstraction and socket management.
 * It is responsible for low-level network operations and connection handling.
 * 
 * @module NetworkLayer
 */

export { INetworkConnection } from './interfaces/INetworkConnection';
export { INetworkManager } from './interfaces/INetworkManager';
export { NetworkConnection } from './implementations/NetworkConnection';
export { NetworkManager } from './implementations/NetworkManager';
export * from './types/network-types';
