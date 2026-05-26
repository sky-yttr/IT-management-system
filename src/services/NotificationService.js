const db = require('../repositories/db');

class NotificationService {
    static getForUser(userId) {
        return db.prepare(`
            SELECT * FROM notifications WHERE recipient_user_id = ?
            ORDER BY sent_at DESC LIMIT 30
        `).all(userId);
    }
    static unreadCount(userId) {
        const row = db.prepare(`SELECT COUNT(*) AS c FROM notifications WHERE recipient_user_id = ? AND is_read = 0`).get(userId);
        return row.c;
    }
    static markAllRead(userId) {
        db.prepare(`UPDATE notifications SET is_read = 1 WHERE recipient_user_id = ?`).run(userId);
    }
}

module.exports = NotificationService;
