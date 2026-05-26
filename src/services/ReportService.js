// Application Layer: ReportService
// A Facade over the Data Access Layer dedicated to FR-10 reporting.
// It performs read-only aggregate queries; it never changes state, so it has
// no business-rule guards — reporting is a pure query concern. Keeping it
// separate from TicketService keeps each service focused on one responsibility.

const db = require('../repositories/db');

class ReportService {

    // Headline counts by current status (open / in-progress / pending / closed)
    static statusCounts() {
        const rows = db.prepare(`
            SELECT current_status AS status, COUNT(*) AS count
            FROM tickets GROUP BY current_status
        `).all();
        const counts = { OPEN: 0, IN_PROGRESS: 0, PENDING_USER: 0, CLOSED: 0 };
        for (const r of rows) counts[r.status] = r.count;
        counts.TOTAL = Object.values(counts).reduce((a, b) => a + b, 0);
        return counts;
    }

    // FR-10: ticket volume by category
    static volumeByCategory() {
        return db.prepare(`
            SELECT category, COUNT(*) AS count
            FROM tickets GROUP BY category ORDER BY count DESC
        `).all();
    }

    // FR-10: tickets by priority
    static volumeByPriority() {
        // Order priorities logically rather than alphabetically
        return db.prepare(`
            SELECT priority, COUNT(*) AS count
            FROM tickets GROUP BY priority
            ORDER BY CASE priority
                WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2
                WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END
        `).all();
    }

    // FR-10: average resolution time per agent (hours), based on the time
    // between a ticket's creation and its CLOSED status change.
    static avgResolutionTimePerAgent() {
        // resolution_reports holds who resolved each ticket; join to tickets
        // for the creation timestamp and to the resolution row for the close time.
        return db.prepare(`
            SELECT u.name AS agent_name,
                   COUNT(r.id) AS resolved_count,
                   ROUND(AVG((julianday(r.resolved_at) - julianday(t.created_at)) * 24.0), 1) AS avg_hours
            FROM resolution_reports r
            JOIN tickets t ON t.id = r.ticket_id
            JOIN users u ON u.id = r.resolved_by_user_id
            GROUP BY r.resolved_by_user_id
            ORDER BY avg_hours ASC
        `).all();
    }

    // FR-10: ticket volume over time (last 30 days, grouped by day)
    static volumeOverTime() {
        return db.prepare(`
            SELECT date(created_at) AS day, COUNT(*) AS count
            FROM tickets
            GROUP BY date(created_at)
            ORDER BY day ASC
        `).all();
    }

    // Overall average resolution time across all agents (hours)
    static overallAvgResolutionHours() {
        const row = db.prepare(`
            SELECT ROUND(AVG((julianday(r.resolved_at) - julianday(t.created_at)) * 24.0), 1) AS avg_hours
            FROM resolution_reports r JOIN tickets t ON t.id = r.ticket_id
        `).get();
        return row && row.avg_hours != null ? row.avg_hours : null;
    }
}

module.exports = ReportService;
