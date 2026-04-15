/**
 * Message Queue Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Message Queue Layer (Layer 14 of the 25-layer architecture).
 * 
 * The Message Queue Layer provides async processing
 * and dead letter queues.
 * 
 * @module MessageQueueLayer
 */

export { IMessageQueue, MessageHandler } from './interfaces/IMessageQueue';
export { MessageQueue } from './implementations/MessageQueue';
export * from './types/message-queue-types';
