export { HuffmanCodec } from './HuffmanCodec';
export type { HuffmanEncoded } from './HuffmanCodec';
export {
  buildFrequencyTable,
  buildTree,
  computeCodeLengths,
  generateCanonicalCodes,
  serializeCodeLengths,
  deserializeCodeLengths,
  CanonicalDecoder,
  MinHeap,
  MAX_CODE_LENGTH,
} from './HuffmanTree';
export type { HuffmanNode, CanonicalCode, DecodeEntry } from './HuffmanTree';
