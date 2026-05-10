/**
 * Saga Alert Manager
 *
 * Manages alerts and notifications for saga executions.
 * Provides configurable alert rules and notification channels.
 */

export interface AlertRule {
  ruleId: string;
  name: string;
  condition: (metrics: any) => boolean;
  severity: 'info' | 'warning' | 'error' | 'critical';
  enabled: boolean;
}

export interface Alert {
  alertId: string;
  ruleId: string;
  executionId: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export class SagaAlertManager {
  private readonly _rules: Map<string, AlertRule>;
  private readonly _alerts: Alert[];
  private readonly _notificationChannels: Set<(alert: Alert) => void>;

  constructor() {
    this._rules = new Map();
    this._alerts = [];
    this._notificationChannels = new Set();
  }

  /**
   * Add alert rule
   */
  addRule(rule: AlertRule): void {
    this._rules.set(rule.ruleId, rule);
  }

  /**
   * Remove alert rule
   */
  removeRule(ruleId: string): void {
    this._rules.delete(ruleId);
  }

  /**
   * Evaluate rules against metrics
   */
  evaluateRules(metrics: any): Alert[] {
    const triggeredAlerts: Alert[] = [];

    for (const rule of this._rules.values()) {
      if (!rule.enabled) {
        continue;
      }

      if (rule.condition(metrics)) {
        const alert: Alert = {
          alertId: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          ruleId: rule.ruleId,
          executionId: metrics.executionId || 'unknown',
          message: `Alert triggered: ${rule.name}`,
          severity: rule.severity,
          timestamp: Date.now(),
          metadata: { ...metrics },
        };

        this._alerts.push(alert);
        triggeredAlerts.push(alert);

        this._sendNotifications(alert);
      }
    }

    return triggeredAlerts;
  }

  /**
   * Add notification channel
   */
  addNotificationChannel(channel: (alert: Alert) => void): void {
    this._notificationChannels.add(channel);
  }

  /**
   * Remove notification channel
   */
  removeNotificationChannel(channel: (alert: Alert) => void): void {
    this._notificationChannels.delete(channel);
  }

  /**
   * Get alerts
   */
  getAlerts(limit?: number): Alert[] {
    if (limit) {
      return this._alerts.slice(-limit);
    }
    return [...this._alerts];
  }

  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: string): Alert[] {
    return this._alerts.filter(a => a.severity === severity);
  }

  /**
   * Clear alerts
   */
  clearAlerts(): void {
    this._alerts.length = 0;
  }

  private _sendNotifications(alert: Alert): void {
    for (const channel of this._notificationChannels) {
      try {
        channel(alert);
      } catch (error) {
        console.error('Failed to send notification:', error);
      }
    }
  }

  /**
   * Create default alert rules
   */
  static createDefaultRules(): AlertRule[] {
    return [
      {
        ruleId: 'saga-failed',
        name: 'Saga Failed',
        condition: (metrics) => metrics.status === 'failed',
        severity: 'error',
        enabled: true,
      },
      {
        ruleId: 'saga-timeout',
        name: 'Saga Timeout',
        condition: (metrics) => metrics.duration > 300000,
        severity: 'warning',
        enabled: true,
      },
      {
        ruleId: 'saga-high-retry-count',
        name: 'High Retry Count',
        condition: (metrics) => metrics.attemptCount > 5,
        severity: 'warning',
        enabled: true,
      },
      {
        ruleId: 'saga-compensation-failed',
        name: 'Compensation Failed',
        condition: (metrics) => metrics.status === 'compensated' && metrics.failedSteps > 0,
        severity: 'error',
        enabled: true,
      },
    ];
  }
}
