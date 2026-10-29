/**
 * Multi-Tenancy — Data Isolation Models
 *
 * Two isolation strategies behind one helper API:
 *
 *   1. SHARED TABLE + `tenant_id` column (default): every row carries a
 *      tenant discriminator; the `TenantScopedStore` enforces that every
 *      read/write is scoped to the ambient TenantContext — a missing
 *      context refuses to run rather than leaking cross-tenant data.
 *   2. SCHEMA-PER-TENANT: a namespace resolver maps tenant id → schema
 *      name; `SchemaPerTenantResolver` produces qualified table names
 *      (`t_acme.orders`). This layer resolves names only — actual DDL is
 *      out of scope (a stub documents where provisioning hooks attach).
 *
 * The scoped store is deliberately small — it's the pattern code, not an
 * ORM. Rows are plain records with a mandatory `tenant_id`.
 *
 * @module MultiTenancy/Tenancy
 */

import { TenantContext } from './TenantContext';
import { TenantError, TenantErrorCode } from './TenantTypes';

export type Row = Record<string, unknown>;

/** Guard: returns ambient tenant id or throws NO_CONTEXT. */
export function requireTenantId(): string {
  return TenantContext.require().tenantId;
}

/**
 * Cross-tenant access guard — throws when `rowTenantId` doesn't match the
 * ambient tenant. Used at repository boundaries and in service code that
 * handles ids directly (defense in depth below the store scoping).
 */
export function assertSameTenant(rowTenantId: string, what = 'resource'): void {
  const ctx = TenantContext.require();
  if (ctx.tenantId !== rowTenantId) {
    throw new TenantError(
      TenantErrorCode.CROSS_TENANT,
      `tenant '${ctx.tenantId}' attempted to access ${what} owned by '${rowTenantId}'`
    );
  }
}

/**
 * In-memory shared-table store with hard tenant scoping. Every operation
 * reads the ambient TenantContext — there is no unscoped path. `insert`
 * stamps `tenant_id` itself so callers can't spoof it.
 */
export class TenantScopedStore<T extends Row = Row> {
  private readonly _rows = new Map<string, T & { tenant_id: string }>();
  private readonly _idKey: string;
  private _seq = 0;

  constructor(idKey = 'id') {
    this._idKey = idKey;
  }

  /** Insert a row; tenant_id is forced to the ambient tenant. */
  insert(row: T): T & { tenant_id: string } {
    const tenantId = requireTenantId();
    const id = (row[this._idKey] as string | undefined) ?? `r-${++this._seq}`;
    const stored = { ...row, [this._idKey]: id, tenant_id: tenantId };
    this._rows.set(`${tenantId}${id}`, stored);
    return stored;
  }

  /** Fetch by id — scoped to ambient tenant; cross-tenant returns undefined. */
  get(id: string): (T & { tenant_id: string }) | undefined {
    const tenantId = requireTenantId();
    return this._rows.get(`${tenantId}${id}`);
  }

  /** Like `get` but throws CROSS_TENANT when the row exists for another tenant. */
  getOrThrow(id: string): T & { tenant_id: string } {
    const tenantId = requireTenantId();
    const own = this._rows.get(`${tenantId}${id}`);
    if (own) return own;
    // Probe other tenants — presence under any other tenant = cross-tenant.
    for (const [k, row] of this._rows) {
      if (!k.startsWith(`${tenantId}`) && (row[this._idKey] as string) === id) {
        throw new TenantError(TenantErrorCode.CROSS_TENANT, `row '${id}' belongs to another tenant`);
      }
    }
    throw new TenantError(TenantErrorCode.NOT_FOUND, `row '${id}' not found`);
  }

  /** All rows for the ambient tenant matching `predicate`. */
  query(predicate?: (row: T) => boolean): Array<T & { tenant_id: string }> {
    const tenantId = requireTenantId();
    const out: Array<T & { tenant_id: string }> = [];
    for (const [k, row] of this._rows) {
      if (!k.startsWith(`${tenantId}`)) continue;
      if (predicate === undefined || predicate(row)) out.push(row);
    }
    return out;
  }

  /** Update fields of a row — only within ambient tenant. */
  update(id: string, patch: Partial<T>): T & { tenant_id: string } {
    const existing = this.getOrThrow(id);
    const tenantId = requireTenantId();
    const updated = { ...existing, ...patch, [this._idKey]: id, tenant_id: tenantId };
    this._rows.set(`${tenantId}${id}`, updated);
    return updated;
  }

  delete(id: string): boolean {
    const tenantId = requireTenantId();
    return this._rows.delete(`${tenantId}${id}`);
  }

  /** Count of rows for the ambient tenant. */
  count(): number {
    return this.query().length;
  }

  /** Total rows across ALL tenants — admin/maintenance only. */
  unsafeTotalCount(): number {
    return this._rows.size;
  }

  /** Danger: iterate all rows ignoring tenancy — for purge jobs only. */
  *unsafeAllRows(): IterableIterator<T & { tenant_id: string }> {
    yield* this._rows.values();
  }
}

/**
 * Schema-per-tenant name resolution. Produces the schema namespace for a
 * tenant and qualifies table names. Sanitization guarantees a safe
 * identifier: tenant ids are `[a-z0-9-]` already (registry enforces), and
 * `-` maps to `_`.
 */
export class SchemaPerTenantResolver {
  private readonly _prefix: string;

  constructor(schemaPrefix = 'tenant') {
    this._prefix = schemaPrefix;
  }

  schemaFor(tenantId: string): string {
    return `${this._prefix}_${tenantId.replace(/-/g, '_')}`;
  }

  /** Fully-qualified table reference: `tenant_acme.orders`. */
  qualify(tenantId: string, table: string): string {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      throw new TenantError(TenantErrorCode.INVALID_ID, `unsafe table name '${table}'`);
    }
    return `${this.schemaFor(tenantId)}.${table}`;
  }

  /** DDL stub — where provisioning would issue `CREATE SCHEMA`. */
  provisioningStatements(tenantId: string, tables: ReadonlyArray<string>): string[] {
    const schema = this.schemaFor(tenantId);
    return [
      `CREATE SCHEMA IF NOT EXISTS ${schema}`,
      ...tables.map((t) => `-- CREATE TABLE ${this.qualify(tenantId, t)} (...)`),
    ];
  }
}
