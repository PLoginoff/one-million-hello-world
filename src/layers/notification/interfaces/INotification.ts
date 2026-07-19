/**
 * Notification Interface
 *
 * Defines the contract for the Email, SMS, and push notification abstractions layer.
 */

import { NotificationResult, NotificationContext } from '../types/notification-types';

export interface INotification {
  execute(context: NotificationContext): Promise<NotificationResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
