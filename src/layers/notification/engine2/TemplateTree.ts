/**
 * Template Tree — base/child template inheritance.
 *
 * `delivery/TemplateEngine` renders a flat template map; this module
 * adds inheritance so a template family can specialize per channel or
 * tenant without copy-paste:
 *
 *   "alert"                → base: generic subject + body
 *   "alert.sms"            → child: overrides body only (short)
 *   "alert.sms.eu-tenant"  → grandchild: overrides subject (localized)
 *
 * Resolution walks the parent chain collecting fragments; the child's
 * declared fields shadow the parent's, missing fields inherit. Render
 * reuses the delivery engine's `{{var}}` interpolation via a delegated
 * TemplateEngine, keeping one interpolation semantics.
 *
 * Cycle safety: resolution is bounded by chain depth and a visited set
 * — a cycle raises `TemplateCycleError` rather than looping.
 *
 * @module NotificationLayer/Engine2
 */

import { TemplateEngine } from '../delivery/TemplateEngine';
import { RenderedTemplate, TemplateFragment, TemplateNode } from './types';

const MAX_DEPTH = 16;

export class TemplateCycleError extends Error {
  constructor(key: string) {
    super(`template inheritance cycle at "${key}"`);
    this.name = 'TemplateCycleError';
  }
}

export class TemplateNotFoundError extends Error {
  constructor(key: string) {
    super(`unknown template "${key}"`);
    this.name = 'TemplateNotFoundError';
  }
}

export class TemplateTree {
  private readonly _nodes = new Map<string, TemplateNode>();
  private readonly _renderer: TemplateEngine;

  constructor(renderer?: TemplateEngine) {
    this._renderer = renderer ?? new TemplateEngine();
  }

  register(node: TemplateNode): void {
    this._nodes.set(node.key, node);
  }

  registerAll(nodes: ReadonlyArray<TemplateNode>): void {
    for (const n of nodes) this.register(n);
  }

  /**
   * Resolve the effective fragment for `key`: child overrides parent
   * field-by-field. Returns the merged fragment + the lineage chain
   * (root-first) for debugging.
   */
  resolve(key: string): { fragment: Required<TemplateFragment>; lineage: string[] } {
    const chain: TemplateNode[] = [];
    const visited = new Set<string>();
    let cur: TemplateNode | undefined = this._nodes.get(key);
    if (!cur) throw new TemplateNotFoundError(key);
    let depth = 0;
    while (cur) {
      if (visited.has(cur.key)) throw new TemplateCycleError(cur.key);
      if (depth++ > MAX_DEPTH) throw new TemplateCycleError(cur.key);
      visited.add(cur.key);
      chain.unshift(cur); // root-first order
      if (cur.parentKey === undefined) break;
      const parent: TemplateNode | undefined = this._nodes.get(cur.parentKey);
      if (!parent) throw new TemplateNotFoundError(cur.parentKey); // dangling link
      cur = parent;
    }
    // Merge root → leaf; later (more derived) fields win.
    let subject = '';
    let body = '';
    for (const node of chain) {
      if (node.fragment.subject !== undefined) subject = node.fragment.subject;
      if (node.fragment.body !== undefined) body = node.fragment.body;
    }
    return {
      fragment: { subject, body },
      lineage: chain.map((n) => n.key),
    };
  }

  /** Resolve + interpolate in one step. */
  render(key: string, vars: Record<string, unknown>): RenderedTemplate {
    const { fragment, lineage } = this.resolve(key);
    return {
      subject: this._renderer.renderString(fragment.subject, vars),
      body: this._renderer.renderString(fragment.body, vars),
      lineage,
    };
  }

  /** Dot-suffix lookup: "alert.sms" → tries "alert.sms", then "alert". */
  renderWithFallback(key: string, vars: Record<string, unknown>): RenderedTemplate {
    let k = key;
    for (;;) {
      if (this._nodes.has(k)) return this.render(k, vars);
      const dot = k.lastIndexOf('.');
      if (dot < 0) throw new TemplateNotFoundError(key);
      k = k.slice(0, dot);
    }
  }

  /** All declared node keys. */
  keys(): string[] {
    return [...this._nodes.keys()];
  }
}
