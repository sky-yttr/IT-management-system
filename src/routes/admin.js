const express = require('express');
const router = express.Router();
const UserService = require('../services/UserService');
const NotificationService = require('../services/NotificationService');
const { requireAuth, requireRole } = require('../middleware/auth');

// User management (IT Manager only)
router.get('/users', requireAuth, requireRole('IT_MANAGER'), (req, res) => {
    const users = UserService.findAll();
    res.render('users', { title: 'User accounts', users, error: null });
});

router.post('/users', requireAuth, requireRole('IT_MANAGER'), (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        UserService.createUser({ name, email, password, role }, req.session.user);
        res.redirect('/users');
    } catch (e) {
        const users = UserService.findAll();
        res.render('users', { title: 'User accounts', users, error: e.message });
    }
});

router.post('/users/:id/deactivate', requireAuth, requireRole('IT_MANAGER'), (req, res) => {
    try {
        UserService.deactivate(req.params.id, req.session.user);
    } catch (e) { /* ignore */ }
    res.redirect('/users');
});

// Notifications
router.get('/notifications', requireAuth, (req, res) => {
    const notifs = NotificationService.getForUser(req.session.user.id);
    NotificationService.markAllRead(req.session.user.id);
    res.render('notifications', { title: 'Notifications', notifs });
});

module.exports = router;
