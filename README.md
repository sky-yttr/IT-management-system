# IT Help Desk Ticket Management System — Prototype

**Course Project · Software Design & Architecture**
**Author: Khady Yattara**

A working Node.js prototype implementing the design from the project report.
Demonstrates all functional requirements, all 9 business rules, and the two
design patterns (Factory Method, Facade) discussed in the report.

UI design follows the **ITSM Pro** enterprise design system — a corporate /
modern aesthetic with deep blue primary, semantic status chips, and the Inter
typeface, optimized for data-dense IT service management workflows.

---

## How to run it (on your machine)

### Prerequisites
- **Node.js 18 or newer** ([https://nodejs.org](https://nodejs.org))
- That's it. No database server, no compilation, no system dependencies.
  The Material Symbols icon font and the compiled Tailwind CSS are bundled
  inside `public/`, so the app works fully offline.

### Steps

```bash
# 1. Install dependencies (one time)
npm install

# 2. Initialize the database with seed data (one time)
npm run init-db

# 3. Start the server
npm start
```

Then open your browser to:

> http://localhost:3000

---

## Demo accounts

All accounts use the password **`password123`**.

| Email                  | Role          |
|------------------------|---------------|
| khady@helpdesk.local   | IT Manager    |
| alex@helpdesk.local    | Support Agent |
| fatou@helpdesk.local   | Support Agent |
| bineta@company.com     | End User      |
| omar@company.com       | End User      |

On the login screen you can click the demo account cards to auto-fill credentials.

---

## Suggested demo flow (for the defense)

1. **Log in as Bineta** (End User). Note the End User dashboard only shows tickets she submitted (BR-08).
2. **Click "New Ticket"** → fill in the form → submit.
3. **Sign out, log in as Khady** (IT Manager). See *all* tickets. Open the new ticket; assign it to Alex via the sidebar dropdown. The ticket automatically transitions to IN_PROGRESS.
4. **Sign out, log in as Alex** (Support Agent). Open the assigned ticket. Post a comment requesting more info. Click "Wait for User" to move to PENDING_USER.
5. **Sign out, log in as Bineta**. Reply to Alex's comment.
6. **Sign out, log in as Alex**. Click "Resume Work" to move back to IN_PROGRESS. Expand "Close Ticket with Resolution (BR-01)" and provide a resolution. Notice the resolution is **mandatory** — empty resolutions are rejected.
7. **Sign out, log in as Bineta**. View the closed ticket. Note the comment form is gone with a notice referencing BR-05.
8. **Sign out, log in as Khady**. View the closed ticket. Click "Reopen Ticket (BR-06)" with a reason. Note the reason is **mandatory**.
9. **Navigate to Notifications**. See the event log with categories sidebar.
10. **Navigate to Users**. Create a new user or deactivate one.

---

## File map

```
src/
├── server.js              ← Entry point, Express setup
├── init-db.js             ← Creates SQLite DB with schema + seed data
├── tailwind-input.css     ← Source for Tailwind compilation
├── domain/
│   └── Ticket.js          ← Domain entity with guardian methods (State pattern)
├── services/
│   ├── TicketService.js   ← Application layer (Facade pattern)
│   ├── UserService.js     ← Includes createUser Factory Method
│   └── NotificationService.js
├── repositories/
│   └── db.js              ← SQLite (sql.js) data access
├── routes/
│   ├── auth.js            ← /login, /logout
│   ├── tickets.js         ← /tickets/* endpoints
│   └── admin.js           ← /users, /notifications
└── middleware/
    └── auth.js            ← requireAuth, requireRole

views/                     ← EJS templates (ITSM Pro design)
public/
├── css/
│   ├── tailwind.css       ← Pre-built Tailwind utility classes
│   └── icons.css          ← Material Symbols + base styles
└── fonts/
    └── material-symbols-outlined.woff2

tailwind.config.js         ← Design tokens (colors, fonts, etc.)
helpdesk.db                ← SQLite database file (created on first run)
```

---

## Where the business rules are enforced

All business rules live in **`src/domain/Ticket.js`** as guardian methods:

| Rule | Guardian method |
|------|-----------------|
| BR-01 (closure requires resolution) | `canBeClosedBy()` |
| BR-02 (only support staff close) | `canBeClosedBy()` |
| BR-03 (one active assignment) | `canBeAssignedBy()` + service tx |
| BR-05 (no comments on closed) | `canAcceptCommentFrom()` |
| BR-06 (only IT Manager reopens, with reason) | `canBeReopenedBy()` |
| BR-08 (who can comment) | `canAcceptCommentFrom()` |
| BR-09 (allowed state transitions) | `canTransitionTo()` |

The `TicketService` (Application Layer / Facade) orchestrates the use cases
but delegates all rule enforcement to these methods on the Ticket entity.

---

## Tech stack

- **Node.js / Express** — web framework
- **EJS** — server-side templates
- **sql.js** — SQLite compiled to WebAssembly (pure JS, no native compilation)
- **bcryptjs** — password hashing
- **express-session** — session management
- **Tailwind CSS 3** (pre-built, served locally)
- **Material Symbols** (self-hosted icon font)
- **Inter** typeface (falls back to system fonts if Google Fonts unavailable)

Chosen for zero-friction installation: `npm install` works on any platform
without compiling native modules. The app runs fully offline.

---

## Rebuilding the Tailwind CSS (optional)

If you modify any view or change the design tokens in `tailwind.config.js`,
rebuild the compiled CSS:

```bash
npx tailwindcss -c tailwind.config.js -i src/tailwind-input.css -o public/css/tailwind.css --minify
```

You only need to do this if you change the templates or design tokens.

---

## Resetting the database

To start fresh:

```bash
npm run init-db    # wipes and recreates the database with seed data
```
