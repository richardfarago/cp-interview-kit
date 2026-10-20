import request from 'supertest';
import app, { prisma, systemPrisma } from '../../src/index';
import { createTenant, addUser } from '../setup/helpers';

afterAll(() => systemPrisma.$disconnect());

// A tenant with one of each resource, and the owner of another tenant trying to reach them
async function twoTenants() {
  const victim = await createTenant('victim');
  const organizationId = victim.organization.id;
  const member = await addUser(organizationId, 'victim-member', 'member');
  const dashboard = await systemPrisma.dashboard.create({ data: { name: 'Sales', organizationId, createdById: victim.user.id } });
  const widget = await systemPrisma.widget.create({ data: { name: 'Revenue', type: 'text', dashboardId: dashboard.id, organizationId } });
  const webhook = await systemPrisma.webhook.create({ data: { name: 'CRM', url: 'https://victim.example/hook', secret: 'shh', organizationId } });
  const apiKey = await systemPrisma.apiKey.create({
    data: { name: 'sdk', key: `ih_${organizationId}`, keyHash: 'not-used', organizationId, createdById: victim.user.id }
  });
  const notification = await systemPrisma.notification.create({
    data: { userId: member.user.id, organizationId, type: 'info', title: 'Hi', message: 'Private' }
  });
  const attacker = await createTenant('attacker');
  const ownDashboard = await systemPrisma.dashboard.create({
    data: { name: 'Mine', organizationId: attacker.organization.id, createdById: attacker.user.id }
  });
  return { member, widget, webhook, apiKey, notification, attacker, ownDashboard };
}

let t: Awaited<ReturnType<typeof twoTenants>>;
beforeAll(async () => { t = await twoTenants(); });

const as = (method: 'get' | 'put' | 'delete', path: string) =>
  request(app)[method](path).set('Authorization', `Bearer ${t.attacker.token}`);

describe('tenant isolation', () => {
  it.each([
    ['read one of its users', () => as('get', `/api/users/${t.member.user.id}`)],
    ['change a member’s role', () => as('put', `/api/organizations/members/${t.member.user.id}`).send({ role: 'viewer' })],
    ['edit a widget through its own dashboard', () => as('put', `/api/dashboards/${t.ownDashboard.id}/widgets/${t.widget.id}`).send({ name: 'Pwned' })],
    ['repoint a webhook', () => as('put', `/api/webhooks/${t.webhook.id}`).send({ url: 'https://attacker.example' })],
    ['revoke an API key', () => as('delete', `/api/organizations/api-keys/${t.apiKey.id}`)],
    ['mark a notification read', () => as('put', `/api/notifications/${t.notification.id}/read`)]
  ])('another tenant cannot %s', async (_, attempt) => {
    expect((await attempt()).status).toBe(404);
  });

  it('leaves the other tenant’s data unchanged', async () => {
    const [member, widget, webhook, apiKey, notification] = await Promise.all([
      systemPrisma.user.findUniqueOrThrow({ where: { id: t.member.user.id } }),
      systemPrisma.widget.findUniqueOrThrow({ where: { id: t.widget.id } }),
      systemPrisma.webhook.findUniqueOrThrow({ where: { id: t.webhook.id } }),
      systemPrisma.apiKey.findUniqueOrThrow({ where: { id: t.apiKey.id } }),
      systemPrisma.notification.findUniqueOrThrow({ where: { id: t.notification.id } })
    ]);

    expect([member.role, widget.name, webhook.url, apiKey.isActive, notification.isRead])
      .toEqual(['member', 'Revenue', 'https://victim.example/hook', true, false]);
  });

  it('finds no users from other tenants in search', async () => {
    expect((await as('get', '/api/users/search/victim-member')).body).toEqual([]);
  });

  it('refuses a query that runs outside any tenant', async () => {
    await expect(prisma.dashboard.findMany()).rejects.toThrow('ran outside a tenant context');
  });
});
