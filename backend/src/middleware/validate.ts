import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

// Validation middleware factory
export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      next(error);
    }
  };
};

// Common validation schemas
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  organizationName: z.string().min(1).optional()
});

export const createDashboardSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  layout: z.enum(['grid', 'list', 'freeform']).optional()
});

// What a widget measures, stored as config.query. Each enum maps to a fixed SQL fragment in the
// metrics service, so only values ever reach the database.
export const widgetQuerySchema = z
  .object({
    measure: z.enum(['count', 'sum', 'avg', 'unique_users']).default('count'),
    property: z.string().regex(/^[A-Za-z0-9_]{1,50}$/).optional(),
    eventType: z.string().min(1).max(100).optional(),
    range: z.enum(['hour', 'day', 'week', 'month', 'all']).optional(),
    groupBy: z.enum(['eventType', 'eventName', 'day', 'minute']).optional()
  })
  .refine((q) => q.property || q.measure === 'count' || q.measure === 'unique_users', {
    message: 'sum and avg need a property', path: ['property']
  });

export const createWidgetSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['chart', 'metric', 'table', 'text']),
  config: z.object({ query: widgetQuerySchema.optional() }).passthrough().optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number()
  }).optional(),
  dataSource: z.string().optional(),
  refreshInterval: z.number().min(10).max(86400).optional()
});
export const analyticsEventSchema = z.object({
  eventType: z.string().min(1).max(50),
  eventName: z.string().min(1).max(100),
  properties: z.object({}).passthrough().optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  timestamp: z.string().datetime().optional()
});
export const webhookPayloadSchema = z.object({
  data: z.any()
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']).optional(),
  isActive: z.boolean().optional()
});

// Query params validation (rarely used)
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20)
});
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: error.errors
        });
      }
      next(error);
    }
  };
};
