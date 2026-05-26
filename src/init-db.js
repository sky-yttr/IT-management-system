// Initialize the SQLite (sql.js) database with our schema + seed data
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'helpdesk.db');

async function main() {
    if (fs.existsSync(DB_PATH)) {
        fs.unlinkSync(DB_PATH);
        console.log('Removed existing database.');
    }

    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    console.log('Creating schema...');
    db.exec(`
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

    console.log('Inserting seed data...');
    const pwHash = bcrypt.hashSync('password123', 8);

    const insertUser = db.prepare(
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

    db.exec(`
        INSERT INTO tickets (title, description, priority, category, submitted_by_user_id)
        VALUES (
            'Printer on 3rd floor not working',
            'The HP LaserJet near room 312 shows a paper jam error even though there is no paper jam.',
            'MEDIUM', 'HARDWARE', 4
        );
        INSERT INTO status_changes (ticket_id, changed_by_user_id, previous_status, new_status)
        VALUES (1, 4, NULL, 'OPEN');
    `);

    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));

    console.log(`Database written to ${DB_PATH}`);
    console.log('');
    console.log('Demo accounts (all use password "password123"):');
    console.log('  khady@helpdesk.local   (IT Manager)');
    console.log('  alex@helpdesk.local    (Support Agent)');
    console.log('  bineta@company.com     (End User)');
}

main().catch(err => { console.error(err); process.exit(1); });
