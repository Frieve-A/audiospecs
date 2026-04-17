import DbWorker from './worker.ts?worker';

let worker: Worker | null = null;
let msgId = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new DbWorker();
    worker.onmessage = (e: MessageEvent) => {
      const { id, result, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(result);
    };
    worker.onerror = (e: ErrorEvent) => {
      console.error('Worker error:', e.message, e);
      // Reject all pending promises so the UI doesn't hang
      for (const [id, p] of pending) {
        p.reject(new Error(`Worker error: ${e.message}`));
        pending.delete(id);
      }
    };
  }
  return worker;
}

function send(type: string, payload: Record<string, unknown> = {}, timeoutMs = 30000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Worker request '${type}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    getWorker().postMessage({ id, type, ...payload });
  });
}

export async function initDatabase(): Promise<void> {
  // Resolve relative to the site origin (not current href) so that nested
  // routes like /product/brand/name don't break the asset paths.
  const base = window.location.origin + '/';
  const dbUrl = new URL('./audiodb.web.sqlite', base).href;
  const wasmUrl = new URL('./sql-wasm.wasm', base).href;
  await send('init', { dbUrl, wasmUrl });
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await send('query', { sql, params })) as T[];
}
