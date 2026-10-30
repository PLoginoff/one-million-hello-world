/**
 * DeltaCodec — delta + varint encoding for integer arrays.
 *
 * Two modes:
 *  - **Sorted mode** (default): deltas are non-negative, encoded as
 *    unsigned varints. Ideal for sorted IDs, timestamps, file offsets.
 *  - **Zigzag mode**: deltas may be negative; each delta is zigzag-mapped
 *    (0→0, -1→1, 1→2, -2→3, …) then unsigned-varint encoded. Use for
 *    arbitrary integer sequences that are locally smooth.
 *
 * The first element is always zigzag-varint encoded in both modes (it may
 * be negative even in sorted arrays).
 *
 * Stream format:
 *   [magic "DL" : 2][element count : 4][flags : 1][varint payload]
 *
 * Varint: 7 payload bits per byte, MSB = continuation (standard LEB128).
 *
 * Complexity: O(n) encode/decode, O(1) auxiliary space; each element costs
 * ~ceil(log128(|delta|)) bytes — small deltas compress extremely well.
 */

const MAGIC_0 = 0x44; // 'D'
const MAGIC_1 = 0x4c; // 'L'

const FLAG_ZIGZAG = 0x01;

/** Result of a delta encode pass. */
export interface DeltaEncoded {
  readonly data: Uint8Array;
  readonly elementCount: number;
  /** Average bytes per element in the payload. */
  readonly bytesPerElement: number;
}

/**
 * Maps a signed integer to an unsigned zigzag value.
 * Uses multiplication tricks to stay safe for |v| up to 2^52.
 */
export function zigzagEncode(v: number): number {
  return v >= 0 ? v * 2 : -v * 2 - 1;
}

/** Inverse of `zigzagEncode`. */
export function zigzagDecode(u: number): number {
  return u % 2 === 0 ? u / 2 : -(u + 1) / 2;
}

/**
 * Appends an unsigned LEB128 varint to `out`.
 *
 * Safe for values up to Number.MAX_SAFE_INTEGER (2^53 - 1); larger values
 * would lose integer precision and are rejected.
 */
export function writeVarint(out: number[], value: number): void {
  if (value < 0 || !Number.isInteger(value) || value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`DeltaCodec: varint value out of range: ${value}`);
  }
  let v = value;
  do {
    let group = v % 128;
    v = Math.floor(v / 128);
    if (v > 0) {
      group += 128;
    }
    out.push(group);
  } while (v > 0);
}

/**
 * Reads an unsigned LEB128 varint from `data` starting at `offset`.
 *
 * @returns [value, bytesRead]
 */
export function readVarint(data: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let p = offset;
  for (;;) {
    if (p >= data.length) {
      throw new Error('DeltaCodec: truncated varint');
    }
    const byte = data[p++];
    result += (byte & 0x7f) * Math.pow(2, shift);
    if ((byte & 0x80) === 0) {
      break;
    }
    shift += 7;
    if (shift > 56) {
      throw new Error('DeltaCodec: varint too long');
    }
  }
  return [result, p - offset];
}

export class DeltaCodec {
  private readonly _zigzagMode: boolean;

  /**
   * @param zigzagMode - false for sorted/non-decreasing arrays (unsigned
   *                     deltas); true for arbitrary sequences.
   */
  constructor(zigzagMode = false) {
    this._zigzagMode = zigzagMode;
  }

  /**
   * Encodes an integer array. In sorted mode the array must be
   * non-decreasing — the codec verifies this and throws otherwise, since
   * silently producing an undecodable stream would be worse.
   *
   * Complexity: O(n) time, O(payload) space.
   */
  encode(input: ReadonlyArray<number>): DeltaEncoded {
    const out: number[] = [MAGIC_0, MAGIC_1];
    const n = input.length;
    out.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
    out.push(this._zigzagMode ? FLAG_ZIGZAG : 0);
    const payloadStart = out.length;

    if (n === 0) {
      return { data: new Uint8Array(out), elementCount: 0, bytesPerElement: 0 };
    }

    let prev = input[0];
    writeVarint(out, zigzagEncode(prev));

    for (let i = 1; i < n; i++) {
      const cur = input[i];
      const delta = cur - prev;
      if (this._zigzagMode) {
        writeVarint(out, zigzagEncode(delta));
      } else {
        if (delta < 0) {
          throw new Error(
            `DeltaCodec: input not sorted at index ${i} ` + `(delta ${delta}); use zigzag mode`
          );
        }
        writeVarint(out, delta);
      }
      prev = cur;
    }

    const data = new Uint8Array(out);
    return {
      data,
      elementCount: n,
      bytesPerElement: (data.length - payloadStart) / n,
    };
  }

  /**
   * Decodes a stream produced by `encode`. The mode is stored in the
   * stream flags, so the decoder instance's mode is irrelevant.
   */
  decode(stream: Uint8Array): number[] {
    if (stream.length < 7) {
      throw new Error('DeltaCodec: stream too short');
    }
    if (stream[0] !== MAGIC_0 || stream[1] !== MAGIC_1) {
      throw new Error('DeltaCodec: bad magic');
    }
    const count = stream[2] | (stream[3] << 8) | (stream[4] << 16) | (stream[5] << 24);
    const zigzag = (stream[6] & FLAG_ZIGZAG) !== 0;

    const out = new Array<number>(count);
    if (count === 0) {
      return out;
    }

    let p = 7;
    const [firstZig, consumed] = readVarint(stream, p);
    p += consumed;
    let prev = zigzagDecode(firstZig);
    out[0] = prev;

    for (let i = 1; i < count; i++) {
      const [raw, len] = readVarint(stream, p);
      p += len;
      const delta = zigzag ? zigzagDecode(raw) : raw;
      prev = prev + delta;
      out[i] = prev;
    }
    return out;
  }

  /**
   * Checks whether `input` is non-decreasing, i.e. suitable for sorted
   * mode. O(n).
   */
  static isSorted(input: ReadonlyArray<number>): boolean {
    for (let i = 1; i < input.length; i++) {
      if (input[i] < input[i - 1]) {
        return false;
      }
    }
    return true;
  }
}
