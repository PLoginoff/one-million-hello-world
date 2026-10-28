// Minimal type declarations for redis package
declare module 'redis' {
  export interface RedisClientType {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): this;
    xAdd(key: string, id: string | '*', data: Record<string, string>): Promise<string>;
    xRead(
      streams: Record<string, string>,
      count?: number,
      block?: number
    ): Promise<Array<{ key: string; messages: Array<{ id: string; data: Record<string, string> }> }>>;
    hIncrBy(key: string, field: string, increment: number): Promise<number>;
    hGetAll(key: string): Promise<Record<string, string>>;
    zIncrBy(key: string, increment: number, member: string): Promise<number>;
    zRange(key: string, start: number, stop: number, rev?: boolean): Promise<string[]>;
    zScore(key: string, member: string): Promise<string | null>;
    expire(key: string, seconds: number): Promise<number>;
    eval(script: string, numKeys: number, ...keys: string[]): Promise<unknown>;
  }

  export interface RedisClientOptions {
    socket?: {
      host?: string;
      port?: number;
      connectTimeout?: number;
      reconnectStrategy?: (times: number) => number | null;
      tls?: boolean;
    };
    password?: string;
    database?: number;
  }

  export function createClient(options?: RedisClientOptions): RedisClientType;
}
