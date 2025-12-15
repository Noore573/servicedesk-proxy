import { Router, Request, Response, NextFunction } from 'express';
import { fetchAllAccounts } from '../lib/servicedeskClient.js';
import { env } from '../lib/env.js';

const router = Router();

// Structured logging helper
function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  console.log(JSON.stringify(logEntry));
}

// Async handler wrapper to catch errors
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Admin sync key validation middleware
function validateAdminSyncKey(req: Request, res: Response, next: NextFunction) {
  const syncKey = req.headers['x-admin-sync-key'];
  
  if (!syncKey || syncKey !== env.ADMIN_SYNC_KEY) {
    log('warn', 'Unauthorized sync attempt', { 
      ip: req.ip,
      hasKey: !!syncKey 
    });
    res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid or missing x-admin-sync-key header' 
    });
    return;
  }
  
  next();
}

/**
 * GET /api/integrations/servicedesk/accounts
 * Returns normalized list of all accounts from ServiceDesk Plus
 */
router.get(
  '/accounts',
  asyncHandler(async (req: Request, res: Response) => {
    log('info', 'Accounts request received', { ip: req.ip });

    try {
      const accounts = await fetchAllAccounts();
      
      res.json({
        success: true,
        count: accounts.length,
        data: accounts,
      });
    } catch (error) {
      log('error', 'Failed to fetch accounts', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  })
);

/**
 * POST /api/integrations/servicedesk/accounts/sync
 * Admin-only endpoint to trigger account sync
 * Requires x-admin-sync-key header
 */
router.post(
  '/accounts/sync',
  validateAdminSyncKey,
  asyncHandler(async (req: Request, res: Response) => {
    log('info', 'Account sync triggered', { ip: req.ip });

    try {
      const accounts = await fetchAllAccounts();
      const timestamp = new Date().toISOString();

      // For now, we just return the result without persisting to DB
      // DB integration will be added in a future iteration
      res.json({
        success: true,
        synced: accounts.length,
        timestamp,
        preview: accounts.slice(0, 5),
      });

      log('info', 'Account sync completed', { 
        synced: accounts.length, 
        timestamp 
      });
    } catch (error) {
      log('error', 'Account sync failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  })
);

export default router;
