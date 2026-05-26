function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.redirect('/login');
    }
    res.locals.currentUser = req.session.user;
    next();
}

function requireRole(...allowed) {
    return (req, res, next) => {
        if (!req.session || !req.session.user) return res.redirect('/login');
        if (!allowed.includes(req.session.user.role)) {
            return res.status(403).render('error', {
                title: 'Forbidden',
                message: 'You do not have permission to perform this action.'
            });
        }
        next();
    };
}

module.exports = { requireAuth, requireRole };
