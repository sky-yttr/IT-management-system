const express = require('express');
const router = express.Router();
const UserService = require('../services/UserService');

router.get('/login', (req, res) => {
    if (req.session && req.session.user) return res.redirect('/');
    res.render('login', { title: 'Sign in', error: null });
});

router.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = UserService.authenticate(email, password);
    if (!user) {
        return res.render('login', { title: 'Sign in', error: 'Invalid email or password.' });
    }
    req.session.user = user;
    res.redirect('/');
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
