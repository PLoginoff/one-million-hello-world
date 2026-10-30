/**
 * ParameterizedSpec — spec templates with late-bound parameters.
 *
 * Some rules can't be fully bound at construction: a report filter
 * built once and instantiated per-request, or a spec deserialized with
 * placeholder params to be filled later. `ParameterizedSpec` captures
 * a template — a `SpecNode` where leaf values may be `{ $param: name }`
 * markers — and `bind()` produces a concrete `Specification` with
 * markers substituted.
 *
 *   const tmpl = new ParameterizedSpec('AdultInRegion', {
 *     kind: 'logic', op: 'and', children: [
 *       { kind: 'leaf', field: 'age', op: SpecOp.Gte, value: { $param: 'minAge' } },
 *       { kind: 'leaf', field: 'region', op: SpecOp.Eq, value: { $param: 'region' } },
 *     ],
 *   });
 *   const spec = tmpl.bind({ minAge: 21, region: 'EU' });
 *
 * Unbound templates evaluate *their own* isSatisfiedBy as false —
 * a placeholder can never prove a rule — while `describe()` renders
 * the parameter name so the hole is visible.
 *
 * @module Specification/Engines
 */

import { evalNode, Specification } from './Specification';
import { leafDescription } from './renderers';
import { specFromNode, SpecRegistry } from './serialization';
import { ISpecification, SpecLeaf, SpecNode } from './types';

const PARAM_TAG = '$param';

type Row = Record<string, unknown>;

function isParamMarker(v: unknown): v is { [PARAM_TAG]: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as Record<string, unknown>)[PARAM_TAG] === 'string'
  );
}

/** Collect every `{ $param: name }` marker value in a tree. */
export function paramNames(node: SpecNode): string[] {
  const names = new Set<string>();
  const visit = (n: SpecNode): void => {
    switch (n.kind) {
      case 'leaf':
        if (isParamMarker(n.value)) names.add(n.value[PARAM_TAG]);
        if (isParamMarker(n.value2)) names.add(n.value2[PARAM_TAG]);
        if (Array.isArray(n.value)) {
          for (const v of n.value) if (isParamMarker(v)) names.add(v[PARAM_TAG]);
        }
        break;
      case 'logic':
        n.children.forEach(visit);
        break;
      case 'not':
        visit(n.child);
        break;
      default:
        break;
    }
  };
  visit(node);
  return [...names];
}

/** Substitute bound values into a tree; throws listing missing params. */
function substitute(node: SpecNode, bindings: Record<string, unknown>): SpecNode {
  const missing: string[] = [];

  const val = (v: unknown): unknown => {
    if (isParamMarker(v)) {
      const name = v[PARAM_TAG];
      if (!(name in bindings)) {
        missing.push(name);
        return v;
      }
      return bindings[name];
    }
    if (Array.isArray(v)) return v.map(val);
    return v;
  };

  const walk = (n: SpecNode): SpecNode => {
    switch (n.kind) {
      case 'leaf':
        return { ...n, value: val(n.value), value2: val(n.value2) };
      case 'logic':
        return { ...n, children: n.children.map(walk) };
      case 'not':
        return { ...n, child: walk(n.child) };
      case 'custom':
        return n;
    }
  };

  const out = walk(node);
  if (missing.length > 0) {
    throw new Error(`unbound parameter(s): ${[...new Set(missing)].join(', ')}`);
  }
  return out;
}

/**
 * A spec template: holds a node tree possibly containing `$param`
 * markers; `bind()` yields a concrete spec via the registry-aware
 * deserializer.
 */
export class ParameterizedSpec<T = Row> {
  readonly name: string;
  private readonly _template: SpecNode;

  constructor(name: string, template: SpecNode) {
    this.name = name;
    this._template = template;
  }

  /** Parameter names still awaiting binding. */
  get unbound(): string[] {
    return paramNames(this._template);
  }

  /** The raw template tree (markers intact). */
  template(): SpecNode {
    return this._template;
  }

  /**
   * Produce a concrete spec. Every declared parameter must be present
   * in `bindings`; extra keys are ignored. A registry may be supplied
   * when the template contains custom nodes.
   */
  bind(bindings: Record<string, unknown>, registry?: SpecRegistry<T>): ISpecification<T> {
    const concrete = substitute(this._template, bindings);
    return specFromNode<T>(concrete, registry);
  }

  /**
   * Partial binding: returns a new template with the given params
   * substituted and the rest still marked — currying for specs.
   */
  bindPartial(bindings: Record<string, unknown>): ParameterizedSpec<T> {
    const sub = (v: unknown): unknown => {
      if (isParamMarker(v) && v[PARAM_TAG] in bindings) return bindings[v[PARAM_TAG]];
      if (Array.isArray(v)) return v.map(sub);
      return v;
    };
    const walk = (n: SpecNode): SpecNode => {
      switch (n.kind) {
        case 'leaf': return { ...n, value: sub(n.value), value2: sub(n.value2) };
        case 'logic': return { ...n, children: n.children.map(walk) };
        case 'not': return { ...n, child: walk(n.child) };
        case 'custom': return n;
      }
    };
    return new ParameterizedSpec<T>(this.name, walk(this._template));
  }

  /** Describe the template — markers render as `<name>`. */
  describe(): string {
    const render = (n: SpecNode): string => {
      switch (n.kind) {
        case 'leaf': {
          const show = (v: unknown): unknown =>
            isParamMarker(v) ? `<${v[PARAM_TAG]}>` : v;
          return leafDescription({ ...n, value: show(n.value), value2: show(n.value2) });
        }
        case 'logic': {
          const j = n.op === 'and' ? ' and ' : ' or ';
          return n.children.map((c) => `(${render(c)})`).join(j);
        }
        case 'not':
          return `not (${render(n.child)})`;
        case 'custom':
          return `custom(${n.spec})`;
      }
    };
    return render(this._template);
  }
}

/**
 * Convenience: build a template from a live spec's node (markers must
 * already be embedded — typically from a deserialized template JSON).
 */
export function parameterizedFromSpec<T>(spec: ISpecification<T>, name?: string): ParameterizedSpec<T> {
  return new ParameterizedSpec<T>(name ?? spec.name, spec.toNode());
}
