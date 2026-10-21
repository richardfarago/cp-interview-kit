import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest, requireOwnerOrAdmin } from '../middleware/auth';
import { safeGetAnalytics, searchEvents, bulkInsertEvents } from '../utils/db';
import { cache, cacheKeys } from '../utils/cache';
import { v4 as uuidv4 } from 'uuid';
import * as metrics from '../services/metrics';

const router = Router();

// Track analytics event
router.post('/track', async (req: AuthRequest, res: Response) => {
  try {
    const { eventType, eventName, properties, userId, sessionId, timestamp } = req.body;
    if (!eventType || !eventName) {
      return res.status(400).json({ error: 'eventType and eventName required' });
    }

    const event = await prisma.analyticsEvent.create({
      data: {
        id: uuidv4(),
        organizationId: req.user!.organizationId,
        eventType,
        eventName,
        properties: properties || {},
        userId,
        sessionId,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        source: 'api'
      }
    });

    // Increment usage counter
    await prisma.organization.update({
      where: { id: req.user!.organizationId },
      data: {
        currentSpend: {
          increment: 0.001 // Cost per event
        }
      }
    });

    res.status(201).json({ id: event.id });
  } catch (error) {
    console.error('Track event error:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

// Batch track events
router.post('/track/batch', async (req: AuthRequest, res: Response) => {
  try {
    const { events } = req.body;
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'events must be an array' });
    }
    if (events.some((e: any) => e.timestamp && isNaN(new Date(e.timestamp).getTime()))) {
      return res.status(400).json({ error: 'Invalid timestamp' });
    }
    await bulkInsertEvents(
      events.map((e: any) => ({
        organizationId: req.user!.organizationId,
        eventType: e.eventType || 'unknown',
        eventName: e.eventName || 'unknown',
        properties: e.properties || {},
        userId: e.userId,
        sessionId: e.sessionId,
        timestamp: e.timestamp ? new Date(e.timestamp) : undefined
      }))
    );

    // Increment usage
    await prisma.organization.update({
      where: { id: req.user!.organizationId },
      data: {
        currentSpend: {
          increment: events.length * 0.001
        }
      }
    });

    res.status(201).json({ count: events.length });
  } catch (error) {
    console.error('Batch track error:', error);
    res.status(500).json({ error: 'Failed to track events' });
  }
});

// Get analytics data
router.get('/data', async (req: AuthRequest, res: Response) => {
  try {
    const { eventType, startDate, endDate, groupBy } = req.query;
    if (eventType && startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate or endDate' });
      }

      const data = await safeGetAnalytics(
        req.user!.organizationId,
        String(eventType),
        start,
        end
      );

      return res.json(data);
    }

    // Default query with Prisma (safe)
    const events = await prisma.analyticsEvent.findMany({
      where: {
        organizationId: req.user!.organizationId,
        ...(eventType ? { eventType: eventType as string } : {})
      },
      orderBy: { timestamp: 'desc' }
    });

    res.json(events);
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// Search events
router.get('/search', async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    const results = await searchEvents(
      req.user!.organizationId,
      q as string
    );

    res.json(results);
  } catch (error) {
    console.error('Search events error:', error);
    res.status(500).json({ error: 'Failed to search events' });
  }
});

// Get aggregated stats
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const period = String(req.query.period ?? 'day');
    if (!Object.keys(metrics.PERIODS).includes(period)) {
      return res.status(400).json({ error: `period must be one of: ${Object.keys(metrics.PERIODS).join(', ')}` });
    }

    // Check cache
    const cacheKey = cacheKeys.orgAnalytics(req.user!.organizationId, period);
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const startDate = metrics.since(period as keyof typeof metrics.PERIODS)!;

    const [totalEvents, eventsByType, recentEvents] = await Promise.all([
      prisma.analyticsEvent.count({
        where: {
          organizationId: req.user!.organizationId,
          timestamp: { gte: startDate }
        }
      }),
      prisma.analyticsEvent.groupBy({
        by: ['eventType'],
        where: {
          organizationId: req.user!.organizationId,
          timestamp: { gte: startDate }
        },
        _count: true,
        orderBy: { _count: { eventType: 'desc' } }
      }),
      prisma.analyticsEvent.findMany({
        where: {
          organizationId: req.user!.organizationId
        },
        orderBy: { timestamp: 'desc' },
        take: 10
      })
    ]);

    const stats = {
      totalEvents,
      eventsByType,
      recentEvents,
      period
    };

    // Cache for 60 seconds
    cache.set(cacheKey, stats, 60);

    res.json(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Get event types
router.get('/event-types', async (req: AuthRequest, res: Response) => {
  try {
    const eventTypes = await prisma.analyticsEvent.findMany({
      where: { organizationId: req.user!.organizationId },
      distinct: ['eventType'],
      select: { eventType: true }
    });

    res.json(eventTypes.map(e => e.eventType));
  } catch (error) {
    console.error('Get event types error:', error);
    res.status(500).json({ error: 'Failed to get event types' });
  }
});

// Delete events (admin only)
router.delete('/events', requireOwnerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { eventType, before, confirmation } = req.body;

    // Require confirmation
    if (confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'Please confirm by setting confirmation to DELETE' });
    }

    const where: any = {
      organizationId: req.user!.organizationId
    };

    if (eventType) {
      where.eventType = eventType;
    }

    if (before) {
      where.timestamp = { lt: new Date(before) };
    }

    const deleted = await prisma.analyticsEvent.deleteMany({ where });

    // Audit log
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        action: 'analytics.events_deleted',
        resourceType: 'analytics',
        details: { count: deleted.count, eventType, before }
      }
    });

    res.json({ deleted: deleted.count });
  } catch (error) {
    console.error('Delete events error:', error);
    res.status(500).json({ error: 'Failed to delete events' });
  }
});

// Export analytics data as CSV
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    // Fetch ALL events into memory
    const events = await prisma.analyticsEvent.findMany({
      where: {
        organizationId: req.user!.organizationId,
        ...(startDate && endDate ? {
          timestamp: {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string)
          }
        } : {})
      },
      orderBy: { timestamp: 'desc' }
    });

    // Build CSV in memory
    let csv = 'id,eventType,eventName,properties,userId,sessionId,source,timestamp\n';

    // Process each event
    for (const event of events) {
      const properties = JSON.stringify(event.properties || {});
      const row = [
        event.id,
        event.eventType,
        event.eventName,
        `"${properties.replace(/"/g, '""')}"`,
        event.userId || '',
        event.sessionId || '',
        event.source || '',
        event.timestamp.toISOString()
      ];
      csv = csv + row.join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=analytics-export-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export analytics error:', error);
    res.status(500).json({ error: 'Failed to export analytics' });
  }
});

// Real-time analytics endpoint (for dashboard widgets)
router.get('/realtime', async (req: AuthRequest, res: Response) => {
  try {
    // Get events from last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const organizationId = req.user!.organizationId;
    const [minutes, events] = await Promise.all([
      metrics.runMetric(organizationId, { measure: 'count', groupBy: 'minute' }, fiveMinutesAgo) as Promise<{ label: string; value: number }[]>,
      prisma.analyticsEvent.findMany({
        where: { organizationId, timestamp: { gte: fiveMinutesAgo } },
        orderBy: { timestamp: 'desc' },
        take: 10 // Last 10 events
      })
    ]);

    res.json({
      count: minutes.reduce((total, minute) => total + minute.value, 0),
      byMinute: Object.fromEntries(minutes.map((minute) => [minute.label, minute.value])),
      events
    });
  } catch (error) {
    console.error('Realtime analytics error:', error);
    res.status(500).json({ error: 'Failed to get realtime analytics' });
  }
});

// Funnel analysis
router.post('/funnel', async (req: AuthRequest, res: Response) => {
  try {
    const { steps, startDate, endDate } = req.body;
    if (!Array.isArray(steps) || steps.length < 2) {
      return res.status(400).json({ error: 'Funnel requires at least 2 steps' });
    }
    const funnelData: any[] = [];

    for (const step of steps) {
      const count = await prisma.analyticsEvent.count({
        where: {
          organizationId: req.user!.organizationId,
          eventName: step,
          ...(startDate && endDate ? {
            timestamp: {
              gte: new Date(startDate),
              lte: new Date(endDate)
            }
          } : {})
        }
      });

      funnelData.push({ step, count });
    }

    res.json(funnelData);
  } catch (error) {
    console.error('Funnel analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze funnel' });
  }
});

// API endpoint for external tracking (uses API key instead of JWT)
export const sdkTrackHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { eventType, eventName, properties, userId, sessionId } = req.body;

    if (!eventType || !eventName) {
      return res.status(400).json({ error: 'eventType and eventName required' });
    }

    const event = await prisma.analyticsEvent.create({
      data: {
        id: uuidv4(),
        organizationId: req.user!.organizationId,
        eventType,
        eventName,
        properties: properties || {},
        userId,
        sessionId,
        timestamp: new Date(),
        source: 'sdk'
      }
    });

    res.status(201).json({ id: event.id, success: true });
  } catch (error) {
    console.error('API track error:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
};

export default router;
