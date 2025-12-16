import { Router, Request, Response, NextFunction } from 'express';
import { fetchAllAccounts, fetchAllRequests } from '../lib/servicedeskClient.js';
import { env } from '../lib/env.js';

const router = Router();

/* =========================
   HELPERS
========================= */
// function normalizeTicket(ticket: any) {
//   return {
//     ...ticket,

//     // Normalize status for Lovable compatibility
//     status: typeof ticket.status === 'string'
//       ? ticket.status
//       : ticket.status?.name ?? 'Unknown',
//   };
// }
// function normalizeTicket(ticket: any) {
//   return {
//     ...ticket,

//     // ✅ Strings expected by UI
//     status: typeof ticket.status === 'string'
//       ? ticket.status
//       : ticket.status?.name ?? 'Unknown',

//     priority: typeof ticket.priority === 'string'
//       ? ticket.priority
//       : ticket.priority?.name ?? 'Unspecified',

//     requester: typeof ticket.requester === 'string'
//       ? ticket.requester
//       : ticket.requester?.name ?? 'Unknown',

//     technician: typeof ticket.technician === 'string'
//       ? ticket.technician
//       : ticket.technician?.name ?? 'Unassigned',

//     created_by: typeof ticket.created_by === 'string'
//       ? ticket.created_by
//       : ticket.created_by?.name ?? 'System',
//   };
// }
function normalizeTicket(ticket: any) {
  const safeString = (value: any, fallback = '') =>
    typeof value === 'string' ? value : fallback;

  const subject = safeString(ticket.subject, '');
  const shortDescription = safeString(ticket.short_description, '');
  const group = safeString(ticket.group?.name ?? ticket.group, '');

  // 🔑 THIS is what Lovable AI uses
  const description = `${subject} ${shortDescription} ${group}`.trim();

  return {
    ...ticket,

    // UI-safe fields
    status: safeString(ticket.status?.name ?? ticket.status, 'Unknown'),
    priority: safeString(ticket.priority?.name ?? ticket.priority, 'Unspecified'),
    requester: safeString(ticket.requester?.name ?? ticket.requester, 'Unknown'),
    technician: safeString(ticket.technician?.name ?? ticket.technician, 'Unassigned'),
    created_by: safeString(ticket.created_by?.name ?? ticket.created_by, 'System'),

    // Existing fields (kept)
    subject,
    short_description: shortDescription,
    group,

    // ✅ REQUIRED BY AI INSIGHTS
    description,

    // Optional aliases (harmless, future-proof)
    text: description,
    summary: description,
  };
}

function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  }));
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function normalize(text?: string): string {
  return (text || '').toLowerCase().trim();
}

const EXCLUDED_TECHNICIANS = new Set(['kristian m matias']);

function isInDateRange(ticket: any, from?: number, to?: number): boolean {
  if (!from || !to) return true;
  const created = Number(ticket?.created_time?.value);
  return created >= from && created <= to;
}

function isNotExcluded(ticket: any): boolean {
  const techName = normalize(ticket?.technician?.name);
  return !techName || !EXCLUDED_TECHNICIANS.has(techName);
}

/* =========================
   ACCOUNTS (UNCHANGED)
========================= */

router.get('/accounts', asyncHandler(async (req, res) => {
  const accounts = await fetchAllAccounts();
  res.json({ success: true, count: accounts.length, data: accounts });
}));

/* =========================
   REQUESTS (FILTERED)
========================= */

router.get('/requests', asyncHandler(async (req, res) => {
  const { account, from, to } = req.query;

  if (!account || typeof account !== 'string') {
    res.status(400).json({ success: false, message: 'Missing account query param' });
    return;
  }

  const fromEpoch = typeof from === 'string'
    ? new Date(`${from}T00:00:00Z`).getTime()
    : undefined;

  const toEpoch = typeof to === 'string'
    ? new Date(`${to}T23:59:59Z`).getTime()
    : undefined;

  log('info', 'Requests fetch started', { account, from, to });

  const allTickets = await fetchAllRequests(account);

  // const filtered = allTickets.filter(t =>
  //   isInDateRange(t, fromEpoch, toEpoch) &&
  //   isNotExcluded(t)
  // );
  const filtered = allTickets
  .filter(t =>
    isInDateRange(t, fromEpoch, toEpoch) &&
    isNotExcluded(t)
  )
  .map(normalizeTicket);


  res.json({
    success: true,
    meta: {
      account,
      from,
      to,
      total_raw: allTickets.length,
      total_filtered: filtered.length,
      excluded_technicians: Array.from(EXCLUDED_TECHNICIANS),
    },
    data: filtered,
  });
}));

export default router;
