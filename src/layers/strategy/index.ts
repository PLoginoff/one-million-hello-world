/**
 * Strategy Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Strategy Layer (Layer 21 of the 25-layer architecture).
 * 
 * The Strategy Layer provides execution strategies,
 * A/B testing, and feature flags.
 * 
 * @module StrategyLayer
 */

export { IStrategyManager } from './interfaces/IStrategyManager';
export { StrategyManager } from './implementations/StrategyManager';
export * from './types/strategy-types';
