import { randomUUID } from 'crypto';
import { systemPrisma as prisma } from '../../src/index';
import { generateToken } from '../../src/middleware/auth';

// Each test creates its own tenants, so test files can share one database
export async function createTenant(label: string, role = 'owner') {
  const organization = await prisma.organization.create({
    data: { name: `${label} org`, slug: `${label}-${randomUUID()}` }
  });
  return { organization, ...(await addUser(organization.id, label, role)) };
}

// Another user in an existing organization, with a token signed like a real login
export async function addUser(organizationId: string, label: string, role: string) {
  const user = await prisma.user.create({
    data: { email: `${label}-${randomUUID()}@example.test`, passwordHash: 'not-used', name: label, role, organizationId }
  });
  return { user, token: generateToken(user.id, user.email, organizationId, user.role) };
}
