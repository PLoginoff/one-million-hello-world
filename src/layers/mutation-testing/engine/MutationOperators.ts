/**
 * MutationOperators
 *
 * The classic operator set, each implemented as a pure AST visitor that
 * produces {@link MutantSpec}s — descriptions of source-level edits.
 *
 * Operators (name → transformation):
 *
 *  - ArithmeticOperatorReplacement  a + b → a - b, a * b → a + b, …
 *  - RelationalOperatorReplacement  a < b → a <= b, a === b → a !== b, …
 *  - ConditionalBoundaryMutation    a < b → a <= b, a <= b → a < b
 *  - LogicalOperatorReplacement     && ↔ ||, ?? → ||
 *  - NegationInsertion              cond → !cond on if/while/for/ternary
 *  - BooleanLiteralFlip             true ↔ false
 *  - NullLiteralMutation            null → undefined, {} → undefined
 *  - NumericLiteralMutation         n → n+1, 0 → 1, 1 → 0
 *  - StringLiteralMutation          'abc' → '', non-empty → 'MUTANT'
 *  - IncrementDecrementMutation     ++ ↔ --, += ↔ -=
 *  - LoopBoundMutation              i < n → i <= n and i = 0 → i = 1
 *  - ReturnValueMutation            return x → return undefined / null
 *  - ArrayIndexMutation             a[i] → a[i-1] / a[i+1]
 *  - AssignmentOperatorMutation     += → -=, *= → /=, …
 *  - EqualityToAssignmentMutation   a === b in condition → (a = b) [kill rate probe]
 *  - StatementRemoval               x; → (removed) — conservative, expr stmt only
 *
 * Each spec carries the replacement text plus enough provenance for the
 * runner to apply the edit (char offsets) and for reports (line, col,
 * original vs mutated snippet).
 *
 * @module MutationTesting/Engine
 */

import {
  TSNode,
  TUProgram,
  NodeKind,
  findNodes,
  emitNode,
} from './CodeModel';

/* ------------------------------------------------------------------------ */
/* Types                                                                    */
/* ------------------------------------------------------------------------ */

/** A single source-level edit produced by an operator. */
export interface MutantSpec {
  /** Operator that produced this mutant. */
  readonly operator: string;
  /** Unique id: `<operator>@<charOffset>:<seq>`. */
  readonly id: string;
  /** Character range in the original source to replace. */
  readonly start: number;
  readonly end: number;
  /** Original source slice being replaced. */
  readonly originalText: string;
  /** Replacement text. */
  readonly mutatedText: string;
  /** 1-based line of the mutation site. */
  readonly line: number;
  readonly column: number;
  /** Optional semantic hint for reporting. */
  readonly description: string;
}

/** Operator interface: produce zero+ mutant specs for a program. */
export interface MutationOperator {
  readonly name: string;
  readonly description: string;
  /** True when the operator mutates `node`. */
  appliesTo(node: TSNode): boolean;
  /** Emit mutants for a node. May emit several per node. */
  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[];
}

/** Base helper to build specs. */
export function makeSpec(
  operator: string,
  node: TSNode,
  program: TUProgram,
  mutatedText: string,
  description: string,
  seq: () => number
): MutantSpec {
  const n = seq();
  return {
    operator,
    id: `${operator}@${node.start}:${n}`,
    start: node.start,
    end: node.end,
    originalText: emitNode(program, node),
    mutatedText,
    line: node.line,
    column: node.column,
    description,
  };
}

/* ------------------------------------------------------------------------ */
/* Binary/relational operator table                                         */
/* ------------------------------------------------------------------------ */

/**
 * Replacement tables follow the Stryker/PIT convention: swap each
 * operator for a "nearby" one that likely changes semantics while
 * remaining syntactically valid.
 */
const ARITHMETIC_REPLACEMENTS: Readonly<Record<string, readonly string[]>> = {
  '+': ['-', '*'],
  '-': ['+', '/'],
  '*': ['/', '+'],
  '/': ['*', '-'],
  '%': ['/', '*'],
  '**': ['*'],
};

const RELATIONAL_REPLACEMENTS: Readonly<Record<string, readonly string[]>> = {
  '<': ['<=', '>=', '>'],
  '<=': ['<', '>', '>='],
  '>': ['>=', '<=', '<'],
  '>=': ['>', '<', '<='],
  '==': ['!=', '==='],
  '!=': ['==', '!=='],
  '===': ['!==', '=='],
  '!==': ['===', '!='],
};

const BOUNDARY_REPLACEMENTS: Readonly<Record<string, string>> = {
  '<': '<=',
  '<=': '<',
  '>': '>=',
  '>=': '>',
};

const LOGICAL_REPLACEMENTS: Readonly<Record<string, string>> = {
  '&&': '||',
  '||': '&&',
  '??': '||',
};

const ASSIGNMENT_REPLACEMENTS: Readonly<Record<string, string>> = {
  '+=': '-=',
  '-=': '+=',
  '*=': '/=',
  '/=': '*=',
  '%=': '*=',
};

/* ------------------------------------------------------------------------ */
/* Node access helpers                                                      */
/* ------------------------------------------------------------------------ */

function child(node: TSNode, i: number): TSNode | undefined {
  return node.children[i];
}

function operatorOf(node: TSNode): string | undefined {
  return node.data?.operator;
}

/**
 * Find the token index of the node's binary operator — the first token
 * strictly between the left and right operand ranges.
 */
function findOperatorToken(node: TSNode, program: TUProgram): number | undefined {
  const left = child(node, 0);
  const right = child(node, 1);
  if (!left || !right) return undefined;
  for (let i = left.tokenEnd; i < right.tokenStart; i++) {
    const t = program.tokens[i];
    if (t.value === node.data?.operator) return i;
  }
  return undefined;
}

function specForToken(
  operator: string,
  node: TSNode,
  program: TUProgram,
  replacement: string,
  description: string,
  seq: () => number
): MutantSpec {
  const tokIdx = findOperatorToken(node, program);
  const tok = tokIdx !== undefined ? program.tokens[tokIdx] : undefined;
  const n = seq();
  const start = tok?.start ?? node.start;
  const end = tok?.end ?? node.end;
  return {
    operator,
    id: `${operator}@${start}:${n}`,
    start,
    end,
    originalText: program.source.slice(start, end),
    mutatedText: replacement,
    line: tok?.line ?? node.line,
    column: tok?.column ?? node.column,
    description,
  };
}

/* ------------------------------------------------------------------------ */
/* Operators                                                                */
/* ------------------------------------------------------------------------ */

/** `a + b` → `a - b`, `a * b` → `a / b`, … */
export class ArithmeticOperatorMutation implements MutationOperator {
  readonly name = 'ArithmeticOperator';
  readonly description = 'Replaces arithmetic operators (+ - * / % **) with alternatives.';

  appliesTo(node: TSNode): boolean {
    return (
      node.kind === 'BinaryExpr' &&
      operatorOf(node) !== undefined &&
      operatorOf(node)! in ARITHMETIC_REPLACEMENTS
    );
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    const op = operatorOf(node)!;
    const replacements = ARITHMETIC_REPLACEMENTS[op] ?? [];
    return replacements.map((r) =>
      specForToken(this.name, node, program, r, `${op} -> ${r}`, seq)
    );
  }
}

/** `a < b` → `a <= b`, `a === b` → `a !== b`, … */
export class RelationalOperatorMutation implements MutationOperator {
  readonly name = 'RelationalOperator';
  readonly description = 'Replaces relational/equality operators with alternatives.';

  appliesTo(node: TSNode): boolean {
    return (
      node.kind === 'BinaryExpr' &&
      operatorOf(node) !== undefined &&
      operatorOf(node)! in RELATIONAL_REPLACEMENTS
    );
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    const op = operatorOf(node)!;
    const replacements = RELATIONAL_REPLACEMENTS[op] ?? [];
    return replacements.map((r) =>
      specForToken(this.name, node, program, r, `${op} -> ${r}`, seq)
    );
  }
}

/** `<` → `<=`, `<=` → `<`, `>` → `>=`, `>=` → `>` — off-by-one at boundaries. */
export class ConditionalBoundaryMutation implements MutationOperator {
  readonly name = 'ConditionalBoundary';
  readonly description = 'Toggles boundary inclusivity on relational operators.';

  appliesTo(node: TSNode): boolean {
    return (
      node.kind === 'BinaryExpr' &&
      operatorOf(node) !== undefined &&
      operatorOf(node)! in BOUNDARY_REPLACEMENTS
    );
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    const op = operatorOf(node)!;
    const r = BOUNDARY_REPLACEMENTS[op];
    return [specForToken(this.name, node, program, r, `boundary ${op} -> ${r}`, seq)];
  }
}

/** `&&` ↔ `||`, `??` → `||`. */
export class LogicalOperatorMutation implements MutationOperator {
  readonly name = 'LogicalOperator';
  readonly description = 'Swaps logical operators (&&, ||, ??).';

  appliesTo(node: TSNode): boolean {
    return (
      node.kind === 'LogicalExpr' &&
      operatorOf(node) !== undefined &&
      operatorOf(node)! in LOGICAL_REPLACEMENTS
    );
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    const op = operatorOf(node)!;
    const r = LOGICAL_REPLACEMENTS[op];
    return [specForToken(this.name, node, program, r, `${op} -> ${r}`, seq)];
  }
}

/** `cond` → `!cond` on if/while/for-test/ternary conditions. */
export class NegationMutation implements MutationOperator {
  readonly name = 'NegationInsertion';
  readonly description = 'Negates conditional expressions in control-flow tests.';

  private static readonly TEST_NODES: ReadonlySet<NodeKind> = new Set([
    'IfStatement',
    'WhileStatement',
    'DoWhileStatement',
    'ForStatement',
    'ConditionalExpr',
  ]);

  appliesTo(node: TSNode): boolean {
    return NegationMutation.TEST_NODES.has(node.kind);
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    // The test expression is always the first child for these nodes
    // (ForStatement: init, test, update, body — so index differs).
    let test: TSNode | undefined;
    if (node.kind === 'ForStatement') {
      // children: [init?, test?, update?, body] — find the expression
      // between the two ';'. Heuristic: first non-VarDecl, non-body
      // child that is an expression.
      const c = node.children;
      // classic for: [init(VarDecl|expr), test, update, body]
      // for-of has operator 'for-of' — skip (no boolean test)
      if (node.data?.operator === 'for-of') return [];
      // test is children[1] when init present, children[0] when absent
      test = c.length >= 4 ? c[1] : c.length === 3 ? c[1] : undefined;
    } else {
      test = child(node, 0);
    }
    if (!test || test.kind === 'Block') return [];
    const negated =
      test.kind === 'ParenExpr' ? `!${emitNode(program, test)}` : `!(${emitNode(program, test)})`;
    return [
      makeSpec(this.name, test, program, negated, `negate condition`, seq),
    ];
  }
}

/** `true` ↔ `false`. */
export class BooleanLiteralMutation implements MutationOperator {
  readonly name = 'BooleanLiteral';
  readonly description = 'Flips boolean literals.';

  appliesTo(node: TSNode): boolean {
    return node.kind === 'Literal' && node.data?.literalType === 'boolean';
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    const flipped = node.data?.literalValue === 'true' ? 'false' : 'true';
    return [
      makeSpec(this.name, node, program, flipped, `${node.data?.literalValue} -> ${flipped}`, seq),
    ];
  }
}

/** `null` → `undefined`, `undefined` → `null`. */
export class NullLiteralMutation implements MutationOperator {
  readonly name = 'NullLiteral';
  readonly description = 'Swaps null and undefined literals.';

  appliesTo(node: TSNode): boolean {
    return (
      node.kind === 'Literal' &&
      (node.data?.literalType === 'null' || node.data?.literalType === 'undefined')
    );
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    const flipped = node.data?.literalType === 'null' ? 'undefined' : 'null';
    return [
      makeSpec(this.name, node, program, flipped, `null-ish swap -> ${flipped}`, seq),
    ];
  }
}

/** `0` → `1`, `1` → `0`, other `n` → `n+1`. */
export class NumericLiteralMutation implements MutationOperator {
  readonly name = 'NumericLiteral';
  readonly description = 'Mutates numeric literals (0→1, 1→0, n→n+1).';

  appliesTo(node: TSNode): boolean {
    return node.kind === 'Literal' && node.data?.literalType === 'number';
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    const raw = node.data?.literalValue ?? '0';
    // only plain decimal ints/floats; skip hex/bigint/exponent
    if (!/^-?\d+(\.\d+)?$/.test(raw)) return [];
    const n = Number(raw);
    const mutated = raw === '0' ? '1' : raw === '1' ? '0' : String(n + 1);
    return [
      makeSpec(this.name, node, program, mutated, `${raw} -> ${mutated}`, seq),
    ];
  }
}

/** `'abc'` → `''`, `''` → `'MUTANT'`. */
export class StringLiteralMutation implements MutationOperator {
  readonly name = 'StringLiteral';
  readonly description = 'Mutates string literals (empty <-> sentinel).';

  appliesTo(node: TSNode): boolean {
    return node.kind === 'Literal' && node.data?.literalType === 'string';
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    const raw = node.data?.literalValue ?? "''";
    const inner = raw.slice(1, -1);
    const mutated = inner.length === 0 ? `'MUTANT'` : `''`;
    return [
      makeSpec(this.name, node, program, mutated, `string -> ${mutated}`, seq),
    ];
  }
}

/** `i++` → `i--`, `--x` → `++x`. */
export class IncrementDecrementMutation implements MutationOperator {
  readonly name = 'IncrementDecrement';
  readonly description = 'Swaps ++ and -- update operators.';

  appliesTo(node: TSNode): boolean {
    return node.kind === 'UpdateExpr' && operatorOf(node) !== undefined;
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    const op = operatorOf(node)!;
    const flipped = op === '++' ? '--' : '++';
    const operand = child(node, 0);
    if (!operand) return [];
    const operandText = emitNode(program, operand);
    const prefix = node.data?.prefix !== false;
    const mutated = prefix ? `${flipped}${operandText}` : `${operandText}${flipped}`;
    return [
      makeSpec(this.name, node, program, mutated, `${op} -> ${flipped}`, seq),
    ];
  }
}

/** `i < n` → `i <= n` and `i = 0` → `i = 1` inside classic `for` headers. */
export class LoopBoundMutation implements MutationOperator {
  readonly name = 'LoopBound';
  readonly description = 'Off-by-one mutations on classic for-loop bounds.';

  appliesTo(node: TSNode): boolean {
    return node.kind === 'ForStatement' && node.data?.operator === 'classic';
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    const specs: MutantSpec[] = [];
    // children: [init?, test?, update?, body]
    const c = node.children;
    // test: the expression right before update/body — index 1 when init
    // exists, else index 0.
    const body = c[c.length - 1];
    const nonBody = c.slice(0, -1);
    const test = nonBody.length >= 2 ? nonBody[nonBody.length - 2] : nonBody[0];
    const update = nonBody.length >= 2 ? nonBody[nonBody.length - 1] : undefined;
    void body;
    void update;

    // boundary flip on the test comparison
    if (test && test.kind === 'BinaryExpr') {
      const op = operatorOf(test);
      if (op && op in BOUNDARY_REPLACEMENTS) {
        specs.push(
          specForToken(this.name, test, program, BOUNDARY_REPLACEMENTS[op], `loop bound ${op}`, seq)
        );
      }
      // i < n  →  i < n - 1
      const right = child(test, 1);
      if (right) {
        specs.push(
          makeSpec(
            this.name,
            right,
            program,
            `(${emitNode(program, right)} - 1)`,
            'loop upper bound -1',
            seq
          )
        );
      }
    }
    // init: i = 0 → i = 1
    const init = nonBody[0];
    if (init && init.kind === 'VarDecl') {
      const initExpr = init.children.find((ch) => ch.kind === 'Literal');
      if (initExpr && initExpr.data?.literalValue === '0') {
        specs.push(
          makeSpec(this.name, initExpr, program, '1', 'loop start 0 -> 1', seq)
        );
      }
    }
    return specs;
  }
}

/** `return expr` → `return undefined`. */
export class ReturnValueMutation implements MutationOperator {
  readonly name = 'ReturnValue';
  readonly description = 'Replaces returned values with undefined.';

  appliesTo(node: TSNode): boolean {
    return node.kind === 'ReturnStatement' && node.children.length > 0;
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    const arg = child(node, 0);
    if (!arg) return [];
    return [
      makeSpec(this.name, arg, program, 'undefined', 'return undefined', seq),
    ];
  }
}

/** `a[i]` → `a[i+1]` and `a[i-1]`. */
export class ArrayIndexMutation implements MutationOperator {
  readonly name = 'ArrayIndex';
  readonly description = 'Off-by-one on index expressions.';

  appliesTo(node: TSNode): boolean {
    return node.kind === 'IndexExpr' && node.children.length === 2;
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    const idx = child(node, 1)!;
    const idxText = emitNode(program, idx);
    return [
      makeSpec(this.name, idx, program, `(${idxText} + 1)`, 'index +1', seq),
      makeSpec(this.name, idx, program, `(${idxText} - 1)`, 'index -1', seq),
    ];
  }
}

/** `x += y` → `x -= y` etc. */
export class AssignmentOperatorMutation implements MutationOperator {
  readonly name = 'AssignmentOperator';
  readonly description = 'Swaps compound assignment operators.';

  appliesTo(node: TSNode): boolean {
    return (
      node.kind === 'AssignmentExpr' &&
      operatorOf(node) !== undefined &&
      operatorOf(node)! in ASSIGNMENT_REPLACEMENTS
    );
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    const op = operatorOf(node)!;
    const r = ASSIGNMENT_REPLACEMENTS[op];
    return [specForToken(this.name, node, program, r, `${op} -> ${r}`, seq)];
  }
}

/** `expr;` → `;` (statement removal — expression statements only). */
export class StatementRemovalMutation implements MutationOperator {
  readonly name = 'StatementRemoval';
  readonly description = 'Removes expression statements.';

  appliesTo(node: TSNode): boolean {
    return node.kind === 'ExpressionStatement' && node.children.length > 0;
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    return [
      makeSpec(this.name, node, program, ';', 'statement removed', seq),
    ];
  }
}

/** `a === b` (in a test position) → `(a = b)`. */
export class EqualityToAssignmentMutation implements MutationOperator {
  readonly name = 'EqualityToAssignment';
  readonly description = 'Turns strict equality checks into assignments.';

  appliesTo(node: TSNode): boolean {
    return (
      node.kind === 'BinaryExpr' &&
      (operatorOf(node) === '===' || operatorOf(node) === '==')
    );
  }

  mutate(node: TSNode, program: TUProgram, seq: () => number): readonly MutantSpec[] {
    const left = child(node, 0);
    const right = child(node, 1);
    if (!left || !right) return [];
    // only sensible when the left side could be an l-value
    if (left.kind !== 'Identifier' && left.kind !== 'MemberExpr' && left.kind !== 'IndexExpr') {
      return [];
    }
    const mutated = `(${emitNode(program, left)} = ${emitNode(program, right)})`;
    return [
      makeSpec(this.name, node, program, mutated, '=== -> =', seq),
    ];
  }
}

/* ------------------------------------------------------------------------ */
/* Registry                                                                 */
/* ------------------------------------------------------------------------ */

/** The standard operator set, roughly ordered by specificity. */
export function defaultOperators(): readonly MutationOperator[] {
  return [
    new LoopBoundMutation(),
    new ConditionalBoundaryMutation(),
    new NegationMutation(),
    new IncrementDecrementMutation(),
    new AssignmentOperatorMutation(),
    new EqualityToAssignmentMutation(),
    new ArithmeticOperatorMutation(),
    new RelationalOperatorMutation(),
    new LogicalOperatorMutation(),
    new BooleanLiteralMutation(),
    new NullLiteralMutation(),
    new NumericLiteralMutation(),
    new StringLiteralMutation(),
    new ArrayIndexMutation(),
    new ReturnValueMutation(),
    new StatementRemovalMutation(),
  ];
}

/**
 * Generate every mutant spec for a program.
 *
 * Walks the AST once; each node may produce several mutants across
 * operators — equivalent mutants (identical spans+text) are deduplicated.
 * Complexity: O(nodes × operators).
 */
export function generateMutants(
  program: TUProgram,
  operators: readonly MutationOperator[] = defaultOperators()
): readonly MutantSpec[] {
  const all: MutantSpec[] = [];
  const seen = new Set<string>();
  let counter = 0;
  const seq = (): number => ++counter;

  const targetKinds = new Set<NodeKind>([
    'BinaryExpr', 'LogicalExpr', 'UnaryExpr', 'UpdateExpr', 'ConditionalExpr',
    'AssignmentExpr', 'Literal', 'IndexExpr', 'ReturnStatement',
    'ExpressionStatement', 'IfStatement', 'WhileStatement', 'DoWhileStatement',
    'ForStatement',
  ]);

  const nodes = findNodes(program, targetKinds);
  for (const node of nodes) {
    for (const op of operators) {
      if (!op.appliesTo(node)) continue;
      for (const spec of op.mutate(node, program, seq)) {
        const key = `${spec.start}:${spec.end}:${spec.mutatedText}`;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(spec);
      }
    }
  }
  return all;
}
