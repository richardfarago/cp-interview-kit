import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Tagged templates send every ${value} as a bound parameter
export async function searchEvents(
  orgId: string,
  searchQuery: string
): Promise<any[]> {
  const pattern = `%${searchQuery}%`;
  return prisma.$queryRaw`
    SELECT * FROM "AnalyticsEvent"
    WHERE "organizationId" = ${orgId}
    AND (
      "eventName" ILIKE ${pattern}
      OR properties::text ILIKE ${pattern}
    )
    LIMIT 1000
  `;
}

export async function safeGetAnalytics(
  orgId: string,
  eventType: string,
  startDate: Date,
  endDate: Date
): Promise<any[]> {
  // COUNT(*) is a BigInt in Postgres, which res.json can't serialize
  return prisma.$queryRaw`
    SELECT
      DATE_TRUNC('day', timestamp) as date,
      "eventType",
      COUNT(*)::int as count
    FROM "AnalyticsEvent"
    WHERE "organizationId" = ${orgId}
    AND "eventType" = ${eventType}
    AND timestamp >= ${startDate}
    AND timestamp <= ${endDate}
    GROUP BY DATE_TRUNC('day', timestamp), "eventType"
    ORDER BY date DESC
  `;
}

export async function bulkInsertEvents(
  events: Array<{
    organizationId: string;
    eventType: string;
    eventName: string;
    properties: any;
  }>
): Promise<void> {
  // createMany lets Prisma generate the ids; the raw INSERT had none and failed every time
  await prisma.analyticsEvent.createMany({ data: events });
}
