/**
 * Localization — Pseudo-Localization
 *
 * Transforms ASCII source text into an accented, expanded form used to
 * smoke-test UI layouts and find hardcoded strings:
 *
 *   "Account settings" → "[Àççóûñţ šéţţîñĝš ~~]"
 *
 * Two transforms:
 *   1. Accent map: a→à á â ã ä å (rotating per occurrence so repeated
 *      input produces visibly varied output), digits untouched.
 *   2. Expansion: appends `~~`-style padding to simulate the 30-40% longer
 *      strings German/Finnish produce — length issues surface without a
 *      real translation.
 *
 * Placeholders (`{name}`, `{n, plural, ...}`) are NOT transformed — the
 * point is finding *translatable* text that survived. We parse the message
 * and only pseudo-localize the literal text nodes.
 *
 * @module Localization/I18n
 */

import { compileMessage, MessageNode } from './MessageFormat';

const ACCENTS: Record<string, string[]> = {
  a: ['à', 'á', 'â', 'ã', 'ä', 'å'],
  e: ['è', 'é', 'ê', 'ë'],
  i: ['ì', 'í', 'î', 'ï'],
  o: ['ò', 'ó', 'ô', 'õ', 'ö'],
  u: ['ù', 'ú', 'û', 'ü'],
  c: ['ç', 'ć'],
  n: ['ñ', 'ń'],
  s: ['š', 'ś'],
  l: ['ł'],
  y: ['ý', 'ÿ'],
  z: ['ž', 'ź'],
  A: ['À', 'Á', 'Â', 'Ã', 'Ä', 'Å'],
  E: ['È', 'É', 'Ê', 'Ë'],
  I: ['Ì', 'Í', 'Î', 'Ï'],
  O: ['Ò', 'Ó', 'Ô', 'Õ', 'Ö'],
  U: ['Ù', 'Ú', 'Û', 'Ü'],
  C: ['Ç', 'Ć'],
  N: ['Ñ', 'Ń'],
  S: ['Š', 'Ś'],
  Y: ['Ý', 'Ÿ'],
  Z: ['Ž', 'Ź'],
};

export interface PseudoOptions {
  /** Wrap output in brackets — marks translated boundaries. Default true. */
  readonly brackets?: boolean;
  /** Expansion factor on the literal text (default 0.4 = +40%). */
  readonly expand?: number;
  /** Pad character (default ' ~'). */
  readonly padChar?: string;
}

export class PseudoLocalizer {
  private readonly _brackets: boolean;
  private readonly _expand: number;
  private readonly _padChar: string;
  private _counter = 0;

  constructor(options: PseudoOptions = {}) {
    this._brackets = options.brackets ?? true;
    this._expand = options.expand ?? 0.4;
    this._padChar = options.padChar ?? '~';
  }

  /** Pseudo-localize a plain string (no placeholder awareness). */
  transform(text: string): string {
    const accented = this._accent(text);
    const padLen = Math.round(text.length * this._expand);
    const padded = accented + (padLen > 0 ? ' ' + this._padChar.repeat(padLen) : '');
    return this._brackets ? `[${padded}]` : padded;
  }

  /**
   * Pseudo-localize an ICU template — only literal text nodes are
   * transformed; placeholders/select arms keep their structure so the
   * message still formats correctly under the pseudo-locale.
   */
  transformTemplate(template: string): string {
    const { ast } = compileMessage(template);
    return this._renderNodes(ast);
  }

  private _renderNodes(nodes: ReadonlyArray<MessageNode>): string {
    let out = '';
    for (const n of nodes) {
      switch (n.kind) {
        case 'text':
          out += this.transform(n.text);
          break;
        case 'arg':
          out += n.name === '#' ? '#' : `{${n.name}}`;
          break;
        case 'format':
          out += `{${n.name}, ${n.type}${n.style !== undefined ? `, ${n.style}` : ''}}`;
          break;
        case 'plural': {
          const arms = n.arms
            .map((a) => `${a.category === '=' ? `=${a.exact}` : a.category} {${this._renderNodes(a.nodes)}}`)
            .join(' ');
          out += `{${n.name}, plural,${n.offset !== 0 ? ` offset:${n.offset}` : ''} ${arms}}`;
          break;
        }
        case 'select': {
          const arms = n.arms.map((a) => `${a.key} {${this._renderNodes(a.nodes)}}`).join(' ');
          out += `{${n.name}, select, ${arms}}`;
          break;
        }
      }
    }
    return out;
  }

  private _accent(text: string): string {
    let out = '';
    for (const ch of text) {
      const alts = ACCENTS[ch];
      if (alts) {
        out += alts[this._counter++ % alts.length];
      } else {
        out += ch;
      }
    }
    return out;
  }
}
