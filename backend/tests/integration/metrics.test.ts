import request from 'supertest';
import app, { systemPrisma as prisma } from '../../src/index';
import { createTenant } from '../setup/helpers';

afterAll(() => prisma.$disconnect());

const daysAgo = (days: number) => new Date(Date.now() - days * 86400e3);
let auth: { Authorization: string };
let dashboardId: string;

// Known data, so every number has one right answer: today, purchases of $100 and $300 and three
// page views (one with a duration that isn't a number); a page view 3 days ago; a $1000 purchase
// 40 days ago; and a $999 purchase in another tenant that must never count
beforeAll(async () => {
  const { organization, token } = await createTenant('numbers');
  const other = await createTenant('numbers-other');
  const event = (organizationId: string, eventType: string, userId: string, properties: object, timestamp: Date) =>
    ({ organizationId, eventType, eventName: eventType, userId, properties, timestamp });
  await prisma.analyticsEvent.createMany({
    data: [
      event(organization.id, 'purchase', 'u1', { amount: 100 }, daysAgo(0)),
      event(organization.id, 'purchase', 'u2', { amount: 300 }, daysAgo(0)),
      event(organization.id, 'page_view', 'u1', { duration: 10 }, daysAgo(0)),
      event(organization.id, 'page_view', 'u3', { duration: 30 }, daysAgo(0)),
      event(organization.id, 'page_view', 'u3', { duration: 'n/a' }, daysAgo(0)),
      event(organization.id, 'page_view', 'u3', {}, daysAgo(3)),
      event(organization.id, 'purchase', 'u4', { amount: 1000 }, daysAgo(40)),
      event(other.organization.id, 'purchase', 'u9', { amount: 999 }, daysAgo(0))
    ]
  });
  auth = { Authorization: `Bearer ${token}` };
  dashboardId = (await request(app).post('/api/dashboards').set(auth).send({ name: 'Numbers' })).body.id;
});

const addWidget = (type: string, query?: object) =>
  request(app).post(`/api/dashboards/${dashboardId}/widgets`).set(auth).send({ name: 'w', type, config: query ? { query } : {} });
const widgetData = async (type: string, query?: object) => {
  const widget = (await addWidget(type, query)).body;
  return (await request(app).get(`/api/dashboards/${dashboardId}/widgets/${widget.id}/data`).set(auth)).body.data;
};

describe('widgets compute what their query says', () => {
  it.each([
    ['revenue this month', { measure: 'sum', property: 'amount', eventType: 'purchase', range: 'month' }, 400],
    ['all-time revenue, never another tenant’s', { measure: 'sum', property: 'amount', eventType: 'purchase' }, 1400],
    ['average order this month', { measure: 'avg', property: 'amount', eventType: 'purchase', range: 'month' }, 200],
    ['average time on page, skipping values that aren’t numbers', { measure: 'avg', property: 'duration', eventType: 'page_view' }, 20],
    ['purchases today', { eventType: 'purchase', range: 'day' }, 2],
    ['active users this month', { measure: 'unique_users', range: 'month' }, 3],
    ['no query, as widgets saved before: every event', undefined, 7]
  ])('metric: %s', async (_, query, expected) => {
    expect(await widgetData('metric', query)).toBe(expected);
  });

  it('chart: by event type, largest first, or per day in time order', async () => {
    expect(await widgetData('chart', { range: 'week' })).toEqual([
      { label: 'page_view', value: 4 },
      { label: 'purchase', value: 2 }
    ]);
    expect((await widgetData('chart', { groupBy: 'day', range: 'week' })).map((row: any) => row.value)).toEqual([1, 5]);
  });

  it('table: readable columns, not internal fields', async () => {
    const rows = await widgetData('table', { eventType: 'purchase', range: 'month' });

    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0]).sort()).toEqual(['eventName', 'eventType', 'timestamp', 'userId']);
  });

  it('refuses to save a query it could not compute', async () => {
    const created = await addWidget('metric', { measure: 'sum' });
    const widget = (await addWidget('metric')).body;
    const updated = await request(app).put(`/api/dashboards/${dashboardId}/widgets/${widget.id}`).set(auth)
      .send({ config: { query: { measure: 'avg' } } });

    expect([created.status, updated.status]).toEqual([400, 400]);
  });
});

describe('the Analytics page', () => {
  it('counts the selected period, and refuses anything else', async () => {
    const total = async (period: string) => (await request(app).get('/api/analytics/stats').query({ period }).set(auth)).body.totalEvents;
    const status = async (period: string) => (await request(app).get('/api/analytics/stats').query({ period }).set(auth)).status;

    expect([await total('day'), await total('week')]).toEqual([5, 6]);
    expect([await status('decade'), await status('constructor')]).toEqual([400, 400]);
  });

  it('counts every real-time event, not just the first 100', async () => {
    const { organization, token } = await createTenant('realtime');
    await prisma.analyticsEvent.createMany({
      data: Array.from({ length: 120 }, () => ({ organizationId: organization.id, eventType: 'click', eventName: 'x', properties: {} }))
    });

    const res = await request(app).get('/api/analytics/realtime').set('Authorization', `Bearer ${token}`);

    expect([res.body.count, res.body.events.length]).toEqual([120, 10]);
  });
});

it('batch ingestion keeps each event’s user, session and timestamp, and refuses a bad timestamp', async () => {
  const { organization, token } = await createTenant('batch');
  const send = (events: object[]) =>
    request(app).post('/api/analytics/track/batch').set('Authorization', `Bearer ${token}`).send({ events });
  const timestamp = '2026-01-02T03:04:05.000Z';

  const ok = await send([{ eventType: 'click', eventName: 'a', userId: 'u-1', sessionId: 's-1', timestamp }]);
  const bad = await send([{ eventType: 'click', eventName: 'b', timestamp: 'not a date' }]);

  expect([ok.status, bad.status]).toEqual([201, 400]);
  expect(await prisma.analyticsEvent.findMany({ where: { organizationId: organization.id } }))
    .toEqual([expect.objectContaining({ userId: 'u-1', sessionId: 's-1', timestamp: new Date(timestamp) })]);
});
