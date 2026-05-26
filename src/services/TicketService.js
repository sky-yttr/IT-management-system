// Application Layer: TicketService
// This is the Facade pattern in action — it provides a unified interface
// over the Domain Layer (Ticket guardian methods) and the Data Access Layer (db),
// while also orchestrating cross-cutting concerns (transactions, notifications).

const db = require('../repositories/db');
const Ticket = require('../domain/Ticket');

class TicketService {

    static findById(id) {
        const row = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
        return row ? new Ticket(row) : null;
    }

    static findAllVisibleTo(user) {
        let rows;
        if (user.role === 'END_USER') {
            // BR-08 visibility: end users see only their own tickets
            rows = db.prepare('SELECT * FROM tickets WHERE submitted_by_user_id = ? ORDER BY created_at DESC').all(user.id);
        } else if (user.role === 'SUPPORT_AGENT') {
            // Support agents see tickets currently assigned to them + unassigned ones
            rows = db.prepare(`
                SELECT DISTINCT t.* FROM tickets t
                LEFT JOIN assignments a ON a.ticket_id = t.id AND a.is_active = 1
                WHERE a.assigned_to_user_id = ? OR a.id IS NULL
                ORDER BY t.created_at DESC
            `).all(user.id);
        } else {
            // IT Managers see everything
            rows = db.prepare('SELECT * FROM tickets ORDER BY created_at DESC').all();
        }
        return rows.map(r => new Ticket(r));
    }

    // FR-13: search & filter tickets, respecting each role's visibility scope.
    // The visibility scope (BR-08) is enforced first, then the optional filters
    // are layered on top as additional WHERE conditions. Business-rule logic stays
    // here in the application layer; the presentation layer only passes raw filter values.
    static searchVisibleTo(user, filters = {}) {
        const where = [];
        const params = [];

        // --- visibility scope (same rules as findAllVisibleTo) ---
        let baseFrom = 'FROM tickets t';
        if (user.role === 'END_USER') {
            where.push('t.submitted_by_user_id = ?');
            params.push(user.id);
        } else if (user.role === 'SUPPORT_AGENT') {
            // assigned to me, or unassigned
            baseFrom += ' LEFT JOIN assignments a ON a.ticket_id = t.id AND a.is_active = 1';
            where.push('(a.assigned_to_user_id = ? OR a.id IS NULL)');
            params.push(user.id);
        }
        // IT_MANAGER: no visibility restriction

        // --- optional filters (FR-13) ---
        if (filters.status) {
            where.push('t.current_status = ?');
            params.push(filters.status);
        }
        if (filters.category) {
            where.push('t.category = ?');
            params.push(filters.category);
        }
        if (filters.priority) {
            where.push('t.priority = ?');
            params.push(filters.priority);
        }
        if (filters.dateFrom) {
            where.push("date(t.created_at) >= date(?)");
            params.push(filters.dateFrom);
        }
        if (filters.dateTo) {
            where.push("date(t.created_at) <= date(?)");
            params.push(filters.dateTo);
        }
        if (filters.agentUserId) {
            // tickets whose ACTIVE assignment is to this agent
            baseFrom += ' LEFT JOIN assignments af ON af.ticket_id = t.id AND af.is_active = 1';
            where.push('af.assigned_to_user_id = ?');
            params.push(parseInt(filters.agentUserId, 10));
        }
        if (filters.q) {
            where.push('(t.title LIKE ? OR t.description LIKE ?)');
            const like = `%${filters.q}%`;
            params.push(like, like);
        }

        const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const sql = `SELECT DISTINCT t.* ${baseFrom} ${whereClause} ORDER BY t.created_at DESC`;
        const rows = db.prepare(sql).all(...params);
        return rows.map(r => new Ticket(r));
    }

    // FR-01: submit ticket
    static submit({ title, description, priority, category }, submitter) {
        const tx = db.transaction(() => {
            const result = db.prepare(`
                INSERT INTO tickets (title, description, priority, category, submitted_by_user_id)
                VALUES (?, ?, ?, ?, ?)
            `).run(title, description, priority, category, submitter.id);

            const ticketId = result.lastInsertRowid;

            db.prepare(`
                INSERT INTO status_changes (ticket_id, changed_by_user_id, previous_status, new_status)
                VALUES (?, ?, NULL, 'OPEN')
            `).run(ticketId, submitter.id);

            // FR-15: notify all IT Managers of new ticket
            const managers = db.prepare(`SELECT id FROM users WHERE role = 'IT_MANAGER' AND is_active = 1`).all();
            const insertNotif = db.prepare(`
                INSERT INTO notifications (recipient_user_id, trigger_type, title, content)
                VALUES (?, 'TICKET_CREATED', ?, ?)
            `);
            for (const m of managers) {
                insertNotif.run(m.id, `New ticket #${ticketId}: ${title}`, `Submitted by ${submitter.name}. Priority: ${priority}.`);
            }
            return ticketId;
        });
        return tx();
    }

    // FR-04 + BR-09: change ticket status
    static changeStatus(ticketId, newStatus, actor) {
        const ticket = TicketService.findById(ticketId);
        if (!ticket) throw new Error('Ticket not found');

        // Special case: closing requires going through closeTicket (BR-01)
        if (newStatus === 'CLOSED') {
            throw new Error('Closure must be performed via the close-ticket flow with a resolution (BR-01).');
        }
        // Special case: opening from closed requires reopen flow (BR-06)
        if (newStatus === 'OPEN' && ticket.currentStatus === 'CLOSED') {
            throw new Error('Reopening must be performed via the reopen flow with a reason (BR-06).');
        }

        if (!ticket.canTransitionTo(newStatus)) {
            throw new Error(`Invalid transition from ${ticket.currentStatus} to ${newStatus} (BR-09).`);
        }

        const tx = db.transaction(() => {
            const previousStatus = ticket.currentStatus;
            db.prepare(`UPDATE tickets SET current_status = ?, updated_at = datetime('now') WHERE id = ?`)
                .run(newStatus, ticketId);
            db.prepare(`
                INSERT INTO status_changes (ticket_id, changed_by_user_id, previous_status, new_status)
                VALUES (?, ?, ?, ?)
            `).run(ticketId, actor.id, previousStatus, newStatus);

            // FR-15: notify submitter
            db.prepare(`
                INSERT INTO notifications (recipient_user_id, trigger_type, title, content)
                VALUES (?, 'STATUS_CHANGED', ?, ?)
            `).run(ticket.submittedByUserId, `Ticket #${ticketId} status changed`, `Status is now ${newStatus}.`);
        });
        tx();
    }

    // FR-05 + BR-05 + BR-08: add comment
    static addComment(ticketId, content, author) {
        const ticket = TicketService.findById(ticketId);
        if (!ticket) throw new Error('Ticket not found');

        const check = ticket.canAcceptCommentFrom(author);
        if (!check.ok) throw new Error(check.reason);

        if (!content || content.trim().length === 0) {
            throw new Error('Comment cannot be empty.');
        }

        db.prepare(`INSERT INTO comments (ticket_id, author_user_id, content) VALUES (?, ?, ?)`)
            .run(ticketId, author.id, content);
    }

    // FR-03 + BR-03: assign ticket
    static assignTicket(ticketId, agentUserId, manager, reason = null) {
        const ticket = TicketService.findById(ticketId);
        if (!ticket) throw new Error('Ticket not found');

        const check = ticket.canBeAssignedBy(manager);
        if (!check.ok) throw new Error(check.reason);

        const agent = db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'SUPPORT_AGENT' AND is_active = 1`).get(agentUserId);
        if (!agent) throw new Error('Selected agent is not a valid active support agent.');

        const tx = db.transaction(() => {
            // BR-03: deactivate the existing active assignment, if any
            db.prepare(`
                UPDATE assignments SET is_active = 0, ended_at = datetime('now'), reason = COALESCE(?, reason)
                WHERE ticket_id = ? AND is_active = 1
            `).run(reason, ticketId);

            // Create the new assignment
            db.prepare(`
                INSERT INTO assignments (ticket_id, assigned_to_user_id, assigned_by_user_id, reason)
                VALUES (?, ?, ?, ?)
            `).run(ticketId, agentUserId, manager.id, reason);

            // If ticket is currently OPEN, move it to IN_PROGRESS
            if (ticket.currentStatus === 'OPEN') {
                db.prepare(`UPDATE tickets SET current_status = 'IN_PROGRESS', updated_at = datetime('now') WHERE id = ?`).run(ticketId);
                db.prepare(`
                    INSERT INTO status_changes (ticket_id, changed_by_user_id, previous_status, new_status)
                    VALUES (?, ?, 'OPEN', 'IN_PROGRESS')
                `).run(ticketId, manager.id);
            }

            // FR-15: notify the assigned agent
            db.prepare(`
                INSERT INTO notifications (recipient_user_id, trigger_type, title, content)
                VALUES (?, 'TICKET_ASSIGNED', ?, ?)
            `).run(agentUserId, `Ticket #${ticketId} assigned to you`, `${ticket.title}`);
        });
        tx();
    }

    // FR-06 + BR-01 + BR-09: close ticket with resolution
    static closeTicket(ticketId, resolutionContent, agent) {
        const ticket = TicketService.findById(ticketId);
        if (!ticket) throw new Error('Ticket not found');

        const check = ticket.canBeClosedBy(agent, resolutionContent);
        if (!check.ok) throw new Error(check.reason);

        const tx = db.transaction(() => {
            db.prepare(`
                INSERT INTO resolution_reports (ticket_id, resolved_by_user_id, content)
                VALUES (?, ?, ?)
            `).run(ticketId, agent.id, resolutionContent);

            db.prepare(`UPDATE tickets SET current_status = 'CLOSED', updated_at = datetime('now') WHERE id = ?`).run(ticketId);

            db.prepare(`
                INSERT INTO status_changes (ticket_id, changed_by_user_id, previous_status, new_status)
                VALUES (?, ?, 'IN_PROGRESS', 'CLOSED')
            `).run(ticketId, agent.id);

            // FR-15: notify submitter
            db.prepare(`
                INSERT INTO notifications (recipient_user_id, trigger_type, title, content)
                VALUES (?, 'TICKET_CLOSED', ?, ?)
            `).run(ticket.submittedByUserId, `Ticket #${ticketId} closed`, `Resolution: ${resolutionContent.substring(0, 100)}`);
        });
        tx();
    }

    // FR-14 + BR-06: reopen ticket
    static reopenTicket(ticketId, reason, manager) {
        const ticket = TicketService.findById(ticketId);
        if (!ticket) throw new Error('Ticket not found');

        const check = ticket.canBeReopenedBy(manager, reason);
        if (!check.ok) throw new Error(check.reason);

        const tx = db.transaction(() => {
            db.prepare(`UPDATE tickets SET current_status = 'OPEN', updated_at = datetime('now') WHERE id = ?`).run(ticketId);
            db.prepare(`
                INSERT INTO status_changes (ticket_id, changed_by_user_id, previous_status, new_status)
                VALUES (?, ?, 'CLOSED', 'OPEN')
            `).run(ticketId, manager.id);

            // Append a comment with the reopen reason for audit visibility
            db.prepare(`INSERT INTO comments (ticket_id, author_user_id, content) VALUES (?, ?, ?)`)
                .run(ticketId, manager.id, `[REOPENED] ${reason}`);

            // FR-15: notify submitter
            db.prepare(`
                INSERT INTO notifications (recipient_user_id, trigger_type, title, content)
                VALUES (?, 'STATUS_CHANGED', ?, ?)
            `).run(ticket.submittedByUserId, `Ticket #${ticketId} reopened`, `Reason: ${reason}`);
        });
        tx();
    }

    // Helpers for views
    static getComments(ticketId) {
        return db.prepare(`
            SELECT c.*, u.name AS author_name, u.role AS author_role
            FROM comments c JOIN users u ON u.id = c.author_user_id
            WHERE c.ticket_id = ? ORDER BY c.created_at ASC
        `).all(ticketId);
    }
    static getStatusChanges(ticketId) {
        return db.prepare(`
            SELECT s.*, u.name AS changer_name
            FROM status_changes s JOIN users u ON u.id = s.changed_by_user_id
            WHERE s.ticket_id = ? ORDER BY s.changed_at ASC
        `).all(ticketId);
    }
    static getActiveAssignment(ticketId) {
        return db.prepare(`
            SELECT a.*, u.name AS agent_name
            FROM assignments a JOIN users u ON u.id = a.assigned_to_user_id
            WHERE a.ticket_id = ? AND a.is_active = 1
        `).get(ticketId);
    }
    static getResolution(ticketId) {
        return db.prepare(`
            SELECT r.*, u.name AS resolver_name
            FROM resolution_reports r JOIN users u ON u.id = r.resolved_by_user_id
            WHERE r.ticket_id = ?
        `).get(ticketId);
    }
    static getSubmitter(submittedByUserId) {
        return db.prepare(`SELECT id, name, email, role FROM users WHERE id = ?`).get(submittedByUserId);
    }
}

module.exports = TicketService;
