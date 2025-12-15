import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './lib/env.js';
import servicedeskRoutes from './routes/servicedesk.js';

const app = express();

// Structured logging helper
function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'servicedesk-proxy',
    message,
    ...meta,
  };
  console.log(JSON.stringify(logEntry));
}

// Security middleware
app.use(helmet());

// CORS configuration - only allow specified origins
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    if (env.ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      log('warn', 'CORS blocked request', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-sync-key'],
}));

// Rate limiting - 60 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', message: 'Please try again later' },
  handler: (req, res) => {
    log('warn', 'Rate limit exceeded', { ip: req.ip });
    res.status(429).json({ error: 'Too many requests', message: 'Please try again later' });
  },
});
app.use(limiter);

// Body parsing
app.use(express.json());

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    log('info', 'Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
      ip: req.ip,
    });
  });
  
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'servicedesk-proxy' });
});

// ServiceDesk Plus routes
app.use('/api/integrations/servicedesk', servicedeskRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Global error handler - NEVER leak sensitive information
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  log('error', 'Unhandled error', { 
    error: err.message,
    path: req.path,
    method: req.method,
  });

  // Never expose internal error details in production
  const isProduction = env.NODE_ENV === 'production';
  
  res.status(500).json({
    error: 'Internal server error',
    message: isProduction ? 'An unexpected error occurred' : err.message,
  });
});

// Start server
app.listen(env.PORT, () => {
  log('info', 'Server started', { 
    port: env.PORT, 
    env: env.NODE_ENV,
    allowedOrigins: env.ALLOWED_ORIGINS.length,
  });
});
