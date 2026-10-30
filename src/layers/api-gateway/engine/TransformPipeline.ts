/**
 * Transform Pipeline
 *
 * Applies ordered rewrite rules to requests before proxying and to
 * responses on the way back. Rules are compiled once per route and
 * executed in O(R) where R is the number of applicable rules.
 *
 * Rule targets:
 *  - `header:<name>`   set a header (value optional; absence removes)
 *  - `query:<name>`    set/remove a query parameter
 *  - `path`            rewrite the path; `{param}` placeholders are
 *                      expanded from route params
 *  - `upstream-path`   same as `path` but kept as separate field so a
 *                      route can rewrite the path sent to the upstream
 *                      without changing the publicly logged path
 *
 * Values support `{param}` interpolation from route match params and
 * `{header:<name>}` / `{query:<name>}` lookups.
 *
 * @module ApiGatewayLayer/Engine
 */

import {
  GatewayRequest,
  GatewayResponse,
  RouteMatch,
  TransformCondition,
  TransformRule,
} from './types';

/** Mutable working copy of request fields during transformation. */
export interface TransformedRequest {
  method: string;
  path: string;
  upstreamPath: string;
  query: Record<string, string>;
  headers: Record<string, string[]>;
  body?: unknown;
}

/** Result of running the request transform pipeline. */
export interface TransformResult {
  request: TransformedRequest;
  /** Names of rules that fired, for observability. */
  appliedRules: string[];
}

/**
 * Interpolate `{param}`, `{header:name}` and `{query:name}`
 * placeholders in a template string.
 */
function interpolate(
  template: string,
  params: Record<string, string>,
  headers: Record<string, string[]>,
  query: Record<string, string>
): string {
  return template.replace(/\{([^}]+)\}/g, (whole, raw: string) => {
    const key = raw.trim();
    if (key.startsWith('header:')) {
      const name = key.slice('header:'.length).toLowerCase();
      return headers[name]?.[0] ?? whole;
    }
    if (key.startsWith('query:')) {
      const name = key.slice('query:'.length);
      return query[name] ?? whole;
    }
    const v = params[key];
    return v === undefined ? whole : v;
  });
}

/**
 * Evaluate a transform condition against the request context.
 */
function conditionMatches(
  cond: TransformCondition,
  req: TransformedRequest,
  params: Record<string, string>
): boolean {
  let actual: string | undefined;
  switch (cond.source) {
    case 'header':
      actual = req.headers[cond.name.toLowerCase()]?.[0];
      break;
    case 'query':
      actual = req.query[cond.name];
      break;
    case 'param':
      actual = params[cond.name];
      break;
  }
  if (cond.equals !== undefined) {
    return actual === cond.equals;
  }
  if (cond.matches !== undefined) {
    return actual !== undefined && cond.matches.test(actual);
  }
  return actual !== undefined;
}

/**
 * Request/Response Transform Pipeline.
 *
 * Stateless: every invocation creates a working copy, so concurrent
 * requests never share mutable header maps.
 */
export class TransformPipeline {
  /**
   * Apply request transforms for a matched route.
   *
   * The original request object is never mutated; a shallow-structured
   * clone of headers/query is returned.
   */
  applyRequest(
    request: GatewayRequest,
    match: RouteMatch,
    basePath: string
  ): TransformResult {
    const req: TransformedRequest = {
      method: request.method,
      path: request.path,
      upstreamPath: basePath,
      query: { ...request.query },
      headers: {},
      body: request.body,
    };
    for (const [name, values] of Object.entries(request.headers)) {
      req.headers[name] = [...values];
    }

    const applied: string[] = [];
    const rules = match.route.transforms ?? [];
    for (const rule of rules) {
      if (rule.when && !conditionMatches(rule.when, req, match.params)) {
        continue;
      }
      const desc = `${rule.target}=${rule.value ?? '<remove>'}`;
      if (this._applyRule(req, rule, match.params)) {
        applied.push(desc);
      }
    }
    return { request: req, appliedRules: applied };
  }

  /**
   * Apply response transforms for a matched route. Same rule syntax;
   * `path`/`query` targets are ignored on responses.
   */
  applyResponse(
    response: GatewayResponse,
    match: RouteMatch,
    requestHeaders: Record<string, string[]>
  ): GatewayResponse {
    const rules = match.route.responseTransforms ?? [];
    if (rules.length === 0) return response;
    const headers: Record<string, string[]> = {};
    for (const [name, values] of Object.entries(response.headers)) {
      headers[name] = [...values];
    }
    const fakeReq: TransformedRequest = {
      method: 'GET',
      path: '',
      upstreamPath: '',
      query: {},
      headers,
    };
    for (const rule of rules) {
      if (!rule.target.startsWith('header:')) continue;
      if (rule.when && !conditionMatches(rule.when, fakeReq, match.params)) {
        continue;
      }
      const name = rule.target.slice('header:'.length).toLowerCase();
      if (rule.value === undefined) {
        delete headers[name];
      } else {
        headers[name] = [
          interpolate(rule.value, match.params, requestHeaders, {}),
        ];
      }
    }
    return { ...response, headers };
  }

  /**
   * Execute a single rule against the working request.
   * Returns true when the rule changed something.
   */
  private _applyRule(
    req: TransformedRequest,
    rule: TransformRule,
    params: Record<string, string>
  ): boolean {
    const target = rule.target;
    if (target === 'path') {
      if (rule.value === undefined) return false;
      req.path = interpolate(rule.value, params, req.headers, req.query);
      return true;
    }
    if (target === 'upstream-path') {
      if (rule.value === undefined) return false;
      req.upstreamPath = interpolate(rule.value, params, req.headers, req.query);
      return true;
    }
    if (target.startsWith('header:')) {
      const name = target.slice('header:'.length).toLowerCase();
      if (rule.value === undefined) {
        if (!(name in req.headers)) return false;
        delete req.headers[name];
        return true;
      }
      req.headers[name] = [interpolate(rule.value, params, req.headers, req.query)];
      return true;
    }
    if (target.startsWith('query:')) {
      const name = target.slice('query:'.length);
      if (rule.value === undefined) {
        if (!(name in req.query)) return false;
        delete req.query[name];
        return true;
      }
      req.query[name] = interpolate(rule.value, params, req.headers, req.query);
      return true;
    }
    return false;
  }
}
