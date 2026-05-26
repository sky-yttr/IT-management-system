// Domain entity — Ticket
// This class enforces business rules through guardian methods (State pattern).

class Ticket {
    constructor(row) {
        this.id = row.id;
        this.title = row.title;
        this.description = row.description;
        this.priority = row.priority;
        this.category = row.category;
        this.currentStatus = row.current_status;
        this.submittedByUserId = row.submitted_by_user_id;
        this.createdAt = row.created_at;
        this.updatedAt = row.updated_at;
    }

    // BR-09: allowed transitions
    static ALLOWED_TRANSITIONS = {
        'OPEN':         ['IN_PROGRESS'],
        'IN_PROGRESS':  ['PENDING_USER', 'CLOSED'],
        'PENDING_USER': ['IN_PROGRESS'],
        'CLOSED':       ['OPEN']   // only via reopen, additionally guarded by role
    };

    // Guardian: state transition (BR-09)
    canTransitionTo(newStatus) {
        const allowed = Ticket.ALLOWED_TRANSITIONS[this.currentStatus] || [];
        return allowed.includes(newStatus);
    }

    // Guardian: can a comment be added? (BR-05, BR-08)
    canAcceptCommentFrom(user) {
        if (this.currentStatus === 'CLOSED') {
            return { ok: false, reason: 'Comments cannot be added to a closed ticket (BR-05).' };
        }
        // BR-08: only the submitter or staff (support agent / IT manager) can comment
        const isSubmitter = user.id === this.submittedByUserId;
        const isStaff = user.role === 'SUPPORT_AGENT' || user.role === 'IT_MANAGER';
        if (!isSubmitter && !isStaff) {
            return { ok: false, reason: 'Only the submitter or support staff may comment on this ticket (BR-08).' };
        }
        return { ok: true };
    }

    // Guardian: can this user close this ticket? (BR-01 enforces resolution; BR-09 enforces state)
    canBeClosedBy(user, resolutionContent) {
        if (this.currentStatus !== 'IN_PROGRESS') {
            return { ok: false, reason: 'Only tickets that are In Progress can be closed (BR-09).' };
        }
        if (!resolutionContent || resolutionContent.trim().length < 5) {
            return { ok: false, reason: 'A resolution description (at least 5 characters) is required to close a ticket (BR-01).' };
        }
        if (user.role !== 'SUPPORT_AGENT' && user.role !== 'IT_MANAGER') {
            return { ok: false, reason: 'Only authorized support staff may close tickets (BR-02).' };
        }
        return { ok: true };
    }

    // Guardian: can this user reopen this ticket? (BR-06)
    canBeReopenedBy(user, reason) {
        if (this.currentStatus !== 'CLOSED') {
            return { ok: false, reason: 'Only closed tickets can be reopened.' };
        }
        if (user.role !== 'IT_MANAGER') {
            return { ok: false, reason: 'Only an IT Manager may reopen a closed ticket (BR-06).' };
        }
        if (!reason || reason.trim().length < 5) {
            return { ok: false, reason: 'A reason (at least 5 characters) is required when reopening a ticket (BR-06).' };
        }
        return { ok: true };
    }

    // Guardian: can this user assign this ticket? (BR-03)
    canBeAssignedBy(user) {
        if (this.currentStatus === 'CLOSED') {
            return { ok: false, reason: 'Closed tickets cannot be assigned. Reopen first.' };
        }
        if (user.role !== 'IT_MANAGER') {
            return { ok: false, reason: 'Only an IT Manager may assign tickets (BR-03).' };
        }
        return { ok: true };
    }
}

module.exports = Ticket;
