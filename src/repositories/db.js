const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

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
    await _ensureSchema();
    return _db;
}

async function _ensureSchema() {
    // Check if the users table exists; if not, initialize schema + seed data.
    const row = _db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`);
    if (row.length > 0) return; // already initialized

    console.log('Initializing database schema and seed data...');

    _db.exec(`
        CREATE TABLE users (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            email           TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            role            TEXT NOT NULL CHECK (role IN ('END_USER','SUPPORT_AGENT','IT_MANAGER')),
            is_active       INTEGER NOT NULL DEFAULT 1,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE tickets (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            title                TEXT NOT NULL,
            description          TEXT NOT NULL,
            priority             TEXT NOT NULL CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
            category             TEXT NOT NULL CHECK (category IN ('HARDWARE','SOFTWARE','NETWORK','ACCOUNT','OTHER')),
            current_status       TEXT NOT NULL DEFAULT 'OPEN' CHECK (current_status IN ('OPEN','IN_PROGRESS','PENDING_USER','CLOSED')),
            submitted_by_user_id INTEGER NOT NULL REFERENCES users(id),
            created_at           TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE comments (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id      INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            author_user_id INTEGER NOT NULL REFERENCES users(id),
            content        TEXT NOT NULL,
            created_at     TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE status_changes (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id          INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            changed_by_user_id INTEGER NOT NULL REFERENCES users(id),
            previous_status    TEXT,
            new_status         TEXT NOT NULL,
            changed_at         TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE assignments (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id           INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            assigned_to_user_id INTEGER NOT NULL REFERENCES users(id),
            assigned_by_user_id INTEGER NOT NULL REFERENCES users(id),
            is_active           INTEGER NOT NULL DEFAULT 1,
            reason              TEXT,
            assigned_at         TEXT NOT NULL DEFAULT (datetime('now')),
            ended_at            TEXT
        );
        CREATE TABLE resolution_reports (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id           INTEGER NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
            resolved_by_user_id INTEGER NOT NULL REFERENCES users(id),
            content             TEXT NOT NULL,
            resolved_at         TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE notifications (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            recipient_user_id INTEGER NOT NULL REFERENCES users(id),
            trigger_type      TEXT NOT NULL CHECK (trigger_type IN ('TICKET_CREATED','TICKET_ASSIGNED','STATUS_CHANGED','TICKET_CLOSED')),
            title             TEXT NOT NULL,
            content           TEXT NOT NULL,
            is_read           INTEGER NOT NULL DEFAULT 0,
            sent_at           TEXT NOT NULL DEFAULT (datetime('now'))
        );
    `);

    const pwHash = bcrypt.hashSync('password123', 8);
    const insertUser = _db.prepare(
        `INSERT INTO users (name, email, hashed_password, role) VALUES (?, ?, ?, ?)`
    );
    [
        ['Khady Yattara',  'khady@helpdesk.local',  pwHash, 'IT_MANAGER'],
        ['Alex Diop',      'alex@helpdesk.local',   pwHash, 'SUPPORT_AGENT'],
        ['Fatou Sow',      'fatou@helpdesk.local',  pwHash, 'SUPPORT_AGENT'],
        ['Bineta Diallo',  'bineta@company.com',    pwHash, 'END_USER'],
        ['Omar Ndiaye',    'omar@company.com',      pwHash, 'END_USER'],
    ].forEach(args => { insertUser.bind(args); insertUser.step(); insertUser.reset(); });
    insertUser.free();

    _db.exec(`
        INSERT INTO tickets (title, description, priority, category, submitted_by_user_id)
        VALUES (
            'Printer on 3rd floor not working',
            'The HP LaserJet near room 312 shows a paper jam error even though there is no paper jam.',
            'MEDIUM', 'HARDWARE', 4
        );
        INSERT INTO status_changes (ticket_id, changed_by_user_id, previous_status, new_status)
        VALUES (1, 4, NULL, 'OPEN');
    `);

    _persist();
    console.log('Database initialized with seed data.');
}

let _inTransaction = false;

function _persist() {
    if (!_db) return;
    if (_inTransaction) return;
    const data = _db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function persist() {
    _persist();
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
            _persist();
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
    _persist();
}

function transaction(fn) {
    return (...args) => {
        _db.exec('BEGIN');
        _inTransaction = true;
        try {
            const result = fn(...args);
            _db.exec('COMMIT');
            _inTransaction = false;
            _persist();
            return result;
        } catch (e) {
            try { _db.exec('ROLLBACK'); } catch (_) {}
            _inTransaction = false;
            throw e;
        }
    };
}

module.exports = { openDb, prepare, exec, transaction, persist };
