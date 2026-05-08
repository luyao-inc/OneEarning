declare module "sql.js" {
  export interface Statement {
    bind(values?: unknown[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    reset(): void;
    free(): void;
  }

  export interface Database {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string, params?: unknown[]): ExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface ExecResult {
    columns: string[];
    values: unknown[][];
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayBuffer | Uint8Array | null) => Database;
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}
