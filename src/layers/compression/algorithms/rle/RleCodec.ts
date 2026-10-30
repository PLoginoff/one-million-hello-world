/**
 * RleCodec — byte-oriented run-length encoding with escape sequences.
 *
 * Format (byte-level, no bit packing — RLE payloads are usually already
 * byte-aligned data):
 *
 *   ESCAPE 0 count <bytes> → literal run: `count` raw bytes follow
 *                            (ESCAPE bytes inside the payload are safe
 *                            because the run is length-delimited)
 *   ESCAPE count byte      → run: `byte` repeated `count` times
 *                            (count in [1, 255]; count=0 is the literal-run
 *                            tag, so run tokens always carry count ≥ 1)
 *   anything else          → literal byte
 *
 * Note there is deliberately no `ESCAPE ESCAPE` sequence: an isolated
 * literal ESCAPE byte is always wrapped in a literal-run, keeping the
 * grammar unambiguous even when a run's count is 0xFF.
 *
 * Runs shorter than MIN_RUN (3) are emitted through the literal-run
 * mechanism so that even pathological inputs expand by at most ~0.4%.
 *
 * Stream format:
 *   [magic "RL" : 2][original length : 4][payload]
 *
 * Complexity: O(n) encode, O(n) decode, O(1) auxiliary space.
 */

export const ESCAPE = 0xff;
export const MIN_RUN = 3;
export const MAX_RUN = 255;
export const MAX_LITERAL = 255;

const MAGIC_0 = 0x52; // 'R'
const MAGIC_1 = 0x4c; // 'L'

/** Result of an RLE encode pass. */
export interface RleEncoded {
  readonly data: Uint8Array;
  readonly runCount: number;
  readonly literalBytes: number;
}

export class RleCodec {
  /**
   * Compresses `input`. Worst-case overhead is bounded: a pure-literal
   * payload costs 2 bytes of header + ceil(n/255)·3 bytes of literal-run
   * markers.
   */
  encode(input: Uint8Array): RleEncoded {
    const out: number[] = [MAGIC_0, MAGIC_1];
    out.push(input.length & 0xff);
    out.push((input.length >>> 8) & 0xff);
    out.push((input.length >>> 16) & 0xff);
    out.push((input.length >>> 24) & 0xff);

    let runCount = 0;
    let literalBytes = 0;
    let i = 0;
    let literalStart = 0;
    // Buffered literal-run data awaiting flush (we don't know its length
    // until we hit a real run or the end of input).
    let literalBuffer: number[] = [];

    const flushLiterals = (): void => {
      let p = 0;
      while (p < literalBuffer.length) {
        const chunk = Math.min(literalBuffer.length - p, MAX_LITERAL);
        out.push(ESCAPE, 0, chunk);
        for (let j = 0; j < chunk; j++) {
          out.push(literalBuffer[p + j]);
        }
        p += chunk;
      }
      literalBuffer = [];
    };

    while (i < input.length) {
      // Measure the run length at i.
      const byte = input[i];
      let runLength = 1;
      while (i + runLength < input.length && input[i + runLength] === byte && runLength < MAX_RUN) {
        runLength++;
      }

      if (byte === ESCAPE && runLength >= MIN_RUN) {
        // A genuine run of ESCAPE bytes is cheaper as a run token.
        flushLiterals();
        out.push(ESCAPE, runLength, ESCAPE);
        runCount++;
        i += runLength;
        continue;
      }

      if (runLength >= MIN_RUN) {
        flushLiterals();
        out.push(ESCAPE, runLength, byte);
        runCount++;
        i += runLength;
      } else {
        // Short run — accumulate as literals.
        for (let j = 0; j < runLength; j++) {
          literalBuffer.push(byte);
        }
        literalBytes += runLength;
        i += runLength;
      }
    }
    flushLiterals();
    void literalStart; // retained for clarity of the scan structure

    return { data: new Uint8Array(out), runCount, literalBytes };
  }

  /**
   * Decompresses a stream produced by `encode`.
   */
  decode(stream: Uint8Array): Uint8Array {
    if (stream.length < 6) {
      throw new Error('RLE: stream too short');
    }
    if (stream[0] !== MAGIC_0 || stream[1] !== MAGIC_1) {
      throw new Error('RLE: bad magic');
    }
    const originalLength =
      stream[2] | (stream[3] << 8) | (stream[4] << 16) | (stream[5] << 24);
    const out = new Uint8Array(originalLength);
    let pos = 0;
    let p = 6;

    while (p < stream.length) {
      const b = stream[p];
      if (b !== ESCAPE) {
        if (pos >= originalLength) {
          throw new Error('RLE: output overrun');
        }
        out[pos++] = b;
        p++;
        continue;
      }

      // Escape sequence.
      if (p + 1 >= stream.length) {
        throw new Error('RLE: truncated escape');
      }
      const code = stream[p + 1];
      if (code === 0) {
        // Literal run.
        if (p + 2 >= stream.length) {
          throw new Error('RLE: truncated literal-run header');
        }
        const count = stream[p + 2];
        if (p + 3 + count > stream.length) {
          throw new Error('RLE: truncated literal-run payload');
        }
        if (pos + count > originalLength) {
          throw new Error('RLE: output overrun');
        }
        out.set(stream.subarray(p + 3, p + 3 + count), pos);
        pos += count;
        p += 3 + count;
      } else {
        // Run.
        if (p + 2 >= stream.length) {
          throw new Error('RLE: truncated run');
        }
        const count = code;
        const value = stream[p + 2];
        if (pos + count > originalLength) {
          throw new Error('RLE: output overrun');
        }
        out.fill(value, pos, pos + count);
        pos += count;
        p += 3;
      }
    }

    if (pos !== originalLength) {
      throw new Error(`RLE: decoded ${pos} bytes, expected ${originalLength}`);
    }
    return out;
  }

  encodeString(text: string): RleEncoded {
    return this.encode(new TextEncoder().encode(text));
  }

  decodeToString(stream: Uint8Array): string {
    return new TextDecoder().decode(this.decode(stream));
  }
}
