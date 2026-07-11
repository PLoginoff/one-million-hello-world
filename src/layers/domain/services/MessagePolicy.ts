import { HelloWorldMessage } from '../entities/HelloWorldMessage';

export interface MessagePolicyResult {
  allowed: boolean;
  reason?: string;
}

export class MessagePolicy {
  private readonly _blockedLanguages: Set<string>;
  private readonly _maxDailyMessages: number;

  constructor(blockedLanguages: string[] = [], maxDailyMessages: number = 1000000) {
    this._blockedLanguages = new Set(blockedLanguages);
    this._maxDailyMessages = maxDailyMessages;
  }

  canServe(message: HelloWorldMessage, dailyCount: number): MessagePolicyResult {
    if (this._blockedLanguages.has(message.language)) {
      return { allowed: false, reason: `Language ${message.language} is blocked` };
    }

    if (dailyCount >= this._maxDailyMessages) {
      return { allowed: false, reason: 'Daily message quota exceeded' };
    }

    return { allowed: true };
  }

  isFormatAllowed(format: string): boolean {
    return ['json', 'xml', 'plain', 'html'].includes(format);
  }
}
