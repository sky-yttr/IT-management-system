// Application Layer: UserService
// Demonstrates the Factory Method pattern via createUser(role, ...) which
// instantiates the correct User subtype based on the role parameter.

const db = require('../repositories/db');
const bcrypt = require('bcryptjs');

class UserService {

    static authenticate(email, password) {
        const user = db.prepare(`SELECT * FROM users WHERE email = ? AND is_active = 1`).get(email);
        if (!user) return null;
        if (!bcrypt.compareSync(password, user.hashed_password)) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role };
    }

    static findById(id) {
        return db.prepare(`SELECT id, name, email, role, is_active FROM users WHERE id = ?`).get(id);
    }

    static findAll() {
        return db.prepare(`SELECT id, name, email, role, is_active, created_at FROM users ORDER BY role, name`).all();
    }

    static findActiveAgents() {
        return db.prepare(`SELECT id, name FROM users WHERE role = 'SUPPORT_AGENT' AND is_active = 1 ORDER BY name`).all();
    }

    // FR-12: Factory Method — creates a user of the requested role.
    // The caller specifies the role; this method validates and constructs
    // the correct subtype.
    static createUser({ name, email, password, role }, creator) {
        if (creator.role !== 'IT_MANAGER') {
            throw new Error('Only an IT Manager may create user accounts (FR-12).');
        }
        if (!['END_USER', 'SUPPORT_AGENT', 'IT_MANAGER'].includes(role)) {
            throw new Error('Invalid role.');
        }
        if (!email || !email.includes('@')) {
            throw new Error('Valid email is required.');
        }
        if (!password || password.length < 6) {
            throw new Error('Password must be at least 6 characters.');
        }
        const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
        if (existing) {
            throw new Error('A user with that email already exists.');
        }

        const hashed = bcrypt.hashSync(password, 8);
        const result = db.prepare(`
            INSERT INTO users (name, email, hashed_password, role) VALUES (?, ?, ?, ?)
        `).run(name, email, hashed, role);
        return UserService.findById(result.lastInsertRowid);
    }

    static deactivate(userId, manager) {
        if (manager.role !== 'IT_MANAGER') {
            throw new Error('Only an IT Manager may deactivate accounts (FR-12).');
        }
        db.prepare(`UPDATE users SET is_active = 0 WHERE id = ?`).run(userId);
    }
}

module.exports = UserService;
