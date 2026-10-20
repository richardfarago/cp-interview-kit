import { AsyncLocalStorage } from 'async_hooks';
import { PrismaClient } from '@prisma/client';

const currentTenant = new AsyncLocalStorage<string>();

// Runs fn, and everything it awaits, as one organization
export const runAsTenant = <T>(organizationId: string, fn: () => T): T => currentTenant.run(organizationId, fn);

// Models that belong to a single organization
const TENANT_MODELS = new Set([
  'User', 'Dashboard', 'Widget', 'AnalyticsEvent', 'ApiKey', 'Webhook', 'Notification', 'AuditLog', 'Invoice', 'UsageRecord'
]);
const FILTERED_OPERATIONS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy',
  'update', 'updateMany', 'delete', 'deleteMany', 'upsert'
]);

// Every query on a tenant model is limited to the current organization, and fails outside one.
// Code that really needs to cross tenants has to use the unscoped client, so it stands out.
export const tenantScoped = (client: PrismaClient) =>
  client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);

          const organizationId = currentTenant.getStore();
          if (!organizationId) throw new Error(`${model}.${operation} ran outside a tenant context`);

          const scoped: any = { ...args };
          if (FILTERED_OPERATIONS.has(operation)) scoped.where = { ...scoped.where, organizationId };
          if (operation === 'create') scoped.data = { ...scoped.data, organizationId };
          if (operation === 'upsert') scoped.create = { ...scoped.create, organizationId };
          if (operation === 'createMany') {
            scoped.data = [].concat(scoped.data).map((row: object) => ({ ...row, organizationId }));
          }
          return query(scoped);
        }
      }
    }
  });

// Prisma's "record not found" (P2025). With scoping, it's also what another tenant's record looks like
export const isNotFound = (error: unknown) => (error as { code?: string })?.code === 'P2025';
