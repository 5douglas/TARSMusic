// @op-engineering/op-sqlite on Node's built-in SQLite (node:sqlite), for the desktop
// build. Same semantics as src/db/testing/opSqliteBetterSqlite3.ts, which the test
// suite already relies on: execute/executeSync apply at call time, executeBatch and
// transaction queue behind a JS-side lock and run a tick later inside BEGIN/COMMIT,
// reactive queries fire on commit.
const { req, toPath, appPaths } = require('./node');

function coerceParams(params) {
  return (params ?? []).map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p instanceof ArrayBuffer) return new Uint8Array(p);
    return p;
  });
}

function writtenTable(sql) {
  const m = sql.match(
    /^\s*(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+["'`]?([A-Za-z0-9_]+)["'`]?/i,
  );
  return m ? m[1] : null;
}

const TX_CONTROL = /^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|END)\b/i;

function makeDb(sqlite, dbPath) {
  const reactive = new Set();
  const dirtyTables = new Set();
  const stmtCache = new Map();

  const prepare = (query) => {
    let stmt = stmtCache.get(query);
    if (!stmt) {
      stmt = sqlite.prepare(query);
      if (stmtCache.size > 500) stmtCache.clear();
      stmtCache.set(query, stmt);
    }
    return stmt;
  };

  const run = (query, params) => {
    if (TX_CONTROL.test(query)) {
      sqlite.exec(query);
      return { rows: [], rowsAffected: 0 };
    }
    const args = coerceParams(params);
    const stmt = prepare(query);
    const columns = stmt.columns();
    if (columns.length > 0) {
      const rows = stmt.all(...args).map((r) => ({ ...r }));
      return { rows, rowsAffected: 0, columnNames: columns.map((c) => c.name) };
    }
    const info = stmt.run(...args);
    const table = writtenTable(query);
    if (table) dirtyTables.add(table);
    return { rows: [], rowsAffected: Number(info.changes), insertId: Number(info.lastInsertRowid) };
  };

  const lock = { queue: [], inProgress: false };
  const startNextTransaction = () => {
    if (lock.inProgress) return;
    const start = lock.queue.shift();
    if (!start) return;
    lock.inProgress = true;
    setTimeout(start, 0);
  };
  const onTransactionLock = (work) =>
    new Promise((resolve, reject) => {
      lock.queue.push(() => {
        (async () => {
          try {
            return await work();
          } finally {
            lock.inProgress = false;
            startNextTransaction();
          }
        })().then(resolve, reject);
      });
      startNextTransaction();
    });

  const fireReactive = () => {
    if (dirtyTables.size === 0) return;
    const touched = new Set(dirtyTables);
    dirtyTables.clear();
    for (const sub of reactive) {
      let hit = false;
      for (const t of sub.tables) if (touched.has(t)) hit = true;
      if (hit) {
        try {
          sub.callback(run(sub.query, sub.args));
        } catch (e) {
          console.warn('[db] reactive query failed', e);
        }
      }
    }
  };

  const asPromise = (fn) => {
    try {
      return Promise.resolve(fn());
    } catch (e) {
      return Promise.reject(e);
    }
  };

  const raw = (r) => ({
    rowsAffected: r.rowsAffected,
    rawRows: r.rows.map((row) => Object.values(row)),
    columnNames: r.columnNames ?? [],
  });

  return {
    execute: (query, params) => asPromise(() => run(query, params)),
    executeSync: (query, params) => run(query, params),
    executeWithHostObjects: (query, params) => asPromise(() => run(query, params)),
    executeRaw: (query, params) => asPromise(() => raw(run(query, params))),
    executeRawSync: (query, params) => raw(run(query, params)),
    executeBatch: (commands) =>
      onTransactionLock(async () => {
        sqlite.exec('BEGIN TRANSACTION');
        let rowsAffected = 0;
        try {
          for (const [query, params] of commands) {
            if (Array.isArray(params) && Array.isArray(params[0])) {
              for (const p of params) rowsAffected += run(query, p).rowsAffected;
            } else {
              rowsAffected += run(query, params).rowsAffected;
            }
          }
          sqlite.exec('COMMIT');
        } catch (e) {
          try {
            sqlite.exec('ROLLBACK');
          } catch {
            /* already rolled back */
          }
          throw e;
        }
        fireReactive();
        return { rowsAffected };
      }),
    transaction: (fn) =>
      onTransactionLock(async () => {
        sqlite.exec('BEGIN');
        const tx = {
          execute: (query, params) => asPromise(() => run(query, params)),
          commit: () => Promise.resolve({ rows: [], rowsAffected: 0 }),
          rollback: () => ({ rows: [], rowsAffected: 0 }),
        };
        try {
          await fn(tx);
          sqlite.exec('COMMIT');
          fireReactive();
        } catch (e) {
          try {
            sqlite.exec('ROLLBACK');
          } catch {
            /* ignore */
          }
          throw e;
        }
      }),
    reactiveExecute: ({ query, arguments: args, fireOn, callback }) => {
      const sub = { query, args: args ?? [], tables: new Set(fireOn.map((f) => f.table)), callback };
      reactive.add(sub);
      return () => reactive.delete(sub);
    },
    flushPendingReactiveQueries: () => {
      fireReactive();
      return Promise.resolve();
    },
    prepareStatement: (query) => {
      let bound = [];
      return {
        bind: (params) => {
          bound = params;
          return Promise.resolve();
        },
        bindSync: (params) => {
          bound = params;
        },
        execute: () => asPromise(() => run(query, bound)),
      };
    },
    getDbPath: () => dbPath,
    close: () => sqlite.close(),
    closeAsync: () => {
      sqlite.close();
      return Promise.resolve();
    },
    delete: () => {
      try {
        sqlite.close();
      } catch {
        /* already closed */
      }
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          req('fs').rmSync(dbPath + suffix, { force: true });
        } catch {
          /* ignore */
        }
      }
    },
    interrupt: () => {},
    updateHook: () => {},
    commitHook: () => {},
    rollbackHook: () => {},
    attach: () => {},
    detach: () => {},
    loadExtension: () => {},
    sync: () => {},
    setReservedBytes: () => {},
    getReservedBytes: () => 0,
    loadFile: () => Promise.resolve({ rowsAffected: 0 }),
  };
}

function resolveLocation(location) {
  let loc = toPath(location || '');
  // `file:///C:/x` stripped of its scheme by the caller arrives as `/C:/x`.
  if (/^[\\/][A-Za-z]:[\\/]/.test(loc)) loc = loc.slice(1);
  return loc;
}

function open(opts) {
  const { DatabaseSync } = req('node:sqlite');
  const pathMod = req('path');
  let dbPath = ':memory:';
  if (opts.location !== ':memory:') {
    const dir = resolveLocation(opts.location) || appPaths().document;
    req('fs').mkdirSync(dir, { recursive: true });
    dbPath = pathMod.join(dir, opts.name);
  }
  const sqlite = new DatabaseSync(dbPath);
  return makeDb(sqlite, dbPath);
}

module.exports = {
  __esModule: true,
  open,
  openSync: open,
  openAsync: (opts) => Promise.resolve(open(opts)),
  moveAssetsDatabase: () => Promise.resolve(true),
  isSQLCipher: () => false,
  isLibsql: () => false,
  isIOSEmbedded: () => false,
  IOS_LIBRARY_PATH: '',
  IOS_DOCUMENT_PATH: '',
  ANDROID_DATABASE_PATH: '',
  ANDROID_FILES_PATH: '',
  ANDROID_EXTERNAL_FILES_PATH: '',
};
