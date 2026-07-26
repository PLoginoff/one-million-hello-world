/**
 * TransportCommandHandler
 *
 * Handles transport commands.
 */

export interface TransportCommand {
  type: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface TransportCommandResult {
  success: boolean;
  commandId: string;
  result?: unknown;
  error?: string;
  durationMs: number;
}

type CommandHandlerFn = (command: TransportCommand) => Promise<unknown>;

export class TransportCommandHandler {
  private _handlers: Map<string, CommandHandlerFn>;
  private _middleware: Array<(cmd: TransportCommand) => TransportCommand>;
  private _results: TransportCommandResult[];

  constructor() {
    this._handlers = new Map();
    this._middleware = [];
    this._results = [];
  }

  register(commandType: string, handler: CommandHandlerFn): void {
    this._handlers.set(commandType, handler);
  }

  use(middleware: (cmd: TransportCommand) => TransportCommand): void {
    this._middleware.push(middleware);
  }

  async handle(command: TransportCommand): Promise<TransportCommandResult> {
    const start = Date.now();
    let cmd = command;
    for (let i = 0; i < this._middleware.length; i++) {
      cmd = this._middleware[i](cmd);
    }
    const handler = this._handlers.get(cmd.type);
    if (!handler) {
      const result: TransportCommandResult = {
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
      const okResult: TransportCommandResult = {
        success: true,
        commandId: (cmd.metadata.commandId as string) ?? 'unknown',
        result: output,
        durationMs: Date.now() - start,
      };
      this._results.push(okResult);
      return okResult;
    } catch (e) {
      const errResult: TransportCommandResult = {
        success: false,
        commandId: (cmd.metadata.commandId as string) ?? 'unknown',
        error: (e as Error).message,
        durationMs: Date.now() - start,
      };
      this._results.push(errResult);
      return errResult;
    }
  }

  getResults(): TransportCommandResult[] {
    return [...this._results];
  }
  getRegisteredCommands(): string[] {
    return Array.from(this._handlers.keys());
  }
  clearResults(): void {
    this._results = [];
  }
}
