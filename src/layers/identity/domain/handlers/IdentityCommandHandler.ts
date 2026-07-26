/**
 * IdentityCommandHandler
 *
 * Handles identity commands.
 */

export interface IdentityCommand {
  type: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface IdentityCommandResult {
  success: boolean;
  commandId: string;
  result?: unknown;
  error?: string;
  durationMs: number;
}

type CommandHandlerFn = (command: IdentityCommand) => Promise<unknown>;

export class IdentityCommandHandler {
  private _handlers: Map<string, CommandHandlerFn>;
  private _middleware: Array<(cmd: IdentityCommand) => IdentityCommand>;
  private _results: IdentityCommandResult[];

  constructor() {
    this._handlers = new Map();
    this._middleware = [];
    this._results = [];
  }

  register(commandType: string, handler: CommandHandlerFn): void {
    this._handlers.set(commandType, handler);
  }

  use(middleware: (cmd: IdentityCommand) => IdentityCommand): void {
    this._middleware.push(middleware);
  }

  async handle(command: IdentityCommand): Promise<IdentityCommandResult> {
    const start = Date.now();
    let cmd = command;
    for (let i = 0; i < this._middleware.length; i++) {
      cmd = this._middleware[i](cmd);
    }
    const handler = this._handlers.get(cmd.type);
    if (!handler) {
      const result: IdentityCommandResult = {
        success: false,
        commandId: (cmd.metadata.commandId as string) ?? 'unknown',
        error: 'No handler for command type: ' + cmd.type,
        durationMs: Date.now() - start,
      };
      this._results.push(result);
      return result;
    }
    try {
      const output = await handler(cmd);
      const okResult: IdentityCommandResult = {
        success: true,
        commandId: (cmd.metadata.commandId as string) ?? 'unknown',
        result: output,
        durationMs: Date.now() - start,
      };
      this._results.push(okResult);
      return okResult;
    } catch (e) {
      const errResult: IdentityCommandResult = {
        success: false,
        commandId: (cmd.metadata.commandId as string) ?? 'unknown',
        error: (e as Error).message,
        durationMs: Date.now() - start,
      };
      this._results.push(errResult);
      return errResult;
    }
  }

  getResults(): IdentityCommandResult[] {
    return [...this._results];
  }
  getRegisteredCommands(): string[] {
    return Array.from(this._handlers.keys());
  }
  clearResults(): void {
    this._results = [];
  }
}
