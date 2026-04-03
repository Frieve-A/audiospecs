import initSqlJs, { type Database } from 'sql.js';

let db: Database | null = null;

async function initDb(dbUrl: string, wasmUrl: string): Promise<void> {
  const SQL = await initSqlJs({
    locateFile: () => wasmUrl,
  });
  const response = await fetch(dbUrl);
  const buffer = await response.arrayBuffer();
  db = new SQL.Database(new Uint8Array(buffer));
}

function query(sql: string, params: unknown[] = []): Record<string, unknown>[] {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results: Record<string, unknown>[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row as Record<string, unknown>);
  }
  stmt.free();
  return results;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, sql, params, dbUrl, wasmUrl } = e.data;
  try {
    if (type === 'init') {
      await initDb(dbUrl, wasmUrl);
      self.postMessage({ id, result: { ok: true } });
    } else if (type === 'query') {
      const result = query(sql, params || []);
      self.postMessage({ id, result });
    }
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message });
  }
};
