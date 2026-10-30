/**
 * HuffmanTree — real Huffman coding tree with canonical code generation.
 *
 * Pipeline:
 *   1. `buildFrequencyTable` — count symbol occurrences.        O(n)
 *   2. `buildTree`           — merge least-frequent nodes via a
 *                              binary min-heap.                  O(k log k)
 *   3. `generateCanonicalCodes` — assign code lengths by depth,
 *                              then renumber canonically so codes
 *                              are determined by (length, symbol)
 *                              order alone.                      O(k log k)
 *
 * Canonical codes let the decoder reconstruct the table from a list of
 * code lengths only — no tree shape needs to be serialized. Symbols with
 * equal code lengths are numbered in increasing symbol order, which is
 * the same convention DEFLATE (RFC 1951) uses.
 *
 * Edge cases handled:
 *  - Empty input       → degenerate tree with a single null root.
 *  - Single symbol     → forced code length of 1 bit (a lone symbol would
 *                        otherwise get a zero-length code, which is
 *                        un-decodable).
 */

/** A node in the Huffman tree. Leaf nodes carry a symbol. */
export interface HuffmanNode {
  /** Total frequency of this subtree. */
  readonly frequency: number;
  /** Symbol for leaf nodes; -1 for internal nodes. */
  readonly symbol: number;
  readonly left: HuffmanNode | null;
  readonly right: HuffmanNode | null;
}

/**
 * A canonical Huffman code: the bit pattern plus its length.
 * `code` stores the pattern right-aligned (LSB = last emitted bit).
 */
export interface CanonicalCode {
  readonly code: number;
  readonly length: number;
}

/** Maximum code length we allow; longer codes are clamped by re-balancing. */
export const MAX_CODE_LENGTH = 32;

/**
 * Binary min-heap of Huffman nodes, ordered by frequency.
 * Ties are broken by insertion order (monotonic stamp) for determinism.
 *
 * Complexity: push/pop O(log n); construction O(n log n) via n pushes.
 */
export class MinHeap {
  private _nodes: HuffmanNode[];
  private _stamps: number[];
  private _nextStamp: number;

  constructor() {
    this._nodes = [];
    this._stamps = [];
    this._nextStamp = 0;
  }

  get size(): number {
    return this._nodes.length;
  }

  push(node: HuffmanNode): void {
    this._nodes.push(node);
    this._stamps.push(this._nextStamp++);
    this._siftUp(this._nodes.length - 1);
  }

  pop(): HuffmanNode | null {
    if (this._nodes.length === 0) {
      return null;
    }
    const top = this._nodes[0];
    const lastNode = this._nodes.pop() as HuffmanNode;
    const lastStamp = this._stamps.pop() as number;
    if (this._nodes.length > 0) {
      this._nodes[0] = lastNode;
      this._stamps[0] = lastStamp;
      this._siftDown(0);
    }
    return top;
  }

  private _less(i: number, j: number): boolean {
    const a = this._nodes[i];
    const b = this._nodes[j];
    if (a.frequency !== b.frequency) {
      return a.frequency < b.frequency;
    }
    return this._stamps[i] < this._stamps[j];
  }

  private _swap(i: number, j: number): void {
    const tn = this._nodes[i];
    this._nodes[i] = this._nodes[j];
    this._nodes[j] = tn;
    const ts = this._stamps[i];
    this._stamps[i] = this._stamps[j];
    this._stamps[j] = ts;
  }

  private _siftUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._less(i, parent)) {
        this._swap(i, parent);
        i = parent;
      } else {
        break;
      }
    }
  }

  private _siftDown(index: number): void {
    let i = index;
    const n = this._nodes.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this._less(left, smallest)) {
        smallest = left;
      }
      if (right < n && this._less(right, smallest)) {
        smallest = right;
      }
      if (smallest === i) {
        break;
      }
      this._swap(i, smallest);
      i = smallest;
    }
  }
}

/**
 * Builds a frequency table over byte values 0..255.
 *
 * Complexity: O(n) where n = input length.
 */
export function buildFrequencyTable(data: Uint8Array): Uint32Array {
  const freq = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) {
    freq[data[i]]++;
  }
  return freq;
}

/**
 * Constructs the Huffman tree from a frequency table.
 *
 * Returns `null` when fewer than two distinct symbols occur — in that case
 * there is nothing to merge and the caller should use a trivial code.
 *
 * Complexity: O(k log k) where k = number of distinct symbols (≤ 256).
 */
export function buildTree(frequencies: Uint32Array): HuffmanNode | null {
  const heap = new MinHeap();
  for (let symbol = 0; symbol < frequencies.length; symbol++) {
    const f = frequencies[symbol];
    if (f > 0) {
      heap.push({ frequency: f, symbol, left: null, right: null });
    }
  }

  if (heap.size === 0) {
    return null;
  }

  // Single-symbol input: attach a synthetic sibling so the real symbol
  // receives a non-empty (1-bit) code rather than the empty string.
  if (heap.size === 1) {
    const only = heap.pop() as HuffmanNode;
    const dummy: HuffmanNode = { frequency: 0, symbol: -1, left: null, right: null };
    return {
      frequency: only.frequency,
      symbol: -1,
      left: only,
      right: dummy,
    };
  }

  while (heap.size > 1) {
    const a = heap.pop() as HuffmanNode;
    const b = heap.pop() as HuffmanNode;
    heap.push({
      frequency: a.frequency + b.frequency,
      symbol: -1,
      left: a,
      right: b,
    });
  }
  return heap.pop();
}

/**
 * Computes code lengths (tree depth) per symbol via iterative DFS.
 *
 * Lengths longer than MAX_CODE_LENGTH are clamped — this produces a
 * technically sub-optimal but still valid prefix code for pathological
 * (Fibonacci-like) frequency distributions.
 *
 * Complexity: O(k) where k = number of tree nodes.
 *
 * @returns `Uint8Array` of length 256; entry i = bit-length of symbol i's
 *          code, or 0 if the symbol never occurred.
 */
export function computeCodeLengths(root: HuffmanNode | null): Uint8Array {
  const lengths = new Uint8Array(256);
  if (root === null) {
    return lengths;
  }

  // Iterative DFS with an explicit stack — recursion depth could reach 256.
  const stack: Array<{ node: HuffmanNode; depth: number }> = [{ node: root, depth: 0 }];
  while (stack.length > 0) {
    const { node, depth } = stack.pop() as { node: HuffmanNode; depth: number };
    if (node.left === null && node.right === null && node.symbol >= 0) {
      lengths[node.symbol] = Math.min(Math.max(depth, 1), MAX_CODE_LENGTH);
    } else {
      if (node.left !== null) {
        stack.push({ node: node.left, depth: depth + 1 });
      }
      if (node.right !== null) {
        stack.push({ node: node.right, depth: depth + 1 });
      }
    }
  }
  return lengths;
}

/**
 * Generates canonical codes from a code-length table.
 *
 * Canonical assignment (RFC 1951 §3.2.2):
 *   - Sort symbols by (codeLength, symbol).
 *   - First code of each length = (prevCode + 1) << (len - prevLen).
 *
 * This guarantees a prefix-free code, and the decoder only needs the
 * length table to reconstruct it.
 *
 * Complexity: O(256 log 256) — dominated by sorting at most 256 entries.
 *
 * @returns Array of `CanonicalCode | null` indexed by symbol.
 */
export function generateCanonicalCodes(lengths: Uint8Array): Array<CanonicalCode | null> {
  const codes: Array<CanonicalCode | null> = new Array(256).fill(null);

  // Count codes of each length.
  const blCount = new Uint32Array(MAX_CODE_LENGTH + 1);
  for (let s = 0; s < 256; s++) {
    if (lengths[s] > 0) {
      blCount[lengths[s]]++;
    }
  }

  // First canonical code value for each length.
  const nextCode = new Uint32Array(MAX_CODE_LENGTH + 1);
  let code = 0;
  for (let len = 1; len <= MAX_CODE_LENGTH; len++) {
    code = (code + blCount[len - 1]) << 1;
    nextCode[len] = code;
  }

  // Assign in increasing symbol order — that's what makes the code canonical.
  for (let s = 0; s < 256; s++) {
    const len = lengths[s];
    if (len > 0) {
      codes[s] = { code: nextCode[len], length: len };
      nextCode[len]++;
    }
  }
  return codes;
}

/**
 * Serializes a code-length table into a compact byte array.
 *
 * Format (per symbol with a non-zero length, in symbol order):
 *   [symbolCount-1 : 1 byte] then for each coded symbol:
 *   [symbol : 1 byte][length : 1 byte]
 *
 * A header byte of 255 means "256 coded symbols".
 *
 * Complexity: O(k) output size where k = number of coded symbols.
 */
export function serializeCodeLengths(lengths: Uint8Array): Uint8Array {
  let count = 0;
  for (let s = 0; s < 256; s++) {
    if (lengths[s] > 0) {
      count++;
    }
  }
  const out = new Uint8Array(1 + count * 2);
  out[0] = count === 256 ? 255 : count;
  let p = 1;
  for (let s = 0; s < 256; s++) {
    if (lengths[s] > 0) {
      out[p++] = s;
      out[p++] = lengths[s];
    }
  }
  return out;
}

/**
 * Deserializes a code-length table produced by `serializeCodeLengths`.
 *
 * @returns Tuple of [lengths, bytesConsumed].
 */
export function deserializeCodeLengths(data: Uint8Array, offset: number): [Uint8Array, number] {
  if (offset >= data.length) {
    throw new Error('Huffman: truncated code-length table');
  }
  const lengths = new Uint8Array(256);
  const countByte = data[offset];
  const count = countByte === 255 ? 256 : countByte;
  let p = offset + 1;
  for (let i = 0; i < count; i++) {
    if (p + 1 >= data.length) {
      throw new Error('Huffman: truncated code-length table');
    }
    const symbol = data[p++];
    const len = data[p++];
    if (len === 0 || len > MAX_CODE_LENGTH) {
      throw new Error(`Huffman: invalid code length ${len} for symbol ${symbol}`);
    }
    lengths[symbol] = len;
  }
  return [lengths, p - offset];
}

/**
 * Decoding table entry: resolves one symbol per bit-walk.
 * Built once per decode pass from canonical codes.
 */
export interface DecodeEntry {
  readonly symbol: number;
  readonly length: number;
}

/**
 * Builds a fast canonical decoder structure: for each code length, the
 * first canonical code value, plus a sorted symbol list per length. The
 * decoder reads one bit at a time, accumulating a code value; when the
 * accumulated value falls inside a length's assigned range the symbol is
 * resolved in O(1) via the per-length symbol list.
 */
export class CanonicalDecoder {
  private readonly _firstCode: Uint32Array;
  private readonly _count: Uint32Array;
  private readonly _symbols: Uint8Array;
  private readonly _offsets: Uint32Array;
  private readonly _maxLength: number;

  constructor(lengths: Uint8Array) {
    this._firstCode = new Uint32Array(MAX_CODE_LENGTH + 1);
    this._count = new Uint32Array(MAX_CODE_LENGTH + 1);
    this._offsets = new Uint32Array(MAX_CODE_LENGTH + 1);

    let maxLen = 0;
    for (let s = 0; s < 256; s++) {
      if (lengths[s] > 0) {
        this._count[lengths[s]]++;
        if (lengths[s] > maxLen) {
          maxLen = lengths[s];
        }
      }
    }
    this._maxLength = maxLen;

    // First canonical code value per length.
    let code = 0;
    for (let len = 1; len <= MAX_CODE_LENGTH; len++) {
      code = (code + this._count[len - 1]) << 1;
      this._firstCode[len] = code;
    }

    // Symbol list sorted by (length, symbol).
    this._symbols = new Uint8Array(256);
    let offset = 0;
    for (let len = 1; len <= MAX_CODE_LENGTH; len++) {
      this._offsets[len] = offset;
      for (let s = 0; s < 256; s++) {
        if (lengths[s] === len) {
          this._symbols[offset++] = s;
        }
      }
    }
  }

  /**
   * Decodes one symbol by consuming bits from `readBit` until a valid code
   * is matched.
   *
   * Complexity: O(L) where L = code length (≤ MAX_CODE_LENGTH).
   *
   * @param readBit - Function returning the next bit (0/1).
   * @returns The decoded symbol (0..255).
   */
  decodeSymbol(readBit: () => number): number {
    let code = 0;
    for (let len = 1; len <= this._maxLength; len++) {
      code = (code << 1) | readBit();
      const index = code - this._firstCode[len];
      if (index >= 0 && index < this._count[len]) {
        return this._symbols[this._offsets[len] + index];
      }
    }
    throw new Error('Huffman: invalid code in stream');
  }

  get maxLength(): number {
    return this._maxLength;
  }
}
