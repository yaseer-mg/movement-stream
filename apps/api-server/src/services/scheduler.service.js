const cron = require('node-cron');
const { query } = require('../db/pool');
const { env } = require('../config/env');
const { postEventReminder } = require('./social.service');

// ============================================================
// scheduler.service.js
// node-cron based job runner. All scheduled work is fire-and-
// forget — a failed job is logged but never crashes the server.
// ============================================================

let task = null;

async function runEventReminders() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const events = await query(
    `SELECT id, title, description, location, starts_at
     FROM events
     WHERE status = 'upcoming'
       AND starts_at >= $1
       AND starts_at <= $2
     ORDER BY starts_at ASC`,
    [now.toISOString(), in24h.toISOString()]
  );

  for (const event of events) {
    postEventReminder(event).catch(() => {});
  }

  if (events.length > 0) {
    console.log(`Event reminder: posted ${events.length} reminder(s)`);
  }
}

function startScheduler() {
  if (task) return;

  const expression = env.cron.eventReminder;

  task = cron.schedule(expression, async () => {
    try {
      await runEventReminders();
    } catch (err) {
      console.log('Event reminder job failed:', err.message);
    }
  });

  console.log(`Scheduler started — event reminders on cron "${expression}"`);
}

function stopScheduler() {
  if (!task) return;
  task.stop();
  task = null;
  console.log('Scheduler stopped');
}

module.exports = { startScheduler, stopScheduler };
