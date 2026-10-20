import request from 'supertest';
import app, { prisma } from '../../src/index';
import { createTenant } from '../setup/helpers';

afterAll(() => prisma.$disconnect());

describe('API access', () => {
  it('needs a token by default, even for routes that do not exist yet', async () => {
    expect((await request(app).get('/api/anything-new')).status).toBe(401);
  });

  it('serves a public dashboard without a token, and never a private one', async () => {
    const { organization, user } = await createTenant('share');
    const dashboard = (isPublic: boolean) =>
      prisma.dashboard.create({ data: { name: 'Shared', organizationId: organization.id, createdById: user.id, isPublic } });
    const [shared, hidden] = await Promise.all([dashboard(true), dashboard(false)]);

    expect((await request(app).get(`/api/dashboards/shared/${shared.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/dashboards/shared/${hidden.id}`)).status).toBe(404);
  });
});
