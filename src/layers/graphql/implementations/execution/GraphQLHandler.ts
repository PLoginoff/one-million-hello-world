/**
 * GraphQLHandler
 *
 * End-to-end request handling: parse -> validate -> execute, returning
 * an HTTP-shaped response { status, body }. Also handles introspection
 * queries by injecting __schema/__type resolvers.
 */

import { parse } from '../parser/Parser';
import { validate, ValidationError } from './Validation';
import { Executor, ExecutionResult } from './Executor';
import { GraphQLSchema } from '../schema/Schema';
import { introspectSchema, introspectType } from './Introspection';
import { GraphQLSyntaxError } from '../lexer/Lexer';
import { DocumentNode } from '../ast/ast';

export interface GraphQLRequest {
  readonly query: string;
  readonly operationName?: string;
  readonly variables?: Record<string, unknown>;
}

export interface GraphQLHttpResponse {
  readonly status: number;
  readonly body: ExecutionResult | { errors: readonly { message: string }[] };
}

export class GraphQLHandler {
  private readonly schema: GraphQLSchema;
  private readonly executor: Executor;

  constructor(schema: GraphQLSchema) {
    this.schema = schema;
    this.executor = new Executor(schema);
  }

  async handle(
    request: GraphQLRequest,
    contextValue?: unknown
  ): Promise<GraphQLHttpResponse> {
    let doc: DocumentNode;
    try {
      doc = parse(request.query);
    } catch (err) {
      const message = err instanceof GraphQLSyntaxError ? err.message : String(err);
      return { status: 400, body: { errors: [{ message }] } };
    }
    const validationErrors = this.validateWithIntrospection(doc);
    if (validationErrors.length > 0) {
      return {
        status: 400,
        body: { errors: validationErrors.map((e) => ({ message: e.message })) },
      };
    }
    // introspection shortcut
    const intro = this.tryIntrospection(doc);
    if (intro !== null) {
      return { status: 200, body: { data: intro as Record<string, unknown> } };
    }
    const result = await this.executor.execute(doc, {
      operationName: request.operationName,
      variableValues: request.variables,
      contextValue,
    });
    return { status: result.errors !== undefined && result.errors.length > 0 ? 200 : 200, body: result };
  }

  /**
   * Validation, skipping meta-field checks (introspection queries use
   * __schema/__type which aren't on the schema types).
   */
  private validateWithIntrospection(doc: DocumentNode): ValidationError[] {
    const errors = validate(this.schema, doc);
    return errors.filter(
      (e) =>
        !(
          e.rule === 'FieldsOnCorrectType' &&
          (e.message.includes("'__schema'") || e.message.includes("'__type'"))
        )
    );
  }

  /**
   * If the document is a pure introspection query (top-level fields are
   * only __schema/__type), answer it directly without resolvers.
   */
  private tryIntrospection(doc: DocumentNode): Record<string, unknown> | null {
    const op = doc.definitions.find((d) => d.kind === 'OperationDefinition');
    if (op === undefined || op.kind !== 'OperationDefinition') return null;
    const topFields = op.selectionSet.selections.filter((s) => s.kind === 'Field');
    if (
      topFields.length === 0 ||
      !topFields.every(
        (f) => f.kind === 'Field' && (f.name.value === '__schema' || f.name.value === '__type')
      )
    ) {
      return null;
    }
    const data: Record<string, unknown> = {};
    for (const f of topFields) {
      if (f.kind !== 'Field') continue;
      const key = f.alias?.value ?? f.name.value;
      if (f.name.value === '__schema') {
        data[key] = introspectSchema(this.schema);
      } else {
        const nameArg = f.arguments.find((a) => a.name.value === 'name');
        const name =
          nameArg !== undefined && nameArg.value.kind === 'StringValue'
            ? nameArg.value.value
            : undefined;
        data[key] = name !== undefined ? introspectType(this.schema, name) : null;
      }
    }
    return data;
  }
}
