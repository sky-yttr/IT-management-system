// Database adapter using sql.js (WebAssembly SQLite) — works on any platform
// with just `npm install`, no native compilation needed.
// Exposes a synchronous API similar to better-sqlite3.

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'helpdesk.db');

let _db = null;

async function openDb() {
    if (_db) return _db;
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
        const filebuffer = fs.readFileSync(DB_PATH);
        _db = new SQL.Database(filebuffer);
    } else {
        _db = new SQL.Database();
    }
    _db.exec('PRAGMA foreign_keys = ON');
    return _db;
}

let _inTransaction = false;

function persist() {
    if (!_db) return;
    if (_inTransaction) return;   // defer until commit
    const data = _db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function prepare(sql) {
    if (!_db) throw new Error('DB not opened — call openDb() first');
    return {
        run: (...args) => {
            const stmt = _db.prepare(sql);
            if (args.length) stmt.bind(args);
            stmt.step();
            stmt.free();
            const lastIdRes = _db.exec('SELECT last_insert_rowid() AS id');
            const lastInsertRowid = lastIdRes.length ? lastIdRes[0].values[0][0] : null;
            persist();
            return { lastInsertRowid, changes: _db.getRowsModified() };
        },
        get: (...args) => {
            const stmt = _db.prepare(sql);
            if (args.length) stmt.bind(args);
            const has = stmt.step();
            const row = has ? stmt.getAsObject() : null;
            stmt.free();
            return row;
        },
        all: (...args) => {
            const stmt = _db.prepare(sql);
            if (args.length) stmt.bind(args);
            const rows = [];
            while (stmt.step()) rows.push(stmt.getAsObject());
            stmt.free();
            return rows;
        }
    };
}

function exec(sql) {
    if (!_db) throw new Error('DB not opened');
    _db.exec(sql);
    persist();
}

function transaction(fn) {
    return (...args) => {
        _db.exec('BEGIN');
        _inTransaction = true;
        try {
            const result = fn(...args);
            _db.exec('COMMIT');
            _inTransaction = false;
            persist();
            return result;
        } catch (e) {
            try {
                _db.exec('ROLLBACK');
            } catch (rollbackErr) {
                // Rollback may fail if the transaction was already rolled back
                // by a SQL constraint error — that's fine, log and continue.
            }
            _inTransaction = false;
            throw e;
        }
    };
}

module.exports = { openDb, prepare, exec, transaction, persist };
