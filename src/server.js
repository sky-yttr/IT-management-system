const express = require('express');
const session = require('express-session');
const path = require('path');

const db = require('./repositories/db');
const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const adminRoutes = require('./routes/admin');
const NotificationService = require('./services/NotificationService');

async function main() {
    await db.openDb();
    console.log('Database opened.');

    const app = express();
    const PORT = process.env.PORT || 3000;

    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));

    app.use(express.urlencoded({ extended: false }));
    app.use(express.static(path.join(__dirname, '..', 'public')));
    app.use(session({
        secret: process.env.SESSION_SECRET || 'helpdesk-prototype-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 }
    }));

    app.use((req, res, next) => {
        res.locals.currentUser = req.session && req.session.user ? req.session.user : null;
        if (res.locals.currentUser) {
            res.locals.unreadCount = NotificationService.unreadCount(res.locals.currentUser.id);
        } else {
            res.locals.unreadCount = 0;
        }
        next();
    });

    app.use('/', authRoutes);
    app.use('/', ticketRoutes);
    app.use('/', adminRoutes);

    app.use((req, res) => {
        res.status(404).render('error', { title: 'Not found', message: 'Page not found.' });
    });

    app.use((err, req, res, next) => {
        console.error(err);
        res.status(500).render('error', { title: 'Server error', message: err.message || 'An unexpected error occurred.' });
    });

    app.listen(PORT, () => {
        console.log(`Help Desk prototype running at http://localhost:${PORT}`);
    });
}

main().catch(err => { console.error(err); process.exit(1); });
