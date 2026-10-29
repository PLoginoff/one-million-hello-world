/**
 * Disaster Recovery — Corruption Detector
 *
 * Scans data segments (pages/files/objects) for silent corruption by
 * recomputing per-segment checksums against a manifest captured when the data
 * was known-good — the classic "scrub" pass run by ZFS/btrfs and by backup
 * appliances.
 *
 * Design:
 * - A `DataSegment` is (id, bytes). The manifest holds the expected digest
 *   per segment produced with a chosen algorithm.
 * - `scan()` is O(total bytes) and reports the first mismatching byte offset
 *   for each corrupt segment to help localize damage.
 * - Segments missing from the manifest are reported as `unverified` (fail
 *   loud — unknown data can't be trusted), not silently skipped.
 *
 * @module DisasterRecovery/DR
 */

import { CorruptionFinding, DrClock } from './DrTypes';
import { checksum, firstMismatch } from './IntegrityChecksum';

export interface DataSegment {
  readonly segmentId: string;
  readonly bytes: Uint8Array;
}

export interface SegmentManifestEntry {
  readonly segmentId: string;
  readonly checksum: string;
  readonly checksumKind: 'fnv1a' | 'sha256-sim';
  readonly sizeBytes: number;
  readonly capturedAt: number;
  /** Optional pristine copy for byte-level mismatch localization. */
  readonly pristine?: Uint8Array;
}

export interface ScanReport {
  readonly scannedAt: number;
  readonly total: number;
  readonly clean: number;
  readonly corrupt: number;
  readonly unverified: number;
  readonly findings: ReadonlyArray<CorruptionFinding>;
}

export class CorruptionDetector {
  private readonly _clock: DrClock;
  private readonly _manifest = new Map<string, SegmentManifestEntry>();
  private _lastScan?: ScanReport;

  constructor(clock: DrClock = Date.now) {
    this._clock = clock;
  }

  /** Capture expected digests for a set of known-good segments. */
  captureManifest(segments: ReadonlyArray<DataSegment>, kind: 'fnv1a' | 'sha256-sim'): void {
    const now = this._clock();
    for (const s of segments) {
      this._manifest.set(s.segmentId, {
        segmentId: s.segmentId,
        checksum: checksum(kind, s.bytes),
        checksumKind: kind,
        sizeBytes: s.bytes.length,
        capturedAt: now,
        pristine: Uint8Array.from(s.bytes),
      });
    }
  }

  manifestSize(): number {
    return this._manifest.size;
  }

  dropFromManifest(segmentId: string): boolean {
    return this._manifest.delete(segmentId);
  }

  get lastScan(): ScanReport | undefined {
    return this._lastScan;
  }

  /**
   * Scan the given segments against the manifest. A segment absent from the
   * manifest counts as `unverified`; a checksum mismatch counts `corrupt`.
   * Returns the aggregate report and also stores it on `lastScan`.
   */
  scan(segments: ReadonlyArray<DataSegment>): ScanReport {
    const findings: CorruptionFinding[] = [];
    let clean = 0;
    let corrupt = 0;
    let unverified = 0;

    for (const seg of segments) {
      const entry = this._manifest.get(seg.segmentId);
      if (!entry) {
        unverified++;
        findings.push({
          segmentId: seg.segmentId,
          corrupt: false,
          expectedChecksum: '',
          actualChecksum: '',
          scannedAt: this._clock(),
        });
        continue;
      }
      const actual = checksum(entry.checksumKind, seg.bytes);
      const mismatch = actual !== entry.checksum;
      if (mismatch) {
        corrupt++;
        findings.push({
          segmentId: seg.segmentId,
          corrupt: true,
          expectedChecksum: entry.checksum,
          actualChecksum: actual,
          firstMismatchOffset: entry.pristine
            ? (() => {
                const i = firstMismatch(entry.pristine, seg.bytes);
                return i >= 0 ? i : undefined;
              })()
            : undefined,
          scannedAt: this._clock(),
        });
      } else {
        clean++;
      }
    }

    const report: ScanReport = {
      scannedAt: this._clock(),
      total: segments.length,
      clean,
      corrupt,
      unverified,
      findings,
    };
    this._lastScan = report;
    return report;
  }

  /**
   * Targeted single-segment check — cheaper than a full scan for verify-on-read.
   */
  check(segment: DataSegment): CorruptionFinding {
    const entry = this._manifest.get(segment.segmentId);
    if (!entry) {
      return {
        segmentId: segment.segmentId,
        corrupt: false,
        expectedChecksum: '',
        actualChecksum: '',
        scannedAt: this._clock(),
      };
    }
    const actual = checksum(entry.checksumKind, segment.bytes);
    const corrupt = actual !== entry.checksum;
    return {
      segmentId: segment.segmentId,
      corrupt,
      expectedChecksum: entry.checksum,
      actualChecksum: actual,
      firstMismatchOffset:
        corrupt && entry.pristine
          ? (() => {
              const i = firstMismatch(entry.pristine, segment.bytes);
              return i >= 0 ? i : undefined;
            })()
          : undefined,
      scannedAt: this._clock(),
    };
  }
}
