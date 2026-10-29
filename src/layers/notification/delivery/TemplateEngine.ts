/**
 * Template Engine
 *
 * Renders `{{variable}}` placeholders with HTML-escaping by default and
 * `{{{raw}}}` triple-brace unescaped output. Supports `{{#each items}}…{{/each}}`
 * for list rendering and `{{#if var}}…{{/if}}` for conditionals.
 *
 * Escaping table (OWASP minimal):
 *   & → &amp;   < → &lt;   > → &gt;   " → &quot;   ' → &#39;
 *
 * Templates are registered by key at runtime — no file I/O.
 *
 * @module NotificationLayer/Delivery
 */

import { DeliveryError } from './NotificationTypes';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a string for safe interpolation into HTML-ish bodies. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Registered template pair. */
export interface Template {
  readonly subject: string;
  readonly body: string;
}

/**
 * Minimal mustache-ish renderer. Not a full spec — just what notifications
 * need: `{{var}}`, `{{{raw}}}`, `{{#if}}…{{/if}}`, `{{#each}}…{{/each}}`
 * (with `{{this}}` and `{{@index}}` inside loops).
 */
export class TemplateEngine {
  private readonly _templates = new Map<string, Template>();

  register(key: string, template: Template): void {
    this._templates.set(key, template);
  }

  has(key: string): boolean {
    return this._templates.has(key);
  }

  /** Render a registered template's subject+body. */
  render(
    key: string,
    vars: Readonly<Record<string, unknown>>
  ): { subject: string; body: string } {
    const t = this._templates.get(key);
    if (!t) {
      throw new DeliveryError('TEMPLATE_NOT_FOUND', `no template '${key}'`);
    }
    return {
      subject: renderString(t.subject, vars),
      body: renderString(t.body, vars),
    };
  }

  /** Render a raw template string (no registration needed). */
  renderString(template: string, vars: Readonly<Record<string, unknown>>): string {
    return renderString(template, vars);
  }
}

// ---------------------------------------------------------------- internals

type Scope = Readonly<Record<string, unknown>>;

function lookup(scope: Scope, name: string): unknown {
  if (name === 'this') return (scope as { this?: unknown }).this;
  if (name.startsWith('this.')) {
    const t = (scope as { this?: unknown }).this;
    if (t !== null && typeof t === 'object') {
      return (t as Record<string, unknown>)[name.slice(5)];
    }
    return undefined;
  }
  if (!(name in scope)) return undefined;
  return scope[name];
}

function toText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') {
    return String(v);
  }
  return JSON.stringify(v);
}

function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  if (typeof v === 'string' && v.length === 0) return false;
  if (typeof v === 'number' && v === 0) return false;
  return true;
}

/**
 * Recursive-descent renderer over the template string.
 * Complexity: O(n × depth) for nesting depth — fine for notification sizes.
 */
function renderString(template: string, vars: Scope): string {
  let out = '';
  let i = 0;
  const n = template.length;

  while (i < n) {
    const open = template.indexOf('{{', i);
    if (open === -1) {
      out += template.slice(i);
      break;
    }
    out += template.slice(i, open);

    if (template.startsWith('{{{', open)) {
      // Raw unescaped: {{{var}}}
      const close = template.indexOf('}}}', open + 3);
      if (close === -1) throw new DeliveryError('RENDER_FAILED', 'unclosed {{{');
      const name = template.slice(open + 3, close).trim();
      out += toText(lookup(vars, name));
      i = close + 3;
      continue;
    }

    const close = template.indexOf('}}', open + 2);
    if (close === -1) throw new DeliveryError('RENDER_FAILED', 'unclosed {{');
    const tag = template.slice(open + 2, close).trim();

    if (tag.startsWith('#if ')) {
      const name = tag.slice(4).trim();
      const { inner, end } = extractBlock(template, close + 2, 'if');
      if (truthy(lookup(vars, name))) {
        out += renderString(inner, vars);
      }
      i = end;
      continue;
    }

    if (tag.startsWith('#each ')) {
      const name = tag.slice(6).trim();
      const { inner, end } = extractBlock(template, close + 2, 'each');
      const list = lookup(vars, name);
      if (Array.isArray(list)) {
        list.forEach((item, idx) => {
          const child: Record<string, unknown> = {
            ...vars,
            this: item,
            '@index': idx,
          };
          out += renderString(inner, child);
        });
      }
      i = end;
      continue;
    }

    if (tag.startsWith('/')) {
      // Stray closing tag — treat as literal to stay total.
      out += `{{${tag}}}`;
      i = close + 2;
      continue;
    }

    // Plain variable, escaped.
    const v = lookup(vars, tag);
    out += escapeHtml(toText(v));
    i = close + 2;
  }
  return out;
}

/**
 * Extract the inner text of a `{{#name}}…{{/name}}` block starting after the
 * open tag. Handles NESTED blocks of the same kind by counting depth.
 * Returns the inner text and the index just past the closing tag.
 */
function extractBlock(
  template: string,
  from: number,
  kind: string
): { inner: string; end: number } {
  const openTag = `{{#${kind}`;
  const closeTag = `{{/${kind}}}`;
  let depth = 1;
  let i = from;
  while (i < template.length) {
    const nextOpen = template.indexOf(openTag, i);
    const nextClose = template.indexOf(closeTag, i);
    if (nextClose === -1) {
      throw new DeliveryError('RENDER_FAILED', `unclosed {{#${kind}}}`);
    }
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + openTag.length;
      continue;
    }
    depth--;
    if (depth === 0) {
      return { inner: template.slice(from, nextClose), end: nextClose + closeTag.length };
    }
    i = nextClose + closeTag.length;
  }
  throw new DeliveryError('RENDER_FAILED', `unclosed {{#${kind}}}`);
}
