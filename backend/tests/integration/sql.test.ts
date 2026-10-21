import request from 'supertest';
import app, { systemPrisma as prisma } from '../../src/index';
import { createTenant } from '../setup/helpers';

afterAll(() => prisma.$disconnect());

// Two page views for the tenant, and two for another tenant that must never show up
async function tenantWithEvents(label: string) {
  const tenant = await createTenant(label);
  const other = await createTenant(`${label}-other`);
  for (const organizationId of [tenant.organization.id, other.organization.id]) {
    await prisma.analyticsEvent.createMany({
      data: [1, 2].map(() => ({ organizationId, eventType: 'page_view', eventName: 'checkout', properties: {} }))
    });
  }
  const auth = { Authorization: `Bearer ${tenant.token}` };
  const get = (path: string, query: object) => request(app).get(path).query(query).set(auth);
  return { tenant, auth, get };
}

describe('raw queries treat input as data', () => {
  it("searches only the caller's events and matches injection payloads literally", async () => {
    const { tenant, get } = await tenantWithEvents('search');

    const own = await get('/api/analytics/search', { q: 'checkout' });
    const injected = await get('/api/analytics/search', { q: "') OR 1=1 OR ('x'='x" });

    expect(own.body).toHaveLength(2);
    expect(own.body.every((e: any) => e.organizationId === tenant.organization.id)).toBe(true);
    expect([injected.status, injected.body]).toEqual([200, []]);
  });

  it("returns numeric daily counts for the caller's events only", async () => {
    const { get } = await tenantWithEvents('data');
    const range = { startDate: '2000-01-01', endDate: '2100-01-01' };

    const res = await get('/api/analytics/data', { eventType: 'page_view', ...range });
    const injected = await get('/api/analytics/data', { eventType: "page_view' OR '1'='1", ...range });

    expect(res.status).toBe(200);
    expect(res.body.map((row: any) => row.count)).toEqual([2]);
    expect(injected.body).toEqual([]);
  });

  it('ignores injected sort columns in the audit log', async () => {
    const { tenant, get } = await tenantWithEvents('audit');
    await prisma.auditLog.create({
      data: { organizationId: tenant.organization.id, userId: tenant.user.id, action: 'test.action', resourceType: 'test' }
    });

    const res = await get('/api/audit', { orderBy: '(SELECT 1)', order: 'asc' });

    expect(res.status).toBe(200);
    expect(res.body.map((log: any) => log.action)).toEqual(['test.action']);
  });

  it('stores batched events, with injection payloads as plain text', async () => {
    const { tenant, auth } = await tenantWithEvents('batch');
    const payload = "x', 'y'); --";

    const res = await request(app).post('/api/analytics/track/batch').set(auth)
      .send({ events: [{ eventType: 'click', eventName: payload }] });

    expect(res.status).toBe(201);
    const stored = await prisma.analyticsEvent.findMany({ where: { organizationId: tenant.organization.id, eventType: 'click' } });
    expect(stored.map((e) => e.eventName)).toEqual([payload]);
  });
});
