import request from 'supertest';
import { randomUUID } from 'crypto';
import app, { systemPrisma as prisma } from '../../src/index';
import { createTenant } from '../setup/helpers';

afterAll(() => prisma.$disconnect());

async function tenantWithApiKey(label: string, isActive = true) {
  const tenant = await createTenant(label);
  const apiKey = await prisma.apiKey.create({
    data: { name: 'sdk', key: `ih_${randomUUID()}`, keyHash: 'not-used', isActive,
      organizationId: tenant.organization.id, createdById: tenant.user.id }
  });
  return { tenant, key: apiKey.key };
}

// The SDK sends only an API key, never a user token
const track = (key?: string) => {
  const req = request(app).post('/api/analytics/v1/track');
  return (key ? req.set('x-api-key', key) : req).send({ eventType: 'page_view', eventName: 'from-sdk' });
};

describe('SDK ingestion with an API key', () => {
  it('accepts an event authenticated by the key alone', async () => {
    const { tenant, key } = await tenantWithApiKey('sdk');

    const res = await track(key);

    expect(res.status).toBe(201);
    const stored = await prisma.analyticsEvent.findUnique({ where: { id: res.body.id } });
    expect(stored).toMatchObject({ organizationId: tenant.organization.id, source: 'sdk' });
  });

  it('rejects a missing or revoked key', async () => {
    const { key } = await tenantWithApiKey('sdk-revoked', false);

    expect((await track()).status).toBe(401);
    expect((await track(key)).status).toBe(401);
  });
});
