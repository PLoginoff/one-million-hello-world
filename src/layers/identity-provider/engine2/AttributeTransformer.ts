/**
 * AttributeTransformer — inbound/outbound attribute mapping pipeline.
 *
 * IdPs translate between each partner's attribute vocabulary and the
 * canonical local schema. `AttributeReleaseEngine` decides WHICH
 * attributes may be released; this pipeline rewrites their NAMES and
 * VALUES.
 *
 * Each rule is a stage applied in order:
 *
 *   rename:      copy a source attribute to a new name
 *   map:         rewrite values via regex replace (`$1` group refs,
 *                standard JS `String.replace` semantics)
 *   template:    synthesize an attribute from a value template
 *                (`{attr}` placeholders expand from other attributes)
 *   filter:      keep only values matching a regex
 *   constant:    set a fixed value
 *   drop:        remove an attribute
 *
 * Multi-valued attributes are supported throughout — each value is
 * transformed independently; filters drop non-matching values (and the
 * attribute itself when all values are filtered out).
 *
 * Evaluation is ordered and each stage sees the previous stage's
 * output — chains like rename→map→template compose naturally.
 *
 * @module IdentityProvider/Engine2
 */

// ------------------------------------------------------------------ rules

/** Attribute value bag — every attribute is a list of strings. */
export type AttributeBag = Record<string, string[]>;

export type TransformRule =
  | { kind: 'rename'; from: string; to: string; keepSource?: boolean }
  | { kind: 'map'; attribute: string; pattern: string; flags?: string; replace: string }
  | { kind: 'template'; attribute: string; template: string }
  | { kind: 'filter'; attribute: string; pattern: string; flags?: string }
  | { kind: 'constant'; attribute: string; values: string[] }
  | { kind: 'drop'; attribute: string };

/** Per-rule trace entry for diagnostics. */
export interface RuleTrace {
  readonly ruleIndex: number;
  readonly kind: TransformRule['kind'];
  readonly attribute: string;
  /** Values after this stage (undefined = attribute removed/absent). */
  readonly after?: string[];
  readonly changed: boolean;
}

/** Pipeline output: transformed bag + per-rule trace. */
export interface TransformResult {
  readonly attributes: AttributeBag;
  readonly trace: RuleTrace[];
  /** Rules that threw — collected, not fatal. */
  readonly errors: Array<{ ruleIndex: number; error: string }>;
}

// ------------------------------------------------------------------ transformer

export class AttributeTransformer {
  private readonly _rules: TransformRule[];

  constructor(rules: TransformRule[] = []) {
    this._rules = rules;
  }

  get rules(): readonly TransformRule[] {
    return this._rules;
  }

  /**
   * Run the pipeline over `input`. Input is NOT mutated — a fresh bag
   * is built so callers can keep the original around.
   */
  transform(input: AttributeBag, trace = false): TransformResult {
    const bag: AttributeBag = {};
    for (const [k, v] of Object.entries(input)) bag[k] = [...v];

    const traces: RuleTrace[] = [];
    const errors: TransformResult['errors'] = [];

    for (let i = 0; i < this._rules.length; i++) {
      const rule = this._rules[i];
      try {
        const before = this._snapshotFor(rule, bag);
        this._apply(rule, bag);
        const after = this._snapshotFor(rule, bag);
        if (trace) {
          traces.push({
            ruleIndex: i,
            kind: rule.kind,
            attribute: this._attributeOf(rule),
            after,
            changed: JSON.stringify(before) !== JSON.stringify(after),
          });
        }
      } catch (e) {
        errors.push({ ruleIndex: i, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { attributes: bag, trace: traces, errors };
  }

  private _attributeOf(rule: TransformRule): string {
    switch (rule.kind) {
      case 'rename':
        return rule.to;
      case 'map':
      case 'template':
      case 'filter':
      case 'constant':
      case 'drop':
        return rule.attribute;
    }
  }

  private _snapshotFor(rule: TransformRule, bag: AttributeBag): string[] | undefined {
    const attr = this._attributeOf(rule);
    const v = bag[attr];
    return v ? [...v] : undefined;
  }

  private _apply(rule: TransformRule, bag: AttributeBag): void {
    switch (rule.kind) {
      case 'rename': {
        const vals = bag[rule.from];
        if (vals === undefined) return;
        bag[rule.to] = [...(bag[rule.to] ?? []), ...vals];
        if (!rule.keepSource) delete bag[rule.from];
        return;
      }
      case 'map': {
        const re = new RegExp(rule.pattern, rule.flags);
        const vals = bag[rule.attribute];
        if (vals === undefined) return;
        bag[rule.attribute] = vals.map((v) => v.replace(re, rule.replace));
        return;
      }
      case 'template': {
        bag[rule.attribute] = [expandTemplate(rule.template, bag)];
        return;
      }
      case 'filter': {
        const re = new RegExp(rule.pattern, rule.flags);
        const vals = bag[rule.attribute];
        if (vals === undefined) return;
        const kept = vals.filter((v) => re.test(v));
        if (kept.length === 0) {
          delete bag[rule.attribute];
        } else {
          bag[rule.attribute] = kept;
        }
        return;
      }
      case 'constant': {
        bag[rule.attribute] = [...rule.values];
        return;
      }
      case 'drop': {
        delete bag[rule.attribute];
        return;
      }
    }
  }
}

/**
 * Expand `{attr}` placeholders in a template from the bag. Multi-valued
 * attributes join with `, `. Unknown attributes expand to empty string.
 */
export function expandTemplate(template: string, bag: AttributeBag): string {
  return template.replace(/\{([a-zA-Z0-9_.:-]+)\}/g, (_m, name: string) => {
    const vals = bag[name];
    return vals ? vals.join(', ') : '';
  });
}

// ------------------------------------------------------------------ presets

/** Common SAML → OIDC claim mapping (eduPerson-style). */
export const SAML_TO_OIDC_RULES: TransformRule[] = [
  { kind: 'rename', from: 'urn:oid:0.9.2342.19200300.100.1.3', to: 'email', keepSource: false },
  { kind: 'rename', from: 'urn:oid:2.5.4.42', to: 'given_name' },
  { kind: 'rename', from: 'urn:oid:2.5.4.4', to: 'family_name' },
  { kind: 'rename', from: 'urn:oid:1.3.6.1.4.1.5923.1.1.1.6', to: 'edu_person_principal_name' },
  { kind: 'map', attribute: 'edu_person_principal_name', pattern: '^(.+)@(.+)$', replace: '$1' },
];

/** OIDC → flattened profile claims. */
export const OIDC_FLATTEN_RULES: TransformRule[] = [
  { kind: 'template', attribute: 'display_name', template: '{given_name} {family_name}' },
  { kind: 'drop', attribute: 'given_name' },
  { kind: 'drop', attribute: 'family_name' },
];
