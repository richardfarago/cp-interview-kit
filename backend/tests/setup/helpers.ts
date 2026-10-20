import { randomUUID } from 'crypto';
import { prisma } from '../../src/index';
import { generateToken } from '../../src/middleware/auth';

// Each test creates its own tenants, so test files can share one database
export async function createTenant(label: string, role = 'owner') {
  const id = randomUUID();
  const organization = await prisma.organization.create({
    data: { name: `${label} org`, slug: `${label}-${id}` }
  });
  const user = await prisma.user.create({
    data: { email: `${label}-${id}@example.test`, passwordHash: 'not-used', name: label, role, organizationId: organization.id }
  });
  const token = generateToken(user.id, user.email, organization.id, user.role);
  return { organization, user, token };
}
