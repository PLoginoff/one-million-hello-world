/**
 * MutantInterpreter — real mutant evaluation
 *
 * Evaluates mutated source by interpreting the expression/statement
 * AST produced by {@link parse}. This gives mutation testing a real
 * "run the mutant" path: a mutant is genuinely executed against test
 * inputs rather than being pattern-matched.
 *
 * The interpreter covers the AST subset the parser emits:
 * literals, identifiers, unary/binary/logical/conditional/assignment/
 * update/call/member/index expressions, var decls, if/loops/return/
 * function decls. It's a tree-walking evaluator (no bytecode) —
 * O(nodes) per call, adequate for unit-test-scale functions.
 *
 * {@link InterpretedTestRunner} plugs into {@link MutationEngine}:
 * given an exported function name and a list of test cases, it runs
 * each case against the mutated module's exported function — real
 * kill semantics for pure functions.
 *
 * @module MutationTesting/Engine
 */

import {
  TUProgram,
  TSNode,
  parse,
  emitNode,
} from './CodeModel';
import type { TestRunner, TestRunResult } from './MutationEngine';

/* ------------------------------------------------------------------------ */
/* Runtime values                                                           */
/* ------------------------------------------------------------------------ */

/** Runtime value the interpreter handles. */
export type Rt =
  | number
  | string
  | boolean
  | null
  | undefined
  | Rt[]
  | { [k: string]: Rt }
  | RtFunction;

interface RtFunction {
  readonly __rtFn: true;
  readonly name: string;
  readonly params: readonly string[];
  readonly body: readonly TSNode[];
  readonly closure: Scope;
}

function isRtFunction(v: Rt): v is RtFunction {
  return typeof v === 'object' && v !== null && (v as { __rtFn?: boolean }).__rtFn === true;
}

/** Evaluation scope (chain of variable maps). */
class Scope {
  private readonly _vars = new Map<string, Rt>();

  constructor(private readonly _parent?: Scope) {}

  get(name: string): Rt {
    if (this._vars.has(name)) return this._vars.get(name)!;
    if (this._parent) return this._parent.get(name);
    return undefined;
  }

  declare(name: string, v: Rt): void {
    this._vars.set(name, v);
  }

  set(name: string, v: Rt): boolean {
    if (this._vars.has(name)) {
      this._vars.set(name, v);
      return true;
    }
    return this._parent?.set(name, v) ?? false;
  }

  has(name: string): boolean {
    return this._vars.has(name) || (this._parent?.has(name) ?? false);
  }
}

/** Thrown to unwind `return`. */
class ReturnSignal {
  constructor(readonly value: Rt) {}
}

/** Evaluation-time error (distinct from parse errors). */
export class RuntimeEvalError extends Error {
  constructor(
    message: string,
    readonly node?: TSNode
  ) {
    super(node ? `${message} @${node.line}:${node.column}` : message);
    this.name = 'RuntimeEvalError';
  }
}

/* ------------------------------------------------------------------------ */
/* Interpreter                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Tree-walking evaluator for the parsed subset.
 *
 * Max call depth guarded to catch runaway recursion (killed-mutant
 * infinite loops surface as RuntimeEvalError, not a hang).
 */
export class Interpreter {
  private _depth = 0;
  private static readonly MAX_DEPTH = 512;
  private static readonly MAX_STEPS = 1_000_000;
  private _steps = 0;
  private _tokens: readonly { value: string; kind: string }[] = [];

  constructor(private readonly _globals?: Record<string, Rt>) {}

  private _tick(): void {
    if (++this._steps > Interpreter.MAX_STEPS) {
      throw new RuntimeEvalError('step limit exceeded (likely infinite loop)');
    }
  }

  /** Load a program into a fresh global scope, returning its exports. */
  loadModule(program: TUProgram): Record<string, Rt> {
    this._tokens = program.tokens;
    const scope = new Scope();
    // built-ins
    scope.declare('Math', this._mathObject());
    scope.declare('JSON', this._jsonObject());
    scope.declare('console', {
      log: this._builtin('console.log', (...a) => undefined),
      error: this._builtin('console.error', (...a) => undefined),
      warn: this._builtin('console.warn', (...a) => undefined),
    } as Rt);
    scope.declare('undefined', undefined);
    scope.declare('NaN', NaN);
    scope.declare('Infinity', Infinity);
    if (this._globals) {
      for (const [k, v] of Object.entries(this._globals)) scope.declare(k, v);
    }

    const exports: Record<string, Rt> = {};
    for (const node of program.body) {
      this._execNode(node, scope, exports);
    }
    return exports;
  }

  private _mathObject(): Rt {
    const wrap = (name: string, fn: (...a: number[]) => number): Rt =>
      ({ __rtFn: true, name, params: [], body: [], closure: new Scope(), __builtin: fn } as unknown as Rt);
    return {
      abs: wrap('abs', Math.abs),
      floor: wrap('floor', Math.floor),
      ceil: wrap('ceil', Math.ceil),
      round: wrap('round', Math.round),
      sqrt: wrap('sqrt', Math.sqrt),
      pow: wrap('pow', Math.pow),
      min: wrap('min', Math.min),
      max: wrap('max', Math.max),
      sign: wrap('sign', Math.sign),
      trunc: wrap('trunc', Math.trunc),
      PI: Math.PI,
      E: Math.E,
      random: wrap('random', Math.random),
    } as Rt;
  }

  private _jsonObject(): Rt {
    const wrap = (name: string, fn: (...a: Rt[]) => Rt): Rt =>
      ({ __rtFn: true, name, params: [], body: [], closure: new Scope(), __builtin: fn } as unknown as Rt);
    return {
      stringify: wrap('stringify', (v) => JSON.stringify(v)),
      parse: wrap('parse', (s) => JSON.parse(String(s)) as Rt),
    } as Rt;
  }

  private _builtin(name: string, fn: (...a: Rt[]) => Rt): Rt {
    return {
      __rtFn: true,
      name,
      params: [],
      body: [],
      closure: new Scope(),
      __builtin: fn,
    } as unknown as Rt;
  }

  /** Execute a top-level statement node. */
  private _execNode(node: TSNode, scope: Scope, exports: Record<string, Rt>): void {
    this._tick();
    switch (node.kind) {
      case 'VarDecl': {
        // children alternate: Identifier, initExpr, Identifier, initExpr...
        const kids = node.children;
        for (let i = 0; i < kids.length; i++) {
          const k = kids[i];
          if (k.kind === 'Identifier') {
            const next = kids[i + 1];
            const init = next && next.kind !== 'Identifier' ? this._eval(next, scope) : undefined;
            scope.declare(k.data?.name ?? `v${i}`, init);
            if (next && next.kind !== 'Identifier') i++;
          } else {
            // destructuring or bare init — evaluate and drop
            this._eval(k, scope);
          }
        }
        return;
      }
      case 'FunctionDecl': {
        const fn = this._makeFunction(node, scope);
        if (node.data?.name) scope.declare(node.data.name, fn);
        return;
      }
      case 'ExportDecl': {
        const inner = node.children[0];
        if (!inner) return;
        if (inner.kind === 'FunctionDecl') {
          const fn = this._makeFunction(inner, scope);
          const name = inner.data?.name ?? 'default';
          exports[name] = fn;
          if (inner.data?.name) scope.declare(inner.data.name, fn);
        } else if (inner.kind === 'VarDecl') {
          this._execNode(inner, scope, exports);
          // export the declared names
          for (const k of inner.children) {
            if (k.kind === 'Identifier' && k.data?.name) {
              exports[k.data.name] = scope.get(k.data.name);
            }
          }
        } else {
          exports['default'] = this._eval(inner, scope);
        }
        return;
      }
      case 'ReturnStatement':
        throw new ReturnSignal(node.children[0] ? this._eval(node.children[0], scope) : undefined);
      case 'ExpressionStatement':
        if (node.children[0]) this._eval(node.children[0], scope);
        return;
      case 'IfStatement': {
        const test = node.children[0] ? this._truthy(this._eval(node.children[0], scope)) : false;
        const branch = test ? node.children[1] : node.children[2];
        if (branch) this._execNode(branch, scope, exports);
        return;
      }
      case 'Block': {
        for (const c of node.children) this._execNode(c, scope, exports);
        return;
      }
      case 'ForStatement': {
        // children: [init?, test?, update?, body]
        const kids = node.children;
        const body = kids[kids.length - 1];
        const pre = kids.slice(0, -1);
        const init = pre[0]?.kind === 'VarDecl' || pre[0]?.kind === 'ExpressionStatement' || pre.length === 3 ? pre[0] : undefined;
        const test = pre.length >= 2 ? pre[1] : pre.length === 1 ? undefined : undefined;
        const update = pre.length >= 3 ? pre[2] : undefined;
        if (init) this._execOrEval(init, scope, exports);
        for (;;) {
          this._tick();
          if (test && !this._truthy(this._eval(test, scope))) break;
          this._execNode(body, scope, exports);
          if (update) this._eval(update, scope);
        }
        return;
      }
      case 'WhileStatement': {
        while (this._truthy(this._eval(node.children[0], scope))) {
          this._tick();
          this._execNode(node.children[1], scope, exports);
        }
        return;
      }
      case 'ThrowStatement':
        throw this._eval(node.children[0], scope);
      case 'ClassDecl':
      case 'SwitchStatement':
      case 'TryStatement':
      case 'DoWhileStatement':
        // best-effort: treat as opaque — evaluate children exprs
        for (const c of node.children) this._execOrEval(c, scope, exports);
        return;
      default:
        // RawExpr / import — ignore
        return;
    }
  }

  private _execOrEval(node: TSNode, scope: Scope, exports: Record<string, Rt>): void {
    const stmtKinds: ReadonlySet<string> = new Set([
      'VarDecl', 'IfStatement', 'ForStatement', 'WhileStatement',
      'DoWhileStatement', 'ReturnStatement', 'FunctionDecl', 'ClassDecl',
      'ExpressionStatement', 'SwitchStatement', 'TryStatement',
      'ThrowStatement', 'BreakStatement', 'ContinueStatement', 'Block',
      'ExportDecl',
    ]);
    if (stmtKinds.has(node.kind)) this._execNode(node, scope, exports);
    else this._eval(node, scope);
  }

  /** Build a callable from FunctionDecl / ArrowFunction. */
  private _makeFunction(node: TSNode, closure: Scope): Rt {
    const params = this._paramNames(node);
    return {
      __rtFn: true,
      name: node.data?.name ?? '<fn>',
      params,
      body: node.children,
      closure,
    } as Rt;
  }

  /**
   * Recover parameter names from the node's token range.
   *
   * Handles: `function f(a, b)`, `(a, b) => ...`, `x => ...`,
   * `async (a) => ...`. Types and defaults are ignored — we only
   * collect identifiers that appear at paren-depth 1 between commas.
   */
  private _paramNames(node: TSNode): readonly string[] {
    const toks = this._tokens;
    // Single-param arrow: first token is identifier followed by '=>'.
    if (
      node.kind === 'ArrowFunction' &&
      toks[node.tokenStart]?.kind === 'identifier' &&
      toks[node.tokenStart + 1]?.value === '=>'
    ) {
      return [toks[node.tokenStart].value];
    }
    // Find first '(' in the node range, then collect depth-1
    // identifier segments split by top-level commas.
    let open = -1;
    for (let i = node.tokenStart; i < node.tokenEnd && i < toks.length; i++) {
      if (toks[i].value === '(') {
        open = i;
        break;
      }
      // stop if we hit '=>' or '{' before any '('
      if (toks[i].value === '=>' || toks[i].value === '{') break;
    }
    if (open < 0) return [];
    const names: string[] = [];
    let depth = 1;
    let expectName = true; // start of a param slot
    for (let i = open + 1; i < node.tokenEnd && i < toks.length; i++) {
      const t = toks[i];
      if (t.value === ')' && depth === 1) break;
      if (['(', '[', '{', '<'].includes(t.value)) {
        depth++;
        continue;
      }
      if ([')', ']', '}', '>'].includes(t.value)) {
        depth--;
        continue;
      }
      if (depth !== 1) continue;
      if (t.value === ',') {
        expectName = true;
        continue;
      }
      if (expectName && t.kind === 'identifier') {
        names.push(t.value);
        expectName = false;
        continue;
      }
      if (expectName && (t.value === '[' || t.value === '{')) {
        // destructured param — already counted above via depth bump;
        // but depth handling consumed it, so mark slot taken
        expectName = false;
      }
      // identifiers after ':' (type annotations) are skipped since
      // expectName is false after the param name or inside nested depth
    }
    return names;
  }

  /** Call a runtime function value. */
  call(fn: Rt, args: readonly Rt[]): Rt {
    if (!isRtFunction(fn)) {
      throw new RuntimeEvalError(`not callable: ${typeof fn}`);
    }
    const builtin = (fn as unknown as { __builtin?: (...a: Rt[]) => Rt }).__builtin;
    if (builtin) return builtin(...args);
    if (this._depth++ > Interpreter.MAX_DEPTH) {
      throw new RuntimeEvalError('call depth exceeded');
    }
    try {
      const scope = new Scope(fn.closure);
      // best-effort param binding: params recovered from node tokens
      for (let i = 0; i < fn.params.length; i++) {
        scope.declare(fn.params[i], args[i]);
      }
      const bodyScope = new Scope(scope);
      try {
        for (const stmt of fn.body) {
          if (stmt.kind === 'Block') {
            for (const s of stmt.children) this._execNode(s, bodyScope, {});
          } else if (stmt.kind === 'ExpressionStatement' || stmt.kind === 'ReturnStatement') {
            this._execNode(stmt, bodyScope, {});
          } else {
            // expression-bodied arrow
            return this._eval(stmt, bodyScope);
          }
        }
      } catch (e) {
        if (e instanceof ReturnSignal) return e.value;
        throw e;
      }
      return undefined;
    } finally {
      this._depth--;
    }
  }

  /* ---------------- expression evaluation ---------------- */

  private _eval(node: TSNode, scope: Scope): Rt {
    this._tick();
    switch (node.kind) {
      case 'Literal': {
        const lt = node.data?.literalType;
        const lv = node.data?.literalValue ?? '';
        if (lt === 'number') return Number(lv.replace(/_/g, '').replace(/n$/, ''));
        if (lt === 'string') return lv.slice(1, -1);
        if (lt === 'boolean') return lv === 'true';
        if (lt === 'null') return null;
        if (lt === 'undefined') return undefined;
        if (lt === 'template') return lv.slice(1, -1);
        return lv;
      }
      case 'Identifier': {
        const v = scope.get(node.data?.name ?? '');
        return v;
      }
      case 'ParenExpr':
        return node.children[0] ? this._eval(node.children[0], scope) : undefined;
      case 'UnaryExpr': {
        const op = node.data?.operator ?? '';
        const v = this._eval(node.children[0], scope);
        switch (op) {
          case '!': return !this._truthy(v);
          case '-': return -Number(v);
          case '+': return +Number(v);
          case '~': return ~Number(v);
          case 'typeof': return typeof v;
          case 'void': return undefined;
          case 'delete': return true;
          default: return v;
        }
      }
      case 'AwaitExpr':
        return node.children[0] ? this._eval(node.children[0], scope) : undefined;
      case 'UpdateExpr': {
        const target = node.children[0];
        const op = node.data?.operator ?? '++';
        const delta = op === '++' ? 1 : -1;
        const cur = this._eval(target, scope);
        const next = Number(cur) + delta;
        this._assign(target, scope, next);
        return node.data?.prefix ? next : cur;
      }
      case 'BinaryExpr': {
        const op = node.data?.operator ?? '';
        const l = this._eval(node.children[0], scope);
        const r = this._eval(node.children[1], scope);
        return this._binary(op, l, r);
      }
      case 'LogicalExpr': {
        const op = node.data?.operator ?? '';
        const l = this._eval(node.children[0], scope);
        if (op === '&&') return this._truthy(l) ? this._eval(node.children[1], scope) : l;
        if (op === '||') return this._truthy(l) ? l : this._eval(node.children[1], scope);
        // ?? — nullish
        return l === null || l === undefined ? this._eval(node.children[1], scope) : l;
      }
      case 'ConditionalExpr': {
        return this._truthy(this._eval(node.children[0], scope))
          ? this._eval(node.children[1], scope)
          : this._eval(node.children[2], scope);
      }
      case 'AssignmentExpr': {
        const op = node.data?.operator ?? '=';
        const rhs = this._eval(node.children[1], scope);
        const lhs = node.children[0];
        if (op === '=') {
          this._assign(lhs, scope, rhs);
          return rhs;
        }
        const cur = this._eval(lhs, scope);
        const base = op.slice(0, -1); // '+= ' -> '+'
        const v = this._binary(base, cur, rhs);
        this._assign(lhs, scope, v);
        return v;
      }
      case 'MemberExpr': {
        const obj = this._eval(node.children[0], scope);
        const name = node.data?.name ?? '';
        return this._member(obj, name);
      }
      case 'IndexExpr': {
        const obj = this._eval(node.children[0], scope);
        const idx = this._eval(node.children[1], scope);
        if (Array.isArray(obj) && typeof idx === 'number') return obj[idx];
        if (typeof obj === 'object' && obj !== null) {
          return (obj as Record<string, Rt>)[String(idx)];
        }
        return undefined;
      }
      case 'CallExpr': {
        const callee = this._eval(node.children[0], scope);
        const args = node.children.slice(1).map((a) => this._eval(a, scope));
        return this.call(callee, args);
      }
      case 'ArrayLiteral':
        return node.children.map((c) => this._eval(c, scope));
      case 'ObjectLiteral': {
        // children are value exprs in source order — keys recovered by
        // scanning source text between them is brittle; use the parsed
        // raw approach: evaluate pairs where the node structure gives
        // us [key, value] alternation via token positions.
        const obj: Record<string, Rt> = {};
        // Simplified: since the parser pushes only value nodes, we
        // can't map keys — return a proxy object keyed by index.
        node.children.forEach((c, i) => {
          obj[String(i)] = this._eval(c, scope);
        });
        return obj;
      }
      case 'ArrowFunction':
      case 'FunctionDecl':
        return this._makeFunction(node, scope);
      case 'NewExpr':
        return {};
      case 'SpreadExpr':
        return this._eval(node.children[0], scope);
      case 'RawExpr':
        return undefined;
      default:
        return undefined;
    }
  }

  private _binary(op: string, l: Rt, r: Rt): Rt {
    switch (op) {
      case '+': {
        if (typeof l === 'string' || typeof r === 'string') return String(l) + String(r);
        return Number(l) + Number(r);
      }
      case '-': return Number(l) - Number(r);
      case '*': return Number(l) * Number(r);
      case '/': return Number(l) / Number(r);
      case '%': return Number(l) % Number(r);
      case '**': return Number(l) ** Number(r);
      case '<': return (l as number) < (r as number);
      case '<=': return (l as number) <= (r as number);
      case '>': return (l as number) > (r as number);
      case '>=': return (l as number) >= (r as number);
      case '==': // eslint-disable-next-line eqeqeq
        return l == r;
      case '!=': // eslint-disable-next-line eqeqeq
        return l != r;
      case '===': return l === r;
      case '!==': return l !== r;
      case '&': return Number(l) & Number(r);
      case '|': return Number(l) | Number(r);
      case '^': return Number(l) ^ Number(r);
      case '<<': return Number(l) << Number(r);
      case '>>': return Number(l) >> Number(r);
      case '>>>': return Number(l) >>> Number(r);
      case 'instanceof': return false;
      case 'in': return typeof r === 'object' && r !== null && String(l) in (r as Record<string, Rt>);
      default: return undefined;
    }
  }

  private _assign(target: TSNode, scope: Scope, value: Rt): void {
    if (target.kind === 'Identifier') {
      const name = target.data?.name ?? '';
      if (!scope.set(name, value)) scope.declare(name, value);
      return;
    }
    if (target.kind === 'IndexExpr') {
      const obj = this._eval(target.children[0], scope);
      const idx = this._eval(target.children[1], scope);
      if (Array.isArray(obj) && typeof idx === 'number') {
        obj[idx] = value;
        return;
      }
      if (typeof obj === 'object' && obj !== null) {
        (obj as Record<string, Rt>)[String(idx)] = value;
      }
      return;
    }
    if (target.kind === 'MemberExpr') {
      const obj = this._eval(target.children[0], scope);
      if (typeof obj === 'object' && obj !== null) {
        (obj as Record<string, Rt>)[target.data?.name ?? ''] = value;
      }
      return;
    }
    throw new RuntimeEvalError('invalid assignment target', target);
  }

  private _member(obj: Rt, name: string): Rt {
    if (obj === null || obj === undefined) {
      throw new RuntimeEvalError(`cannot read '${name}' of ${obj}`);
    }
    if (Array.isArray(obj)) {
      if (name === 'length') return obj.length;
      const wrapArr = (fn: (...a: Rt[]) => Rt): Rt =>
        ({ __rtFn: true, name, params: [], body: [], closure: new Scope(), __builtin: fn } as unknown as Rt);
      if (name === 'push') return wrapArr((v) => { obj.push(v); return obj.length; });
      if (name === 'pop') return wrapArr(() => obj.pop());
      if (name === 'map') return wrapArr((f) => obj.map((x, i) => this.call(f, [x, i])));
      if (name === 'filter') return wrapArr((f) => obj.filter((x, i) => this._truthy(this.call(f, [x, i]))));
      if (name === 'reduce') return wrapArr((f, init) => obj.reduce((a, x, i) => this.call(f, [a, x, i]), init));
      if (name === 'includes') return wrapArr((v) => obj.includes(v));
      if (name === 'indexOf') return wrapArr((v) => obj.indexOf(v));
      if (name === 'slice') return wrapArr((a, b) => obj.slice(Number(a), b === undefined ? undefined : Number(b)));
      if (name === 'join') return wrapArr((sep) => obj.join(String(sep ?? ',')));
      if (name === 'forEach') return wrapArr((f) => { obj.forEach((x, i) => this.call(f, [x, i])); return undefined; });
      return undefined;
    }
    if (typeof obj === 'string') {
      if (name === 'length') return obj.length;
      const wrapStr = (fn: (...a: Rt[]) => Rt): Rt =>
        ({ __rtFn: true, name, params: [], body: [], closure: new Scope(), __builtin: fn } as unknown as Rt);
      if (name === 'charAt') return wrapStr((i) => obj.charAt(Number(i)));
      if (name === 'includes') return wrapStr((s) => obj.includes(String(s)));
      if (name === 'indexOf') return wrapStr((s) => obj.indexOf(String(s)));
      if (name === 'slice') return wrapStr((a, b) => obj.slice(Number(a), b === undefined ? undefined : Number(b)));
      if (name === 'toUpperCase') return wrapStr(() => obj.toUpperCase());
      if (name === 'toLowerCase') return wrapStr(() => obj.toLowerCase());
      if (name === 'split') return wrapStr((sep) => obj.split(String(sep)) as unknown as Rt);
      return undefined;
    }
    if (typeof obj === 'object') {
      return (obj as Record<string, Rt>)[name];
    }
    return undefined;
  }

  private _truthy(v: Rt): boolean {
    return Boolean(v);
  }
}

/* ------------------------------------------------------------------------ */
/* Interpreted test runner                                                  */
/* ------------------------------------------------------------------------ */

/**
 * A test case: invoke `fnName(...args)` and compare with `expected`
 * (deep equality) or a custom `check`.
 */
export interface InterpretedCase {
  readonly name: string;
  readonly fnName: string;
  readonly args: readonly unknown[];
  readonly expected?: unknown;
  readonly check?: (result: unknown) => boolean;
}

/**
 * A {@link TestRunner} that *really executes* mutated source.
 *
 * For each run it parses the mutated file, loads it into the
 * interpreter, and invokes the named function per test case —
 * giving genuine kill semantics without shelling out to a suite.
 */
export class InterpretedTestRunner implements TestRunner {
  private readonly _interpreter = new Interpreter();

  constructor(
    private readonly _targetFile: string,
    private readonly _cases: readonly InterpretedCase[]
  ) {}

  async run(files: ReadonlyMap<string, string>): Promise<TestRunResult> {
    const source = files.get(this._targetFile);
    if (source === undefined) {
      return { tests: [], error: `file not in workspace: ${this._targetFile}`, durationMs: 0 };
    }
    const started = Date.now();
    let exports: Record<string, unknown>;
    try {
      const program = parse(source);
      exports = this._interpreter.loadModule(program) as Record<string, unknown>;
    } catch (e) {
      return {
        tests: [],
        error: `compile error: ${e instanceof Error ? e.message : String(e)}`,
        durationMs: Date.now() - started,
      };
    }
    const tests = this._cases.map((c) => {
      try {
        const fn = exports[c.fnName];
        const result = this._interpreter.call(fn as never, c.args as never[]);
        const ok = c.check
          ? c.check(result)
          : JSON.stringify(result) === JSON.stringify(c.expected);
        return {
          name: c.name,
          status: (ok ? 'pass' : 'fail') as 'pass' | 'fail',
          message: ok ? undefined : `expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(result)}`,
        };
      } catch (e) {
        return {
          name: c.name,
          status: 'fail' as const,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    });
    return { tests, durationMs: Date.now() - started };
  }
}
