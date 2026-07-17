const DATABASE_NAME = "workspace-sync";
const DATABASE_VERSION = 1;
const OBJECT_STORE_NAME = "workspaces";

/**
 * One workspace snapshot as it sits in IndexedDB. `anchorType` and `anchorId`
 * are stored alongside the derived `key` so a record is self-describing when
 * inspected in devtools; `key` is what it is actually looked up by.
 */
export interface PersistedWorkspace<T> {
  key: string;
  anchorType: string;
  anchorId: string | number;
  version: Date;
  workspace: T;
}

let databasePromise: Promise<IDBDatabase | undefined> | undefined;

function openDatabase(): Promise<IDBDatabase | undefined> {
  const indexedDb = globalThis.indexedDB;
  // No IndexedDB at all: SSR, a locked-down webview, or some private modes.
  if (!indexedDb) return Promise.resolve(undefined);

  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
    } catch {
      resolve(undefined);
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OBJECT_STORE_NAME)) {
        database.createObjectStore(OBJECT_STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      // Another tab is upgrading, or the connection died: drop the cached
      // handle so the next call opens a fresh one rather than reusing a
      // connection that will throw on every transaction.
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      database.onclose = () => {
        databasePromise = undefined;
      };
      resolve(database);
    };

    // Every failure here degrades to "no cache", never to a broken boot: the
    // snapshot is an optimization, and the initial query is always the fallback.
    request.onerror = () => resolve(undefined);
    request.onblocked = () => resolve(undefined);
  });
}

function getDatabase(): Promise<IDBDatabase | undefined> {
  databasePromise ??= openDatabase();
  return databasePromise;
}

function promisifyRequest<R>(request: IDBRequest<R>): Promise<R> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readPersistedWorkspace<T>(
  key: string,
): Promise<PersistedWorkspace<T> | undefined> {
  const database = await getDatabase();
  if (!database) return undefined;

  try {
    const transaction = database.transaction(OBJECT_STORE_NAME, "readonly");
    const record = await promisifyRequest<PersistedWorkspace<T> | undefined>(
      transaction.objectStore(OBJECT_STORE_NAME).get(key),
    );
    return record ?? undefined;
  } catch {
    return undefined;
  }
}

export async function writePersistedWorkspace<T>(
  record: PersistedWorkspace<T>,
): Promise<void> {
  const database = await getDatabase();
  if (!database) return;

  try {
    const transaction = database.transaction(OBJECT_STORE_NAME, "readwrite");
    await promisifyRequest(
      transaction.objectStore(OBJECT_STORE_NAME).put(record),
    );
  } catch (error) {
    // Quota exhaustion or an unclonable value must not take the live workspace
    // down with it — the tab keeps working, it just boots cold next time.
    console.warn("workspace-sync: could not persist workspace snapshot", error);
  }
}

/**
 * Wipes every cached workspace. Apps call this on logout — but note that it is
 * only half of a logout: the provider must also unmount (or its coordinator be
 * destroyed), or the driver tab will simply write its in-memory snapshot back.
 */
export async function clearWorkspaceCache(): Promise<void> {
  const database = await getDatabase();
  if (!database) return;

  try {
    const transaction = database.transaction(OBJECT_STORE_NAME, "readwrite");
    await promisifyRequest(transaction.objectStore(OBJECT_STORE_NAME).clear());
  } catch (error) {
    console.warn("workspace-sync: could not clear workspace cache", error);
  }
}
