// Serialized IndexedDB request/transaction model for the real adapter's unit tests.
const encode = (key) => JSON.stringify(key);
class Names {
  constructor(values) {
    this.values = values;
  }
  contains(name) {
    return this.values.has(name);
  }
}
class SchemaStore {
  constructor(schema) {
    this.schema = schema;
    this.indexNames = new Names(schema.indexes);
  }
  createIndex(name) {
    this.schema.indexes.add(name);
  }
}
class TransactionStore {
  constructor(tx, name) {
    this.tx = tx;
    this.name = name;
  }
  get(key) {
    return this.tx.request(() =>
      structuredClone(this.tx.data.get(this.name).get(encode(key))),
    );
  }
  index(name) {
    if (!this.tx.db.schemas.get(this.name).indexes.has(name))
      throw new Error(`Missing index ${name}`);
    return {
      getAll: (key) =>
        this.tx.request(() =>
          [...this.tx.data.get(this.name).values()]
            .filter((value) => value[name] === key)
            .map((value) => structuredClone(value)),
        ),
    };
  }
  put(value) {
    return this.tx.request(() => {
      const path = this.tx.db.schemas.get(this.name).keyPath;
      const key = Array.isArray(path)
        ? path.map((name) => value[name])
        : value[path];
      this.tx.data.get(this.name).set(encode(key), structuredClone(value));
      return key;
    });
  }
  delete(key) {
    return this.tx.request(() =>
      this.tx.data.get(this.name).delete(encode(key)),
    );
  }
  clear() {
    return this.tx.request(() => this.tx.data.get(this.name).clear());
  }
}
class ModelTransaction {
  constructor(db, names, mode) {
    this.db = db;
    this.names = names;
    this.mode = mode;
    this.pending = 0;
    this.ready = false;
    this.jobs = [];
    this.data = new Map();
  }
  objectStore(name) {
    if (!this.names.includes(name))
      throw new Error(`Store outside transaction ${name}`);
    return new TransactionStore(this, name);
  }
  start() {
    for (const name of this.names)
      this.data.set(
        name,
        new Map(
          [...this.db.schemas.get(name).rows].map(([key, value]) => [
            key,
            structuredClone(value),
          ]),
        ),
      );
    this.ready = true;
    for (const job of this.jobs) job();
    this.jobs = [];
    this.completeIfIdle();
  }
  request(action) {
    const request = {};
    this.pending++;
    const job = () =>
      queueMicrotask(() => {
        try {
          request.result = action();
          request.onsuccess?.();
        } catch (error) {
          this.error = request.error = error;
          request.onerror?.();
          this.onerror?.();
          this.onabort?.();
        }
        this.pending--;
        this.completeIfIdle();
      });
    if (this.ready) job();
    else this.jobs.push(job);
    return request;
  }
  completeIfIdle() {
    if (this.pending !== 0) return;
    queueMicrotask(() => {
      if (this.pending !== 0 || this.finished) return;
      this.finished = true;
      if (!this.error && this.mode === "readwrite")
        for (const name of this.names)
          this.db.schemas.get(name).rows = this.data.get(name);
      if (!this.error) this.oncomplete?.();
      this.db.queue.shift();
      if (this.db.queue[0]) queueMicrotask(() => this.db.queue[0].start());
    });
  }
}
class ModelDatabase {
  constructor() {
    this.schemas = new Map([
      [
        "records",
        {
          keyPath: ["scope", "kind", "id"],
          indexes: new Set(),
          rows: new Map(),
        },
      ],
    ]);
    this.objectStoreNames = new Names(this.schemas);
    this.version = 1;
    this.queue = [];
  }
  close() {
    this.closed = true;
  }
  createObjectStore(name, options) {
    const schema = {
      keyPath: options.keyPath,
      indexes: new Set(),
      rows: new Map(),
    };
    this.schemas.set(name, schema);
    return new SchemaStore(schema);
  }
  transaction(names, mode = "readonly") {
    const tx = new ModelTransaction(
      this,
      Array.isArray(names) ? names : [names],
      mode,
    );
    this.queue.push(tx);
    if (this.queue.length === 1) queueMicrotask(() => tx.start());
    return tx;
  }
}
export class OfflineIndexedDbModel {
  constructor() {
    this.database = new ModelDatabase();
  }
  open(_name, version) {
    const request = {};
    queueMicrotask(() => {
      request.result = this.database;
      if (version > this.database.version) {
        request.transaction = {
          objectStore: (name) =>
            new SchemaStore(this.database.schemas.get(name)),
        };
        request.onupgradeneeded?.();
        this.database.version = version;
      }
      request.onsuccess?.();
    });
    return request;
  }
}
