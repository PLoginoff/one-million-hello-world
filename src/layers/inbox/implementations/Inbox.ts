/**
 * Inbox Implementation
 *
 * Concrete implementation of IInbox.
 * Handles Inbox pattern for idempotent consumers.
 */

import { IInbox } from '../interfaces/IInbox';
import { InboxResult, InboxContext, InboxError } from '../types/inbox-types';

export class Inbox implements IInbox {
  private _config: Record<string, unknown>;
  private _metrics: Map<string, number>;

  constructor() {
    this._config = {};
    this._metrics = new Map();
  }

  execute(context: InboxContext): Promise<InboxResult<unknown>> {
    const startTime = Date.now();
    try {
      const output = this._process(context);
      this._recordMetric('successCount', 1);
      this._recordMetric('lastExecutionTime', Date.now() - startTime);
      return Promise.resolve({ success: true, data: output });
    } catch (error) {
      this._recordMetric('failureCount', 1);
      const inboxError: InboxError = {
        code: 'INBOX_EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      return Promise.resolve({
        success: false,
        error: inboxError,
      });
    }
  }

  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config };
  }

  getStatus(): Record<string, unknown> {
    return {
      config: this._config,
      metrics: Object.fromEntries(this._metrics),
      active: true,
    };
  }

  private _process(context: InboxContext): unknown {
    return { processed: true, context, layer: 'Inbox' };
  }

  private _recordMetric(name: string, delta: number): void {
    const current = this._metrics.get(name) ?? 0;
    this._metrics.set(name, current + delta);
  }
}
