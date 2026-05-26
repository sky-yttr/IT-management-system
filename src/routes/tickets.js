const express = require('express');
const router = express.Router();
const TicketService = require('../services/TicketService');
const UserService = require('../services/UserService');
const NotificationService = require('../services/NotificationService');
const ReportService = require('../services/ReportService');
const { requireAuth, requireRole } = require('../middleware/auth');

// Valid filter option values, surfaced to the dashboard filter bar (FR-13)
const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'PENDING_USER', 'CLOSED'];
const CATEGORY_OPTIONS = ['HARDWARE', 'SOFTWARE', 'NETWORK', 'ACCOUNT', 'OTHER'];
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// Dashboard - list tickets visible to the current user, with optional filters (FR-13)
router.get('/', requireAuth, (req, res) => {
    const user = req.session.user;
    const filters = {
        status: req.query.status || '',
        category: req.query.category || '',
        priority: req.query.priority || '',
        dateFrom: req.query.dateFrom || '',
        dateTo: req.query.dateTo || '',
        agentUserId: req.query.agentUserId || '',
        q: req.query.q || ''
    };
    const hasFilters = Object.values(filters).some(v => v !== '');
    const tickets = hasFilters
        ? TicketService.searchVisibleTo(user, filters)
        : TicketService.findAllVisibleTo(user);
    const unread = NotificationService.unreadCount(user.id);
    // Agent dropdown only meaningful for managers
    const agents = (user.role === 'IT_MANAGER') ? UserService.findActiveAgents() : [];
    res.render('dashboard', {
        title: 'Dashboard', tickets, unread, filters, hasFilters, agents,
        statusOptions: STATUS_OPTIONS, categoryOptions: CATEGORY_OPTIONS, priorityOptions: PRIORITY_OPTIONS
    });
});

// FR-10: Reporting dashboard (IT Manager only)
router.get('/reports', requireAuth, requireRole('IT_MANAGER'), (req, res) => {
    res.render('reports', {
        title: 'Reports',
        statusCounts: ReportService.statusCounts(),
        byCategory: ReportService.volumeByCategory(),
        byPriority: ReportService.volumeByPriority(),
        perAgent: ReportService.avgResolutionTimePerAgent(),
        overTime: ReportService.volumeOverTime(),
        overallAvg: ReportService.overallAvgResolutionHours()
    });
});

// Submit a new ticket (form)
router.get('/tickets/new', requireAuth, requireRole('END_USER', 'IT_MANAGER'), (req, res) => {
    res.render('ticket-new', { title: 'Submit a ticket', error: null });
});

// Submit a new ticket (POST)
router.post('/tickets/new', requireAuth, requireRole('END_USER', 'IT_MANAGER'), (req, res) => {
    try {
        const { title, description, priority, category } = req.body;
        if (!title || !description || !priority || !category) {
            throw new Error('All fields are required.');
        }
        const id = TicketService.submit({ title, description, priority, category }, req.session.user);
        res.redirect(`/tickets/${id}`);
    } catch (e) {
        res.render('ticket-new', { title: 'Submit a ticket', error: e.message });
    }
});

// View a ticket
router.get('/tickets/:id', requireAuth, (req, res) => {
    const user = req.session.user;
    const ticket = TicketService.findById(req.params.id);
    if (!ticket) return res.status(404).render('error', { title: 'Not found', message: 'Ticket not found.' });

    // BR-08: end users can only view their own tickets
    if (user.role === 'END_USER' && ticket.submittedByUserId !== user.id) {
        return res.status(403).render('error', { title: 'Forbidden', message: 'You do not have access to this ticket.' });
    }

    const comments = TicketService.getComments(ticket.id);
    const statusChanges = TicketService.getStatusChanges(ticket.id);
    const assignment = TicketService.getActiveAssignment(ticket.id);
    const resolution = TicketService.getResolution(ticket.id);
    const submitter = TicketService.getSubmitter(ticket.submittedByUserId);
    const agents = (user.role === 'IT_MANAGER') ? UserService.findActiveAgents() : [];

    res.render('ticket-view', {
        title: `Ticket #${ticket.id}`,
        ticket, comments, statusChanges, assignment, resolution, submitter, agents,
        flash: req.session.flash
    });
    req.session.flash = null;
});

// Add a comment
router.post('/tickets/:id/comments', requireAuth, (req, res) => {
    try {
        TicketService.addComment(req.params.id, req.body.content, req.session.user);
    } catch (e) {
        req.session.flash = { type: 'error', message: e.message };
    }
    res.redirect(`/tickets/${req.params.id}`);
});

// Change status (non-closure transitions)
router.post('/tickets/:id/status', requireAuth, requireRole('SUPPORT_AGENT', 'IT_MANAGER'), (req, res) => {
    try {
        TicketService.changeStatus(req.params.id, req.body.newStatus, req.session.user);
    } catch (e) {
        req.session.flash = { type: 'error', message: e.message };
    }
    res.redirect(`/tickets/${req.params.id}`);
});

// Assign ticket (IT Manager only)
router.post('/tickets/:id/assign', requireAuth, requireRole('IT_MANAGER'), (req, res) => {
    try {
        const { agentUserId, reason } = req.body;
        TicketService.assignTicket(req.params.id, parseInt(agentUserId, 10), req.session.user, reason);
    } catch (e) {
        req.session.flash = { type: 'error', message: e.message };
    }
    res.redirect(`/tickets/${req.params.id}`);
});

// Close ticket
router.post('/tickets/:id/close', requireAuth, requireRole('SUPPORT_AGENT', 'IT_MANAGER'), (req, res) => {
    try {
        TicketService.closeTicket(req.params.id, req.body.resolutionContent, req.session.user);
        req.session.flash = { type: 'success', message: 'Ticket closed successfully.' };
    } catch (e) {
        req.session.flash = { type: 'error', message: e.message };
    }
    res.redirect(`/tickets/${req.params.id}`);
});

// Reopen ticket (IT Manager only)
router.post('/tickets/:id/reopen', requireAuth, requireRole('IT_MANAGER'), (req, res) => {
    try {
        TicketService.reopenTicket(req.params.id, req.body.reason, req.session.user);
        req.session.flash = { type: 'success', message: 'Ticket reopened.' };
    } catch (e) {
        req.session.flash = { type: 'error', message: e.message };
    }
    res.redirect(`/tickets/${req.params.id}`);
});

module.exports = router;
