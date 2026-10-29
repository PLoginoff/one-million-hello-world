/**
 * API Versioning — Deprecation + Sunset Headers
 *
 * Produces the response headers RFC 8594 (`Sunset`) and the IETF
 * deprecation draft (`Deprecation`) prescribe, plus the pragmatic extras
 * clients actually consume:
 *
 *   Deprecation: <date-or-version>   — "this version is deprecated"
 *   Sunset: <http-date>              — "gone after this instant" (RFC 8594)
 *   Link: <url>; rel="successor-version"  — migration pointer
 *   Warning: 299 - "..."             — machine-skimable deprecation note
 *   X-API-Warn-* / vendor headers    — legacy-style notices still common
 *
 * @module ApiVersioning/Negotiation
 */

import { VersionEntry } from './VersionMatrix';

export interface DeprecationHeaderSet {
  readonly headers: Record<string, string>;
}

/** Format epoch ms as an RFC 7231 HTTP-date (IMF-fixdate). */
export function httpDate(epochMs: number): string {
  return new Date(epochMs).toUTCString();
}

/**
 * Build the full header set for a version entry. `version`/`requestPath`
 * feed the Warning text; `now` isn't needed — headers describe declared
 * dates, not computed state (the matrix computes state).
 */
export function deprecationHeaders(entry: VersionEntry, requestPath?: string): DeprecationHeaderSet {
  const headers: Record<string, string> = {};

  if (entry.deprecatedAt !== undefined) {
    // Deprecation draft uses an HTTP-date of the deprecation announcement.
    headers['Deprecation'] = httpDate(entry.deprecatedAt);
  } else {
    headers['Deprecation'] = 'true';
  }

  if (entry.sunsetAt !== undefined) {
    headers['Sunset'] = httpDate(entry.sunsetAt);
  }

  if (entry.migrationGuideUrl !== undefined) {
    headers['Link'] = `<${entry.migrationGuideUrl}>; rel="deprecation"; type="text/html"`;
  }

  if (entry.successor !== undefined) {
    headers['X-API-Successor-Version'] = entry.successor;
    const guide = entry.migrationGuideUrl !== undefined ? ` see ${entry.migrationGuideUrl}` : '';
    const pathBit = requestPath !== undefined ? ` for ${requestPath}` : '';
    headers['Warning'] = `299 - "API version ${entry.version} is deprecated${pathBit}; migrate to ${entry.successor}${guide}"`;
  } else {
    headers['Warning'] = `299 - "API version ${entry.version} is deprecated"`;
  }

  return { headers };
}

/**
 * Beta marker — a softer notice than deprecation:
 * `X-API-Beta: true` + Warning 299 noting instability.
 */
export function betaHeaders(version: string): DeprecationHeaderSet {
  return {
    headers: {
      'X-API-Beta': 'true',
      Warning: `299 - "API version ${version} is beta and may change without notice"`,
    },
  };
}

/** Merge header sets; later entries win per header name. */
export function mergeHeaders(...sets: ReadonlyArray<DeprecationHeaderSet>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of sets) Object.assign(out, s.headers);
  return out;
}
