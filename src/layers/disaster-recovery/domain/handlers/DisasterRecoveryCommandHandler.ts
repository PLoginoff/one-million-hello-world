/**
 * DisasterRecoveryCommandHandler
 *
 * Handles disaster-recovery commands.
 */

export interface DisasterRecoveryCommand {
  type: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface DisasterRecoveryCommandResult {
  success: boolean;
  commandId: string;
  result?: unknown;
  error?: string;
  durationMs: number;
}

type CommandHandlerFn = (command: DisasterRecoveryCommand) => Promise<unknown>;

export class DisasterRecoveryCommandHandler {
  private _handlers: Map<string, CommandHandlerFn>;
  private _middleware: Array<(cmd: DisasterRecoveryCommand) => DisasterRecoveryCommand>;
  private _results: DisasterRecoveryCommandResult[];

  constructor() {
    this._handlers = new Map();
    this._middleware = [];
    this._results = [];
  }

  register(commandType: string, handler: CommandHandlerFn): void {
    this._handlers.set(commandType, handler);
  }

  use(middleware: (cmd: DisasterRecoveryCommand) => DisasterRecoveryCommand): void {
    this._middleware.push(middleware);
  }

  async handle(command: DisasterRecoveryCommand): Promise<DisasterRecoveryCommandResult> {
    const start = Date.now();
    let cmd = command;
    for (let i = 0; i < this._middleware.length; i++) {
      cmd = this._middleware[i](cmd);
    }
    const handler = this._handlers.get(cmd.type);
    if (!handler) {
      const result: DisasterRecoveryCommandResult = {
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
      const okResult: DisasterRecoveryCommandResult = {
        success: true,
        commandId: (cmd.metadata.commandId as string) ?? 'unknown',
        result: output,
        durationMs: Date.now() - start,
      };
      this._results.push(okResult);
      return okResult;
    } catch (e) {
      const errResult: DisasterRecoveryCommandResult = {
        success: false,
        commandId: (cmd.metadata.commandId as string) ?? 'unknown',
        error: (e as Error).message,
        durationMs: Date.now() - start,
      };
      this._results.push(errResult);
      return errResult;
    }
  }

  getResults(): DisasterRecoveryCommandResult[] {
    return [...this._results];
  }
  getRegisteredCommands(): string[] {
    return Array.from(this._handlers.keys());
  }
  clearResults(): void {
    this._results = [];
  }
}
