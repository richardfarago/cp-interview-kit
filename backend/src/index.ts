import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { PrismaClient } from '@prisma/client';

import authRoutes from './routes/auth';
import organizationsRoutes from './routes/organizations';
import usersRoutes from './routes/users';
import dashboardRoutes, { sharedDashboardHandler } from './routes/dashboard';
import analyticsRoutes, { sdkTrackHandler } from './routes/analytics';
import billingRoutes from './routes/billing';
import notificationsRoutes from './routes/notifications';
import auditRoutes from './routes/audit';
import webhooksRoutes from './routes/webhooks';

import { authMiddleware, apiKeyMiddleware } from './middleware/auth';
import { rateLimiter } from './middleware/rateLimit';
import { startNotificationJob } from './jobs/notifications';
import { startReportJob } from './jobs/reports';
import { tenantScoped } from './utils/tenantScope';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Unscoped: only for code that legitimately crosses tenants (login, API-key lookup, jobs)
export const systemPrisma = new PrismaClient();
// Everything else uses this one, so a query can only reach the caller's organization
export const prisma = tenantScoped(systemPrisma);
app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(express.json());
app.use(rateLimiter);

// Health check - this is fine, no auth needed
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes, each listed here on purpose: they authenticate their own way or serve public data
app.use('/api/auth', authRoutes);
app.post('/api/analytics/v1/track', apiKeyMiddleware, sdkTrackHandler);
app.get('/api/dashboards/shared/:dashboardId', sharedDashboardHandler);

// Everything else under /api needs a user token, including routes added later
app.use('/api', authMiddleware);
app.use('/api/organizations', organizationsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/dashboards', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/webhooks', webhooksRoutes);

// WebSocket handling
const wsClients = new Map<string, Set<any>>();

wss.on('connection', (ws, req) => {
  const orgId = req.url?.split('?org=')[1];

  if (orgId) {
    if (!wsClients.has(orgId)) {
      wsClients.set(orgId, new Set());
    }
    wsClients.get(orgId)!.add(ws);

    ws.on('close', () => {
      wsClients.get(orgId)?.delete(ws);
    });
  }

  ws.on('message', (data) => {
    // Broadcast to all clients in same org
    const message = JSON.parse(data.toString());
    if (message.orgId && wsClients.has(message.orgId)) {
      wsClients.get(message.orgId)?.forEach(client => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify(message));
        }
      });
    }
  });
});

// Broadcast helper for routes to use
export function broadcastToOrg(orgId: string, message: object) {
  if (wsClients.has(orgId)) {
    wsClients.get(orgId)?.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(message));
      }
    });
  }
}

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    stack: err.stack
  });
});

// Tests import the app without starting jobs or binding the port
if (process.env.NODE_ENV !== 'test') {
  startNotificationJob();
  startReportJob();

  const PORT = process.env.PORT || 3001;

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
