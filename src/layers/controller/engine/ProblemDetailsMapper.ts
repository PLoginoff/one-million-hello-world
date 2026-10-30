/**
 * RFC 7807 Problem Details Mapper
 *
 * Converts errors and validation issues into
 * `application/problem+json` responses. Maps known error shapes
 * (validation, not-found, not-acceptable, timeout, conflict, generic)
 * to canonical `type` URIs + status codes, with extension members
 * carrying machine-readable context (field paths, retry hints, ...).
 *
 * Type URIs use a `urn:` namespace (`urn:omhw:problem:validation`)
 * rather than URL endpoints — the service doesn't run a docs site;
 * URNs are stable identifiers per RFC 7807's recommendations.
 *
 * @module ControllerLayer/Engine
 */

import { ProblemDetails, ProblemResponse, ValidationIssue } from './types';

/** Canonical problem type URIs. */
export const PROBLEM_TYPES = {
  ABOUT_BLANK: 'about:blank',
  VALIDATION: 'urn:omhw:problem:validation',
  NOT_FOUND: 'urn:omhw:problem:not-found',
  NOT_ACCEPTABLE: 'urn:omhw:problem:not-acceptable',
  METHOD_NOT_ALLOWED: 'urn:omhw:problem:method-not-allowed',
  CONFLICT: 'urn:omhw:problem:conflict',
  TIMEOUT: 'urn:omhw:problem:timeout',
  INTERNAL: 'urn:omhw:problem:internal',
  UNAUTHORIZED: 'urn:omhw:problem:unauthorized',
  FORBIDDEN: 'urn:omhw:problem:forbidden',
} as const;

/** Error categories recognized by the mapper. */
export enum ProblemCategory {
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  NOT_ACCEPTABLE = 'NOT_ACCEPTABLE',
  METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
  CONFLICT = 'CONFLICT',
  TIMEOUT = 'TIMEOUT',
  INTERNAL = 'INTERNAL',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
}

/** Map category → status code. */
const CATEGORY_STATUS: Record<ProblemCategory, number> = {
  [ProblemCategory.VALIDATION]: 400,
  [ProblemCategory.NOT_FOUND]: 404,
  [ProblemCategory.NOT_ACCEPTABLE]: 406,
  [ProblemCategory.METHOD_NOT_ALLOWED]: 405,
  [ProblemCategory.CONFLICT]: 409,
  [ProblemCategory.TIMEOUT]: 504,
  [ProblemCategory.INTERNAL]: 500,
  [ProblemCategory.UNAUTHORIZED]: 401,
  [ProblemCategory.FORBIDDEN]: 403,
};

/** Map category → type URI. */
const CATEGORY_TYPE: Record<ProblemCategory, string> = {
  [ProblemCategory.VALIDATION]: PROBLEM_TYPES.VALIDATION,
  [ProblemCategory.NOT_FOUND]: PROBLEM_TYPES.NOT_FOUND,
  [ProblemCategory.NOT_ACCEPTABLE]: PROBLEM_TYPES.NOT_ACCEPTABLE,
  [ProblemCategory.METHOD_NOT_ALLOWED]: PROBLEM_TYPES.METHOD_NOT_ALLOWED,
  [ProblemCategory.CONFLICT]: PROBLEM_TYPES.CONFLICT,
  [ProblemCategory.TIMEOUT]: PROBLEM_TYPES.TIMEOUT,
  [ProblemCategory.INTERNAL]: PROBLEM_TYPES.INTERNAL,
  [ProblemCategory.UNAUTHORIZED]: PROBLEM_TYPES.UNAUTHORIZED,
  [ProblemCategory.FORBIDDEN]: PROBLEM_TYPES.FORBIDDEN,
};

/** Map category → default title. */
const CATEGORY_TITLE: Record<ProblemCategory, string> = {
  [ProblemCategory.VALIDATION]: 'Validation Failed',
  [ProblemCategory.NOT_FOUND]: 'Resource Not Found',
  [ProblemCategory.NOT_ACCEPTABLE]: 'Not Acceptable',
  [ProblemCategory.METHOD_NOT_ALLOWED]: 'Method Not Allowed',
  [ProblemCategory.CONFLICT]: 'Conflict',
  [ProblemCategory.TIMEOUT]: 'Upstream Timeout',
  [ProblemCategory.INTERNAL]: 'Internal Error',
  [ProblemCategory.UNAUTHORIZED]: 'Unauthorized',
  [ProblemCategory.FORBIDDEN]: 'Forbidden',
};

/**
 * Mapper: error → RFC 7807 problem document.
 */
export class ProblemDetailsMapper {
  private readonly _baseTypeUri: string;
  private readonly _instancePrefix: string;

  constructor(options?: { baseTypeUri?: string; instancePrefix?: string }) {
    this._baseTypeUri = options?.baseTypeUri ?? 'urn:omhw:problem';
    this._instancePrefix = options?.instancePrefix ?? 'urn:omhw:instance';
  }

  /**
   * Build a problem document for a known category.
   */
  for(
    category: ProblemCategory,
    detail?: string,
    extensions?: Record<string, unknown>
  ): ProblemResponse {
    const problem: ProblemDetails = {
      type: `${this._baseTypeUri}:${category.toLowerCase().replace(/_/g, '-')}`,
      title: CATEGORY_TITLE[category],
      status: CATEGORY_STATUS[category],
      ...(detail !== undefined ? { detail } : {}),
      ...(extensions !== undefined ? { extensions } : {}),
    };
    return {
      status: problem.status,
      contentType: 'application/problem+json',
      body: JSON.stringify(problem),
      problem,
    };
  }

  /**
   * Build a problem from DTO validation issues.
   */
  forValidation(issues: readonly ValidationIssue[], instance?: string): ProblemResponse {
    const problem: ProblemDetails = {
      type: PROBLEM_TYPES.VALIDATION,
      title: CATEGORY_TITLE[ProblemCategory.VALIDATION],
      status: CATEGORY_STATUS[ProblemCategory.VALIDATION],
      detail: `Request failed ${issues.length} validation ${issues.length === 1 ? 'check' : 'checks'}`,
      ...(instance !== undefined ? { instance: `${this._instancePrefix}:${instance}` } : {}),
      extensions: {
        issues: issues.map((i) => ({
          path: i.path,
          code: i.code,
          message: i.message,
          ...(i.received !== undefined ? { received: i.received } : {}),
        })),
      },
    };
    return {
      status: problem.status,
      contentType: 'application/problem+json',
      body: JSON.stringify(problem),
      problem,
    };
  }

  /**
   * Map an arbitrary thrown value to a problem document.
   *
   * Recognition order:
   * 1. Errors carrying `status`/`code` properties (HTTP-shaped errors).
   * 2. Error names matching known categories (`NotFoundError`, ...).
   * 3. Generic `Error` → 500 internal.
   * 4. Non-Error values → 500 internal with stringified detail.
   */
  fromError(error: unknown, instance?: string): ProblemResponse {
    if (error instanceof Error) {
      const httpish = error as Error & { status?: unknown; statusCode?: unknown; code?: unknown };
      const status =
        typeof httpish.status === 'number'
          ? httpish.status
          : typeof httpish.statusCode === 'number'
            ? httpish.statusCode
            : null;

      if (status !== null && status >= 400 && status < 600) {
        const category = this._categoryForStatus(status);
        return this.for(category, error.message, {
          name: error.name,
          ...(typeof httpish.code === 'string' ? { code: httpish.code } : {}),
          ...(instance !== undefined ? { instance } : {}),
        });
      }

      const byName = this._categoryForName(error.name);
      if (byName !== undefined) {
        return this.for(byName, error.message, instance !== undefined ? { instance } : undefined);
      }

      return this.for(ProblemCategory.INTERNAL, error.message, {
        name: error.name,
        ...(instance !== undefined ? { instance } : {}),
      });
    }

    return this.for(
      ProblemCategory.INTERNAL,
      typeof error === 'string' ? error : 'Unknown error',
      instance !== undefined ? { instance } : undefined
    );
  }

  private _categoryForStatus(status: number): ProblemCategory {
    switch (status) {
      case 400: return ProblemCategory.VALIDATION;
      case 401: return ProblemCategory.UNAUTHORIZED;
      case 403: return ProblemCategory.FORBIDDEN;
      case 404: return ProblemCategory.NOT_FOUND;
      case 405: return ProblemCategory.METHOD_NOT_ALLOWED;
      case 406: return ProblemCategory.NOT_ACCEPTABLE;
      case 409: return ProblemCategory.CONFLICT;
      case 504: return ProblemCategory.TIMEOUT;
      default: return ProblemCategory.INTERNAL;
    }
  }

  private _categoryForName(name: string): ProblemCategory | undefined {
    const table: Record<string, ProblemCategory> = {
      NotFoundError: ProblemCategory.NOT_FOUND,
      NotAcceptableError: ProblemCategory.NOT_ACCEPTABLE,
      MethodNotAllowedError: ProblemCategory.METHOD_NOT_ALLOWED,
      ConflictError: ProblemCategory.CONFLICT,
      TimeoutError: ProblemCategory.TIMEOUT,
      UnauthorizedError: ProblemCategory.UNAUTHORIZED,
      ForbiddenError: ProblemCategory.FORBIDDEN,
      DtoValidationError: ProblemCategory.VALIDATION,
    };
    return table[name];
  }
}
