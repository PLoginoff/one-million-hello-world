/**
 * SIEM Audit Adapter
 *
 * Sends audit entries to a SIEM system (mock implementation for testing).
 */

import { IAudit } from '../interfaces/IAudit';
import { AuditContext, AuditResult } from '../types/audit-types';

interface SiemEvent {
  timestamp: number;
  input: unknown;
  metadata: Record<string, unknown>;
  severity: string;
}

export class SiemAuditAdapter implements IAudit {
  private _events: SiemEvent[];
  private _siemUrl: string;
  private _apiKey: string;
  private _config: Record<string, unknown>;

  constructor(siemUrl: string = 'http://siem.local:8080', apiKey: string = '') {
    this._events = [];
    this._siemUrl = siemUrl;
    this._apiKey = apiKey;
    this._config = {};
  }

  async execute(context: AuditContext): Promise<AuditResult<unknown>> {
    const severity = (context.metadata.severity as string) ?? 'info';

    const event: SiemEvent = {
      timestamp: Date.now(),
      input: context.input,
      metadata: context.metadata,
      severity,
    };

    this._events.push(event);

    await Promise.resolve();
    return { success: true, data: { eventId: this._events.length, siemUrl: this._siemUrl } };
  }

  configure(config: Record<string, unknown>): void {
    this._config = config;
    if (typeof config.siemUrl === 'string') {
      this._siemUrl = config.siemUrl;
    }
    if (typeof config.apiKey === 'string') {
      this._apiKey = config.apiKey;
    }
  }

  getStatus(): Record<string, unknown> {
    return {
      adapter: 'siem',
      siemUrl: this._siemUrl,
      connected: this._apiKey.length > 0,
      eventCount: this._events.length,
    };
  }

  getEvents(): SiemEvent[] {
    return [...this._events];
  }

  clear(): void {
    this._events = [];
  }
}
