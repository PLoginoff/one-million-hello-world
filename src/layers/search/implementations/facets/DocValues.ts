/**
 * DocValues
 *
 * Column-oriented per-document field storage for faceting, sorting, and
 * range filtering — the search-engine equivalent of Lucene DocValues.
 */

export type DocValue = string | number | boolean | readonly string[];

export interface FacetBucket {
  readonly value: string;
  readonly count: number;
}

export type SortDirection = 'asc' | 'desc';
export type SortField =
  | { readonly kind: 'score' }
  | { readonly kind: 'field'; readonly field: string; readonly direction: SortDirection };

export class DocValues {
  /** field -> docId -> value */
  private readonly columns = new Map<string, Map<string, DocValue>>();
  /** numeric fields for range queries/sorting */
  private readonly numericFields = new Set<string>();

  set(docId: string, field: string, value: DocValue): void {
    let col = this.columns.get(field);
    if (col === undefined) {
      col = new Map();
      this.columns.set(field, col);
    }
    col.set(docId, value);
    if (typeof value === 'number') this.numericFields.add(field);
  }

  get(docId: string, field: string): DocValue | undefined {
    return this.columns.get(field)?.get(docId);
  }

  getNumber(docId: string, field: string): number | undefined {
    const v = this.get(docId, field);
    return typeof v === 'number' ? v : undefined;
  }

  remove(docId: string): void {
    for (const col of this.columns.values()) col.delete(docId);
  }

  fields(): string[] {
    return [...this.columns.keys()];
  }

  /**
   * Terms aggregation: count occurrences of each value for `field` over
   * the given candidate doc ids (or all docs).
   */
  termsFacet(
    field: string,
    candidates?: ReadonlySet<string>,
    size = 10
  ): FacetBucket[] {
    const col = this.columns.get(field);
    if (col === undefined) return [];
    const counts = new Map<string, number>();
    for (const [docId, value] of col) {
      if (candidates !== undefined && !candidates.has(docId)) continue;
      const values = Array.isArray(value) ? value : [value];
      for (const v of values) {
        const key = String(v);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const buckets: FacetBucket[] = [...counts.entries()].map(([value, count]) => ({
      value,
      count,
    }));
    buckets.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    return buckets.slice(0, size);
  }

  /** Numeric range filter over candidate doc ids. */
  rangeFilter(
    field: string,
    min?: number,
    max?: number,
    candidates?: ReadonlySet<string>
  ): Set<string> {
    const col = this.columns.get(field);
    const out = new Set<string>();
    if (col === undefined) return out;
    for (const [docId, value] of col) {
      if (candidates !== undefined && !candidates.has(docId)) continue;
      if (typeof value !== 'number') continue;
      if (min !== undefined && value < min) continue;
      if (max !== undefined && value > max) continue;
      out.add(docId);
    }
    return out;
  }

  /** Numeric range facet with fixed buckets. */
  rangeFacet(
    field: string,
    ranges: ReadonlyArray<{ min?: number; max?: number; label?: string }>,
    candidates?: ReadonlySet<string>
  ): FacetBucket[] {
    return ranges.map((r, i) => {
      const ids = this.rangeFilter(field, r.min, r.max, candidates);
      return {
        value: r.label ?? `${r.min ?? '-inf'}..${r.max ?? '+inf'}`,
        count: ids.size || 0,
      };
    });
  }

  /**
   * Sort candidate doc ids by a numeric or string field. Missing values
   * sort last regardless of direction.
   */
  sort(
    candidates: readonly string[],
    field: string,
    direction: SortDirection = 'asc'
  ): string[] {
    const withVal: Array<{ id: string; v: number | string | boolean }> = [];
    const missing: string[] = [];
    for (const id of candidates) {
      const v = this.get(id, field);
      if (v === undefined || typeof v === 'object') {
        missing.push(id);
      } else {
        withVal.push({ id, v });
      }
    }
    const dir = direction === 'asc' ? 1 : -1;
    withVal.sort((a, b) => {
      if (typeof a.v === 'number' && typeof b.v === 'number') {
        return (a.v - b.v) * dir;
      }
      return String(a.v).localeCompare(String(b.v)) * dir;
    });
    return [...withVal.map((x) => x.id), ...missing];
  }

  /** Histogram over a numeric field. */
  histogram(
    field: string,
    interval: number,
    candidates?: ReadonlySet<string>
  ): FacetBucket[] {
    const col = this.columns.get(field);
    if (col === undefined || interval <= 0) return [];
    const buckets = new Map<number, number>();
    for (const [docId, value] of col) {
      if (candidates !== undefined && !candidates.has(docId)) continue;
      if (typeof value !== 'number') continue;
      const bucket = Math.floor(value / interval) * interval;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([start, count]) => ({
        value: `${start}..${start + interval}`,
        count,
      }));
  }
}
