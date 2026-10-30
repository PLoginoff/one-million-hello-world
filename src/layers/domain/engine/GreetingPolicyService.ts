/**
 * Greeting Policy Domain Service
 *
 * Domain service governing the HelloWorld greeting rules:
 * - Language validation against a supported-language registry
 * - Message formatting via per-language templates
 * - Audit fields (who/when/what decision)
 *
 * This is a pure domain service — it knows *what* a valid greeting is
 * and *why* a request was rejected; it doesn't know about transport,
 * storage, or callers.
 *
 * @module DomainLayer/Engine
 */

import {
  GreetingAuditEntry,
  GreetingLanguage,
  GreetingPolicyResult,
} from './types';
import { spec, evaluate } from './Specification';
import type { Specification } from './types';

/** Built-in language registry. */
const SUPPORTED_LANGUAGES: Record<string, GreetingLanguage> = {
  en: { code: 'en', name: 'English', template: 'Hello, {name}!' },
  es: { code: 'es', name: 'Spanish', template: '¡Hola, {name}!' },
  fr: { code: 'fr', name: 'French', template: 'Bonjour, {name}!' },
  de: { code: 'de', name: 'German', template: 'Hallo, {name}!' },
  ja: { code: 'ja', name: 'Japanese', template: 'こんにちは、{name}さん！' },
  pt: { code: 'pt', name: 'Portuguese', template: 'Olá, {name}!' },
  it: { code: 'it', name: 'Italian', template: 'Ciao, {name}!' },
  zh: { code: 'zh', name: 'Chinese', template: '，{name}！' },
};

/**
 * A greeting request entering the domain.
 */
export interface GreetingRequest {
  readonly language: string;
  readonly name?: string;
  readonly requesterId?: string;
}

/**
 * Domain service implementing greeting policy.
 */
export class GreetingPolicyService {
  private readonly _languages: Record<string, GreetingLanguage>;
  private readonly _languageSpec: Specification<GreetingRequest>;
  private readonly _nameSpec: Specification<GreetingRequest>;
  private readonly _audit: GreetingAuditEntry[];

  constructor(languages?: Record<string, GreetingLanguage>) {
    this._languages = languages ?? SUPPORTED_LANGUAGES;
    this._audit = [];

    this._languageSpec = spec<GreetingRequest>(
      'language-supported',
      (r) => r.language in this._languages
    );
    this._nameSpec = spec<GreetingRequest>(
      'name-well-formed',
      (r) => r.name === undefined || (r.name.length > 0 && r.name.length <= 100)
    );
  }

  /**
   * Evaluate the request and produce a policy decision.
   */
  evaluate(request: GreetingRequest, now = new Date()): GreetingPolicyResult {
    const languageReport = evaluate(this._languageSpec, request);
    const nameReport = evaluate(this._nameSpec, request);

    const allowed = languageReport.satisfied && nameReport.satisfied;
    const failures = [...languageReport.failures, ...nameReport.failures];
    const reason = failures.length > 0 ? failures.join('; ') : undefined;

    let formattedMessage: string | undefined;
    if (allowed) {
      const lang = this._languages[request.language];
      formattedMessage = lang.template.replace(
        '{name}',
        request.name ?? 'world'
      );
    }

    const audit: GreetingAuditEntry = {
      requestedLanguage: request.language,
      requestedName: request.name,
      allowed,
      timestamp: now,
    };
    if (reason !== undefined) {
      this._audit.push({ ...audit, reason });
    } else {
      this._audit.push(audit);
    }

    const result: GreetingPolicyResult = { allowed };
    if (reason !== undefined) {
      return { ...result, reason };
    }
    if (formattedMessage !== undefined) {
      return { ...result, formattedMessage };
    }
    return result;
  }

  /**
   * Audit trail — every evaluated request leaves a trace.
   */
  auditTrail(): readonly GreetingAuditEntry[] {
    return [...this._audit];
  }

  /**
   * All supported language codes.
   */
  supportedLanguages(): string[] {
    return Object.keys(this._languages).sort();
  }
}
