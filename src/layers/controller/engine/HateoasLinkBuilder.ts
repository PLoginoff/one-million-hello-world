/**
 * HATEOAS Link Builder
 *
 * Fluent builder producing RFC 8288 web-link records and HAL-style
 * resource envelopes (`data` + `links` array). Supports RFC 6570
 * URI templates (marked `templated: true`) and standard IANA rels
 * (`self`, `next`, `prev`, `related`, `collection`, `item`, ...).
 *
 * Uri-template detection is structural — a link containing `{name}`
 * gets `templated: true` so clients know to expand it rather than
 * follow it literally.
 *
 * @module ControllerLayer/Engine
 */

import { Link, LinkedResource } from './types';

/** Common IANA link relations used by this codebase's APIs. */
export const REL = {
  SELF: 'self',
  NEXT: 'next',
  PREV: 'prev',
  FIRST: 'first',
  LAST: 'last',
  RELATED: 'related',
  COLLECTION: 'collection',
  ITEM: 'item',
  EDIT: 'edit',
  DELETE: 'delete',
} as const;

/**
 * Detect RFC 6570 templated links: `{var}` or `{+var}` / `{?a,b}`.
 */
export function isTemplated(href: string): boolean {
  return /\{[^}]*\}/.test(href);
}

/** Expand a URI template variable `{name}` with concrete values. */
export function expandTemplate(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{([^{}]+)\}/g, (_match, expr: string) => {
    // Strip RFC 6570 operator prefix if present (+, #, ., /, ;, ?, &).
    const names = /^[+#./;?&]/.test(expr) ? expr.slice(1).split(',') : expr.split(',');
    const expanded = names.map((name) => {
      const key = name.trim();
      const v = values[key];
      return v === undefined ? `{${key}}` : encodeURIComponent(String(v));
    });
    return expanded.join(',');
  });
}

/** Escape a value for safe interpolation into a URL path segment. */
export function urlSegment(value: string | number): string {
  return encodeURIComponent(String(value));
}

/**
 * Mutable builder — accumulate links then `build()`.
 */
export class LinkBuilder {
  private readonly _links: Link[];

  constructor() {
    this._links = [];
  }

  /**
   * Append a link. `templated` is auto-detected when not provided.
   */
  add(rel: string, href: string, options?: { type?: string; title?: string; method?: string; templated?: boolean }): this {
    const link: Link = {
      rel,
      href,
      templated: options?.templated ?? isTemplated(href),
    };
    const withOpts: Link = {
      ...link,
      ...(options?.type !== undefined ? { type: options.type } : {}),
      ...(options?.title !== undefined ? { title: options.title } : {}),
      ...(options?.method !== undefined ? { method: options.method } : {}),
    };
    this._links.push(withOpts);
    return this;
  }

  /** `self` rel — canonical URI of the current resource. */
  self(href: string): this {
    return this.add(REL.SELF, href);
  }

  /** `next` rel — next page of a collection. */
  next(href: string): this {
    return this.add(REL.NEXT, href);
  }

  /** `prev` rel — previous page of a collection. */
  prev(href: string): this {
    return this.add(REL.PREV, href);
  }

  /** `related` rel — related resource. */
  related(href: string, title?: string): this {
    return this.add(REL.RELATED, href, title !== undefined ? { title } : undefined);
  }

  /** `collection` rel — parent collection. */
  collection(href: string): this {
    return this.add(REL.COLLECTION, href);
  }

  /** `item` rel — member of a collection. */
  item(href: string): this {
    return this.add(REL.ITEM, href);
  }

  /** `first` / `last` pagination rels. */
  first(href: string): this {
    return this.add(REL.FIRST, href);
  }

  last(href: string): this {
    return this.add(REL.LAST, href);
  }

  /** Materialize the accumulated links. */
  build(): readonly Link[] {
    return [...this._links];
  }

  /** Look up the href for a rel (first match). */
  hrefFor(rel: string): string | undefined {
    return this._links.find((l) => l.rel === rel)?.href;
  }

  /** Number of accumulated links. */
  get size(): number {
    return this._links.length;
  }

  /**
   * Wrap a resource in a HAL-flavored envelope.
   */
  static envelope<T>(data: T, links: readonly Link[]): LinkedResource<T> {
    return { data, links };
  }
}

/**
 * Convenience: pagination link set for a collection endpoint.
 *
 * Emits `self`, `first`, `prev` (when page > 1), `next` (when
 * page < totalPages), `last`. `href` may contain `{page}`/`{size}` —
 * resolved via {@link expandTemplate}.
 */
export function paginationLinks(
  baseHref: string,
  page: number,
  pageSize: number,
  totalItems: number
): readonly Link[] {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const resolve = (p: number): string => expandTemplate(baseHref, { page: p, size: pageSize });

  const builder = new LinkBuilder()
    .self(resolve(page))
    .first(resolve(1))
    .last(resolve(totalPages));

  if (page > 1) {
    builder.prev(resolve(page - 1));
  }
  if (page < totalPages) {
    builder.next(resolve(page + 1));
  }
  return builder.build();
}
