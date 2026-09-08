/**
 * Data access for the API.
 *
 * Two modes:
 *
 *   MONGODB_URI set    → connects to MongoDB as normal.
 *   MONGODB_URI unset  → serves the JSON files in src/data/ through a small
 *                        adapter that implements the slice of the driver API
 *                        this codebase uses.
 *
 * The second mode exists so the public demo keeps working without a database
 * behind it. Writes are applied in memory only and are lost when the process
 * restarts; nothing is written back to disk.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_NAME = process.env.MONGODB_DB || 'bbad';

let client = null;
let jsonStore = null;
let mode = 'json';

/* ------------------------------------------------------------------ *
 * Value comparison
 * ------------------------------------------------------------------ */

/** ObjectId, string or number — compare by string value. */
const sameValue = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  if (typeof a === 'object' || typeof b === 'object') {
    return String(a) === String(b);
  }
  return String(a) === String(b);
};

const readPath = (doc, key) =>
  key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), doc);

function matchesCondition(value, condition) {
  const isOperatorObject =
    condition &&
    typeof condition === 'object' &&
    !Array.isArray(condition) &&
    Object.keys(condition).some((k) => k.startsWith('$'));

  if (!isOperatorObject) {
    if (Array.isArray(value)) return value.some((v) => sameValue(v, condition));
    return sameValue(value, condition);
  }

  return Object.entries(condition).every(([op, operand]) => {
    switch (op) {
      case '$eq':
        return sameValue(value, operand);
      case '$ne':
        return !sameValue(value, operand);
      case '$in':
        return operand.some((v) => sameValue(value, v));
      case '$nin':
        return !operand.some((v) => sameValue(value, v));
      case '$exists':
        return (value !== undefined) === Boolean(operand);
      case '$gt':
        return value > operand;
      case '$gte':
        return value >= operand;
      case '$lt':
        return value < operand;
      case '$lte':
        return value <= operand;
      default:
        console.warn(`[json-store] unsupported query operator: ${op}`);
        return false;
    }
  });
}

function matches(doc, query = {}) {
  return Object.entries(query).every(([key, condition]) => {
    if (key === '$and') return condition.every((sub) => matches(doc, sub));
    if (key === '$or') return condition.some((sub) => matches(doc, sub));
    return matchesCondition(readPath(doc, key), condition);
  });
}

/* ------------------------------------------------------------------ *
 * Update operators (in memory only)
 * ------------------------------------------------------------------ */

function writePath(doc, key, value) {
  const parts = key.split('.');
  const last = parts.pop();
  const target = parts.reduce((acc, part) => (acc[part] ??= {}), doc);
  target[last] = value;
}

function applyUpdate(doc, update) {
  for (const [op, fields] of Object.entries(update)) {
    switch (op) {
      case '$set':
        for (const [key, value] of Object.entries(fields)) {
          writePath(doc, key, value);
        }
        break;
      case '$unset':
        for (const key of Object.keys(fields)) delete doc[key];
        break;
      case '$push':
        for (const [key, value] of Object.entries(fields)) {
          const list = readPath(doc, key);
          if (Array.isArray(list)) list.push(value);
          else writePath(doc, key, [value]);
        }
        break;
      case '$pull':
        for (const [key, condition] of Object.entries(fields)) {
          const list = readPath(doc, key);
          if (Array.isArray(list)) {
            writePath(
              doc,
              key,
              list.filter((item) => !matchesCondition(item, condition))
            );
          }
        }
        break;
      default:
        console.warn(`[json-store] unsupported update operator: ${op}`);
    }
  }
  return doc;
}

/* ------------------------------------------------------------------ *
 * Cursor
 * ------------------------------------------------------------------ */

function createCursor(docs) {
  let result = docs;
  const cursor = {
    limit(n) {
      result = result.slice(0, n);
      return cursor;
    },
    skip(n) {
      result = result.slice(n);
      return cursor;
    },
    sort(spec) {
      const [field, direction] = Object.entries(spec)[0] ?? [];
      if (field) {
        result = [...result].sort((a, b) => {
          const x = readPath(a, field);
          const y = readPath(b, field);
          if (x === y) return 0;
          return (x > y ? 1 : -1) * (direction < 0 ? -1 : 1);
        });
      }
      return cursor;
    },
    project(spec) {
      const included = Object.entries(spec)
        .filter(([, v]) => v === 1 || v === true)
        .map(([k]) => k);
      const renamed = Object.entries(spec).filter(
        ([, v]) => typeof v === 'string' && v.startsWith('$')
      );

      result = result.map((doc) => {
        const out = {};
        if (spec._id !== 0) out._id = doc._id;
        for (const key of included) {
          if (key === '_id') continue;
          out[key] = readPath(doc, key);
        }
        for (const [key, ref] of renamed) {
          out[key] = readPath(doc, ref.slice(1));
        }
        return out;
      });
      return cursor;
    },
    async toArray() {
      return result.map((doc) => structuredClone(doc));
    },
  };
  return cursor;
}

/* ------------------------------------------------------------------ *
 * Collection
 * ------------------------------------------------------------------ */

function createCollection(name, store) {
  const docs = () => (store[name] ??= []);

  return {
    find(query = {}) {
      return createCursor(docs().filter((doc) => matches(doc, query)));
    },

    async findOne(query = {}) {
      const found = docs().find((doc) => matches(doc, query));
      return found ? structuredClone(found) : null;
    },

    async countDocuments(query = {}) {
      return docs().filter((doc) => matches(doc, query)).length;
    },

    aggregate(pipeline = []) {
      let working = docs();

      for (const stage of pipeline) {
        const [op, spec] = Object.entries(stage)[0] ?? [];

        if (op === '$match') {
          working = working.filter((doc) => matches(doc, spec));
        } else if (op === '$sample') {
          working = [...working]
            .sort(() => Math.random() - 0.5)
            .slice(0, spec.size);
        } else if (op === '$limit') {
          working = working.slice(0, spec);
        } else if (working.length === 0) {
          // Nothing left to transform — remaining stages are a no-op.
          break;
        } else {
          console.warn(
            `[json-store] aggregation stage ${op} is not implemented; ` +
              'returning the documents matched so far'
          );
          break;
        }
      }

      return createCursor(working);
    },

    async insertOne(doc) {
      docs().push(doc);
      return { acknowledged: true, insertedId: doc._id };
    },

    async updateOne(query, update) {
      const target = docs().find((doc) => matches(doc, query));
      if (!target) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      applyUpdate(target, update);
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    },

    async deleteOne(query) {
      const index = docs().findIndex((doc) => matches(doc, query));
      if (index === -1) return { acknowledged: true, deletedCount: 0 };
      docs().splice(index, 1);
      return { acknowledged: true, deletedCount: 1 };
    },
  };
}

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

function loadJsonStore() {
  if (!fs.existsSync(DATA_DIR)) {
    throw new Error(
      `No database configured and no JSON data found at ${DATA_DIR}. ` +
        'Run "node scripts/generate-demo-data.js" or set MONGODB_URI.'
    );
  }

  const store = {};
  for (const file of fs.readdirSync(DATA_DIR)) {
    if (!file.endsWith('.json')) continue;
    const collectionName = path.basename(file, '.json');
    store[collectionName] = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, file), 'utf8')
    );
  }
  return store;
}

const connectToDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (uri) {
    const { MongoClient } = require('mongodb');
    client = new MongoClient(uri);
    try {
      await client.connect();
      mode = 'mongodb';
      console.log(`db connected!| name: "${DB_NAME}"`);
    } catch (err) {
      console.error('Failed to connect to MongoDB:', err);
      throw err;
    }
    return;
  }

  jsonStore = loadJsonStore();
  mode = 'json';
  const summary = Object.entries(jsonStore)
    .map(([name, rows]) => `${name}:${rows.length}`)
    .join(' ');
  console.log(`db connected!| json demo data (${summary})`);
};

const getDB = () => {
  if (mode === 'mongodb') return client.db(DB_NAME);

  if (!jsonStore) jsonStore = loadJsonStore();
  return {
    collection: (name) => createCollection(name, jsonStore),
  };
};

const getMode = () => mode;

module.exports = { connectToDB, getDB, getMode };
