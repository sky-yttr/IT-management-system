// Seed extra demo data so the Reports dashboard has something meaningful to show:
// tickets across categories/priorities, some resolved with realistic resolution times.
const db = require('./repositories/db');

async function main() {
    await db.openDb();

    // user ids from the base seed
    const manager = db.prepare(`SELECT id FROM users WHERE email='khady@helpdesk.local'`).get().id;
    const alex = db.prepare(`SELECT id FROM users WHERE email='alex@helpdesk.local'`).get().id;
    const fatou = db.prepare(`SELECT id FROM users WHERE email='fatou@helpdesk.local'`).get().id;
    const bineta = db.prepare(`SELECT id FROM users WHERE email='bineta@company.com'`).get().id;
    const omar = db.prepare(`SELECT id FROM users WHERE email='omar@company.com'`).get().id;

    // (title, desc, priority, category, submitter, daysAgoCreated, resolveAfterHours|null, resolver)
    const data = [
        ['Projector HDMI not detected in Room 204', 'The classroom projector does not detect the HDMI input from the lecturer laptop.', 'HIGH', 'HARDWARE', bineta, 9, 3.5, alex],
        ['VPN disconnects every few minutes', 'The corporate VPN drops the connection repeatedly throughout the day.', 'CRITICAL', 'NETWORK', omar, 8, 6.0, fatou],
        ['Cannot reset my email password', 'The self-service password reset page returns an error.', 'MEDIUM', 'ACCOUNT', bineta, 7, 1.5, alex],
        ['Printer on 3rd floor is offline', 'Shared printer shows offline for everyone on the floor.', 'MEDIUM', 'HARDWARE', omar, 6, 4.0, fatou],
        ['Excel crashes when opening large files', 'Spreadsheet application closes unexpectedly with files over 10MB.', 'LOW', 'SOFTWARE', bineta, 5, 20.0, alex],
        ['New employee needs software licenses', 'Onboarding: please provision the standard software set.', 'LOW', 'SOFTWARE', omar, 4, 30.0, fatou],
        ['Wi-Fi very slow in the library', 'Wireless throughput in the library is much lower than usual.', 'HIGH', 'NETWORK', bineta, 3, null, null],
        ['Laptop will not boot after update', 'After the latest OS update the laptop is stuck on a black screen.', 'CRITICAL', 'HARDWARE', omar, 2, null, null],
        ['Request access to shared drive', 'Need read/write access to the finance shared folder.', 'MEDIUM', 'ACCOUNT', bineta, 1, null, null],
    ];

    for (const [title, desc, pri, cat, submitter, daysAgo, resolveHrs, resolver] of data) {
        const createdAt = `datetime('now','-${daysAgo} days')`;
        const tx = db.transaction(() => {
            db.prepare(`INSERT INTO tickets (title, description, priority, category, submitted_by_user_id, current_status, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, 'OPEN', ${createdAt}, ${createdAt})`).run(title, desc, pri, cat, submitter);
            const tid = db.prepare('SELECT last_insert_rowid() AS id').get().id;
            db.prepare(`INSERT INTO status_changes (ticket_id, changed_by_user_id, previous_status, new_status, changed_at)
                        VALUES (?, ?, NULL, 'OPEN', ${createdAt})`).run(tid, submitter);

            if (resolveHrs !== null) {
                // assign -> in progress
                db.prepare(`INSERT INTO assignments (ticket_id, assigned_to_user_id, assigned_by_user_id, is_active, assigned_at)
                            VALUES (?, ?, ?, 1, ${createdAt})`).run(tid, resolver, manager);
                db.prepare(`UPDATE tickets SET current_status='IN_PROGRESS' WHERE id=?`).run(tid);
                db.prepare(`INSERT INTO status_changes (ticket_id, changed_by_user_id, previous_status, new_status, changed_at)
                            VALUES (?, ?, 'OPEN', 'IN_PROGRESS', ${createdAt})`).run(tid, manager);
                // close after resolveHrs
                const resolvedAt = `datetime('now','-${daysAgo} days','+${resolveHrs} hours')`;
                db.prepare(`INSERT INTO resolution_reports (ticket_id, resolved_by_user_id, content, resolved_at)
                            VALUES (?, ?, ?, ${resolvedAt})`).run(tid, resolver, 'Issue diagnosed and resolved; verified with the user.');
                db.prepare(`UPDATE tickets SET current_status='CLOSED', updated_at=${resolvedAt} WHERE id=?`).run(tid);
                db.prepare(`INSERT INTO status_changes (ticket_id, changed_by_user_id, previous_status, new_status, changed_at)
                            VALUES (?, ?, 'IN_PROGRESS', 'CLOSED', ${resolvedAt})`).run(tid, resolver);
            } else if (daysAgo <= 2) {
                // leave a couple as assigned/in-progress for variety
                db.prepare(`INSERT INTO assignments (ticket_id, assigned_to_user_id, assigned_by_user_id, is_active, assigned_at)
                            VALUES (?, ?, ?, 1, ${createdAt})`).run(tid, resolver || alex, manager);
                db.prepare(`UPDATE tickets SET current_status='IN_PROGRESS' WHERE id=?`).run(tid);
                db.prepare(`INSERT INTO status_changes (ticket_id, changed_by_user_id, previous_status, new_status, changed_at)
                            VALUES (?, ?, 'OPEN', 'IN_PROGRESS', ${createdAt})`).run(tid, manager);
            }
        });
        tx();
    }

    const total = db.prepare('SELECT COUNT(*) AS c FROM tickets').get().c;
    const closed = db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE current_status='CLOSED'`).get().c;
    console.log(`Seed extended: ${total} tickets total, ${closed} closed.`);
}
main().catch(e => { console.error(e); process.exit(1); });
