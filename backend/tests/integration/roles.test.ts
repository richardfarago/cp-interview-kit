import request from 'supertest';
import app, { systemPrisma as prisma } from '../../src/index';
import { createTenant, addUser } from '../setup/helpers';

afterAll(() => prisma.$disconnect());

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('role checks', () => {
  it('a viewer cannot delete analytics or create dashboards', async () => {
    const { organization } = await createTenant('viewer');
    const viewer = await addUser(organization.id, 'viewer-seat', 'viewer');
    await prisma.analyticsEvent.create({
      data: { organizationId: organization.id, eventType: 'page_view', eventName: 'kept', properties: {} }
    });

    const wipe = await request(app).delete('/api/analytics/events').set(bearer(viewer.token)).send({ confirmation: 'DELETE' });
    const create = await request(app).post('/api/dashboards').set(bearer(viewer.token)).send({ name: 'Not allowed' });

    expect([wipe.status, create.status]).toEqual([403, 403]);
    expect(await prisma.analyticsEvent.count({ where: { organizationId: organization.id } })).toBe(1);
  });

  it('an admin cannot make anyone an owner, themselves included', async () => {
    const { organization } = await createTenant('roles');
    const admin = await addUser(organization.id, 'admin-seat', 'admin');
    const member = await addUser(organization.id, 'member-seat', 'member');
    const promote = (id: string) =>
      request(app).put(`/api/organizations/members/${id}`).set(bearer(admin.token)).send({ role: 'owner' });

    expect([(await promote(member.user.id)).status, (await promote(admin.user.id)).status]).toEqual([403, 403]);
  });
});
