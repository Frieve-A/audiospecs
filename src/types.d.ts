declare module 'sql.js' {
  interface Database {
    prepare(sql: string): Statement;
    run(sql: string, params?: unknown[]): void;
    close(): void;
  }

  interface Statement {
    bind(params?: unknown[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  interface InitSqlJsOptions {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>;
  export type { Database, Statement, SqlJsStatic };
}

declare module 'plotly.js-dist-min' {
  const Plotly: {
    react(
      el: string | HTMLElement,
      data: Data[],
      layout?: Partial<Layout>,
      config?: Partial<Config>,
    ): Promise<void>;
    newPlot(
      el: string | HTMLElement,
      data: Data[],
      layout?: Partial<Layout>,
      config?: Partial<Config>,
    ): Promise<void>;
    purge(el: string | HTMLElement): void;
  };

  interface Data {
    x?: unknown[];
    y?: unknown[];
    mode?: string;
    type?: string;
    name?: string;
    marker?: {
      size?: number;
      opacity?: number;
      color?: string | string[];
    };
    text?: string[];
    hoverinfo?: string;
    [key: string]: unknown;
  }

  interface Layout {
    xaxis?: {
      title?: string | { text: string; font?: { family?: string; size?: number; color?: string; weight?: number }; standoff?: number };
      type?: string;
      gridcolor?: string;
      zerolinecolor?: string;
    };
    yaxis?: {
      title?: string | { text: string; font?: { family?: string; size?: number; color?: string; weight?: number }; standoff?: number };
      type?: string;
      gridcolor?: string;
      zerolinecolor?: string;
    };
    paper_bgcolor?: string;
    plot_bgcolor?: string;
    font?: { family?: string; size?: number };
    margin?: { l?: number; r?: number; t?: number; b?: number };
    legend?: {
      orientation?: string;
      y?: number;
      font?: { size?: number };
    };
    hovermode?: string;
    [key: string]: unknown;
  }

  interface Config {
    responsive?: boolean;
    displayModeBar?: boolean;
    modeBarButtonsToRemove?: string[];
    displaylogo?: boolean;
    [key: string]: unknown;
  }

  export default Plotly;
  export type { Data, Layout, Config };
}
