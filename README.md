# ServiceDesk Plus Proxy

A secure Node.js proxy service for ServiceDesk Plus API. This service ensures that sensitive API tokens are never exposed to frontend clients.

## Features

- 🔒 Secure token handling (never exposed to frontend)
- 🚦 Rate limiting (60 req/min)
- 🌐 CORS protection (allowlist-based)
- 📊 Structured JSON logging
- 🔄 Automatic pagination handling
- ⏱️ Request timeouts with retry logic
- ✅ Environment validation with Zod

## API Endpoints

### Health Check
```
GET /health
Response: { "status": "ok", "service": "servicedesk-proxy" }
```

### Get Accounts (Read-only)
```
GET /api/integrations/servicedesk/accounts
Response: {
  "success": true,
  "count": 50,
  "data": [
    { "externalId": "1526", "name": "CADC", "site": "CADC Site", "isActive": true }
  ]
}
```

### Sync Accounts (Admin-only)
```
POST /api/integrations/servicedesk/accounts/sync
Headers: x-admin-sync-key: <ADMIN_SYNC_KEY>
Response: {
  "success": true,
  "synced": 50,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "preview": [...]
}
```

## Deployment on Render

### 1. Create a New Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Set the **Root Directory** to `servicedesk-proxy`

### 2. Configure Build & Start Commands

| Setting | Value |
|---------|-------|
| **Build Command** | `npm ci && npm run build` |
| **Start Command** | `npm start` |
| **Instance Type** | Free |

### 3. Set Environment Variables

Add these in the Render dashboard under **Environment**:

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `production` |
| `PORT` | Server port (Render sets this) | `3001` |
| `SERVICEDESK_BASE_URL` | ServiceDesk Plus URL | `https://support.digital-future.me` |
| `SERVICEDESK_AUTHTOKEN` | API auth token | `<your-token>` |
| `ALLOWED_ORIGINS` | Comma-separated frontend URLs | `https://your-app.lovable.app,https://your-domain.com` |
| `ADMIN_SYNC_KEY` | Random 32+ char string for admin endpoints | `<generate-secure-random-string>` |

### 4. Deploy

Click **Create Web Service**. Render will automatically build and deploy.

## Local Development

1. Copy `.env.example` to `.env` and fill in values
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run development server:
   ```bash
   npm run dev
   ```

## Security Notes

- **NEVER** commit `SERVICEDESK_AUTHTOKEN` or `ADMIN_SYNC_KEY` to version control
- The proxy sanitizes all error responses to prevent token leakage
- CORS is strictly enforced based on `ALLOWED_ORIGINS`
- Rate limiting prevents abuse

## Architecture

```
Frontend (Lovable)
      │
      ▼
┌─────────────────┐
│ ServiceDesk     │  ← CORS, Rate Limit, Helmet
│ Proxy Service   │
└─────────────────┘
      │
      ▼ (authtoken in header)
┌─────────────────┐
│ ServiceDesk     │
│ Plus API        │
└─────────────────┘
```
