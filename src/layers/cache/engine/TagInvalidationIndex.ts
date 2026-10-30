/**
 * TagInvalidationIndex — bidirectional key ↔ tag index.
 *
 * Cache entries are routinely tagged with semantic labels
 * (`user:42`, `product:*`-style namespaces, `expensive-query`) so a
 * business event can invalidate a whole family of keys at once:
 *
 *   "user 42 updated profile" → invalidateTag('user:42')
 *
 * Structures:
 *   `_tagToKeys : Map<tag, Set<key>>`   — tag → its keys
 *   `_keyToTags : Map<key, Set<tag>>`   — key → its tags (for cleanup)
 *
 * The reverse index is what makes `removeKey` O(#tags-of-key) instead of
 * a full scan of every tag's key set — without it, deleting one cache
 * entry would be O(all tagged keys).
 *
 * Lifecycle contract:
 *   - `add(key, tags)`        — idempotent; re-adding merges tags.
 *   - `removeKey(key)`        — removes the key from every tag set; must
 *                             be called by the cache on eviction/expiry
 *                             or tags would accumulate dead keys.
 *   - `keysForTag(tag)`       — snapshot of live keys; callers delete them.
 *   - `removeTag(tag)`        — drop the tag entirely and unlink its keys.
 *
 * Orphan hygiene: a tag whose key set empties is dropped automatically
 * to keep `tags()` honest.
 *
 * Complexity: add O(#tags), removeKey O(#tags-of-key), keysForTag
 * O(#keys-of-tag). Memory O(total key-tag pairs).
 *
 * @module CacheLayer/Engine
 */

export class TagInvalidationIndex {
  private readonly _tagToKeys = new Map<string, Set<string>>();
  private readonly _keyToTags = new Map<string, Set<string>>();
  private _associations = 0;

  /** Associate `key` with each of `tags`. Idempotent per (key, tag). */
  add(key: string, tags: readonly string[]): void {
    let keyTags = this._keyToTags.get(key);
    if (!keyTags) {
      keyTags = new Set();
      this._keyToTags.set(key, keyTags);
    }
    for (const tag of tags) {
      if (keyTags.has(tag)) continue;
      keyTags.add(tag);
      let tagKeys = this._tagToKeys.get(tag);
      if (!tagKeys) {
        tagKeys = new Set();
        this._tagToKeys.set(tag, tagKeys);
      }
      tagKeys.add(key);
      this._associations++;
    }
  }

  /** Replace all of `key`'s tags (removes associations not in `tags`). */
  replace(key: string, tags: readonly string[]): void {
    this.removeKey(key);
    this.add(key, tags);
  }

  /**
   * Snapshot of keys currently tagged `tag`, in insertion order.
   * The returned array is a copy — mutating it is safe.
   */
  keysForTag(tag: string): string[] {
    const set = this._tagToKeys.get(tag);
    return set ? Array.from(set) : [];
  }

  /** All tags currently attached to `key`. */
  tagsForKey(key: string): string[] {
    const set = this._keyToTags.get(key);
    return set ? Array.from(set) : [];
  }

  /** Does `tag` have at least one live key? */
  hasTag(tag: string): boolean {
    const set = this._tagToKeys.get(tag);
    return set !== undefined && set.size > 0;
  }

  /** All live tags. */
  tags(): string[] {
    return Array.from(this._tagToKeys.keys());
  }

  /** All keys carrying at least one tag. */
  keys(): string[] {
    return Array.from(this._keyToTags.keys());
  }

  /**
   * Remove `key` from every tag it belongs to; drops emptied tags.
   * Returns the tags the key had (useful for logging/auditing).
   */
  removeKey(key: string): string[] {
    const keyTags = this._keyToTags.get(key);
    if (!keyTags) return [];
    const removed: string[] = [];
    for (const tag of keyTags) {
      const tagKeys = this._tagToKeys.get(tag);
      if (tagKeys) {
        if (tagKeys.delete(key)) this._associations--;
        if (tagKeys.size === 0) this._tagToKeys.delete(tag);
      }
      removed.push(tag);
    }
    this._keyToTags.delete(key);
    return removed;
  }

  /**
   * Drop `tag` and unlink it from all its keys (the keys themselves are
   * NOT removed — they're just no longer reachable via this tag).
   * Returns the keys that were carrying the tag.
   */
  removeTag(tag: string): string[] {
    const tagKeys = this._tagToKeys.get(tag);
    if (!tagKeys) return [];
    const keys = Array.from(tagKeys);
    for (const key of keys) {
      const keyTags = this._keyToTags.get(key);
      if (keyTags) {
        if (keyTags.delete(tag)) this._associations--;
        if (keyTags.size === 0) this._keyToTags.delete(key);
      }
    }
    this._tagToKeys.delete(tag);
    return keys;
  }

  /**
   * Tags matching `prefix` (e.g. `'user:'` matches `'user:42'`).
   * O(#tags) — call for admin tooling, not in the hot path.
   */
  tagsWithPrefix(prefix: string): string[] {
    const out: string[] = [];
    for (const t of this._tagToKeys.keys()) {
      if (t.startsWith(prefix)) out.push(t);
    }
    return out;
  }

  /** Total live key-tag associations (== sum of all tag set sizes). */
  get size(): number {
    return this._associations;
  }

  clear(): void {
    this._tagToKeys.clear();
    this._keyToTags.clear();
    this._associations = 0;
  }
}
