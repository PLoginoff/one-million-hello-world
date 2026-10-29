/**
 * MetadataStore
 *
 * Registry of entity metadata documents with:
 *  - Publication & refresh with validUntil enforcement
 *  - Entity lookup by entityId
 *  - Expiry sweep
 *  - Metadata-document serialization to a JSON exchange format
 *    (sorted keys, stable layout) so two parties can diff documents
 *    for freshness.
 *
 * @module IdentityProvider/Federation
 */

import { createHash } from 'crypto';
import { canonicalize } from './KeyResolver';
import { EntityMetadata, FederationError, FederationErrorCode } from './types';

export class MetadataStore {
  private readonly _docs: Map<string, EntityMetadata> = new Map();

  /** Publish (or refresh) a metadata document. */
  publish(metadata: EntityMetadata): void {
    this._docs.set(metadata.entityId, { ...metadata, signingKeys: metadata.signingKeys.map((k) => ({ ...k })) });
  }

  /** Fetch metadata; throws UNKNOWN_ENTITY if missing or expired. */
  require(entityId: string, now: number = Date.now()): EntityMetadata {
    const doc = this._docs.get(entityId);
    if (!doc) {
      throw new FederationError(FederationErrorCode.UNKNOWN_ENTITY, `no metadata for ${entityId}`);
    }
    if (doc.validUntil !== undefined && now > doc.validUntil) {
      throw new FederationError(FederationErrorCode.UNKNOWN_ENTITY, `metadata for ${entityId} expired`);
    }
    return doc;
  }

  get(entityId: string, now: number = Date.now()): EntityMetadata | undefined {
    try {
      return this.require(entityId, now);
    } catch {
      return undefined;
    }
  }

  /** Remove expired documents; returns count removed. */
  sweep(now: number = Date.now()): number {
    let removed = 0;
    for (const [id, doc] of this._docs) {
      if (doc.validUntil !== undefined && now > doc.validUntil) {
        this._docs.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Serialize a document for exchange: canonical JSON with a SHA-256
   * fingerprint so peers can cheaply detect changes.
   */
  exportDocument(entityId: string): { body: string; fingerprint: string } {
    const doc = this.require(entityId);
    const body = canonicalize(doc);
    const fingerprint = createHash('sha256').update(body).digest('hex');
    return { body, fingerprint };
  }

  /**
   * Import a canonical document produced by `exportDocument`, verifying
   * the fingerprint. Returns the parsed metadata.
   */
  importDocument(body: string, expectedFingerprint?: string): EntityMetadata {
    const fingerprint = createHash('sha256').update(body).digest('hex');
    if (expectedFingerprint !== undefined && fingerprint !== expectedFingerprint) {
      throw new FederationError(FederationErrorCode.INVALID_SIGNATURE, 'metadata fingerprint mismatch');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new FederationError(FederationErrorCode.BAD_REQUEST, 'malformed metadata document');
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new FederationError(FederationErrorCode.BAD_REQUEST, 'metadata document must be an object');
    }
    const doc = parsed as EntityMetadata;
    if (typeof doc.entityId !== 'string' || doc.entityId.length === 0) {
      throw new FederationError(FederationErrorCode.BAD_REQUEST, 'metadata missing entityId');
    }
    return doc;
  }

  /** All known entityIds (diagnostics). */
  entityIds(): string[] {
    return [...this._docs.keys()];
  }

  size(): number {
    return this._docs.size;
  }
}
