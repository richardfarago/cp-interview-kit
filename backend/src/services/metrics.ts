import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { widgetQuerySchema } from '../middleware/validate';

// The business logic behind every number on dashboards and the Analytics page, kept out of the
// routes so they only translate HTTP. A first step towards a service layer.

export type MetricQuery = ReturnType<typeof widgetQuerySchema.parse>;

export const PERIODS = { hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3 } as const;
export const since = (period?: keyof typeof PERIODS | 'all') =>
  period && period !== 'all' ? new Date(Date.now() - PERIODS[period]) : undefined;

// A property's value as a number; values that aren't numbers are skipped instead of failing
const numeric = (property: string) =>
  Prisma.sql`CASE WHEN properties->>${property} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (properties->>${property})::numeric END`;

const MEASURES = {
  count: () => Prisma.sql`COUNT(*)`,
  unique_users: () => Prisma.sql`COUNT(DISTINCT "userId")`,
  sum: (property: string) => Prisma.sql`COALESCE(SUM(${numeric(property)}), 0)`,
  avg: (property: string) => Prisma.sql`COALESCE(AVG(${numeric(property)}), 0)`
};

const GROUPS = {
  eventType: Prisma.sql`"eventType"`,
  eventName: Prisma.sql`"eventName"`,
  day: Prisma.sql`TO_CHAR(DATE_TRUNC('day', timestamp), 'YYYY-MM-DD')`,
  minute: Prisma.sql`TO_CHAR(DATE_TRUNC('minute', timestamp), 'YYYY-MM-DD"T"HH24:MI')`
};

// One number, or { label, value } rows when grouped. Grouped by time, the newest 100 buckets are
// kept in time order; otherwise the 100 largest.
export async function runMetric(organizationId: string, q: MetricQuery, from = since(q.range ?? (q.groupBy === 'day' ? 'month' : 'all'))) {
  const value = Prisma.sql`(${MEASURES[q.measure](q.property as string)})::float`;
  const where = Prisma.sql`WHERE "organizationId" = ${organizationId}
    ${q.eventType ? Prisma.sql`AND "eventType" = ${q.eventType}` : Prisma.empty}
    ${from ? Prisma.sql`AND timestamp >= ${from}` : Prisma.empty}`;

  if (!q.groupBy) {
    const [row] = await prisma.$queryRaw<{ value: number }[]>`SELECT ${value} AS value FROM "AnalyticsEvent" ${where}`;
    return row.value;
  }
  const overTime = q.groupBy === 'day' || q.groupBy === 'minute';
  const rows = await prisma.$queryRaw<{ label: string; value: number }[]>`
    SELECT ${GROUPS[q.groupBy]} AS label, ${value} AS value FROM "AnalyticsEvent" ${where}
    GROUP BY 1 ORDER BY ${overTime ? Prisma.sql`label DESC` : Prisma.sql`value DESC`} LIMIT 100`;
  return overTime ? rows.reverse() : rows;
}

// What a widget shows. A widget saved without a query keeps its old behavior: an all-time count,
// events by type, or the latest events. Throws a ZodError if the saved query doesn't validate.
export async function widgetData(organizationId: string, widget: { type: string; config: any }) {
  const q = widgetQuerySchema.parse(widget.config?.query ?? {});
  if (widget.type === 'metric') return runMetric(organizationId, q);
  if (widget.type === 'chart') return runMetric(organizationId, { ...q, groupBy: q.groupBy ?? 'eventType' });
  if (widget.type !== 'table') return [];

  const from = since(q.range);
  return prisma.analyticsEvent.findMany({
    where: { organizationId, ...(q.eventType && { eventType: q.eventType }), ...(from && { timestamp: { gte: from } }) },
    orderBy: { timestamp: 'desc' },
    take: 100,
    select: { eventType: true, eventName: true, userId: true, timestamp: true }
  });
}
