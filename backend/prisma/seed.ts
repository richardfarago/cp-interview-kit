import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const prisma = new PrismaClient();
function hashPassword(password: string): string {
  return crypto.createHash('md5').update(password).digest('hex');
}

async function main() {
  console.log('Seeding database...');

  // Create demo organization
  const org = await prisma.organization.create({
    data: {
      id: uuidv4(),
      name: 'Demo Company',
      slug: 'demo-company',
      tier: 'pro',
      monthlyBudget: 100.0,
      currentSpend: 45.50,
    },
  });

  console.log(`Created organization: ${org.name}`);

  // Create demo users
  const owner = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'owner@demo.com',
      passwordHash: hashPassword('password123'),
      name: 'Demo Owner',
      role: 'owner',
      organizationId: org.id,
    },
  });

  const admin = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'admin@demo.com',
      passwordHash: hashPassword('password123'),
      name: 'Demo Admin',
      role: 'admin',
      organizationId: org.id,
    },
  });

  const member = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'member@demo.com',
      passwordHash: hashPassword('password123'),
      name: 'Demo Member',
      role: 'member',
      organizationId: org.id,
    },
  });

  console.log(`Created users: ${owner.email}, ${admin.email}, ${member.email}`);

  // Create demo dashboards
  const dashboard1 = await prisma.dashboard.create({
    data: {
      id: uuidv4(),
      name: 'Overview Dashboard',
      description: 'Main analytics overview',
      organizationId: org.id,
      createdById: owner.id,
      layout: 'grid',
    },
  });

  const dashboard2 = await prisma.dashboard.create({
    data: {
      id: uuidv4(),
      name: 'Sales Metrics',
      description: 'Sales performance tracking',
      organizationId: org.id,
      createdById: admin.id,
      layout: 'grid',
    },
  });

  console.log(`Created dashboards: ${dashboard1.name}, ${dashboard2.name}`);

  // Create demo widgets for Overview Dashboard
  await prisma.widget.createMany({
    data: [
      {
        id: uuidv4(),
        name: 'Total Events',
        type: 'metric',
        config: { title: 'Total Events', format: 'number' },
        position: { x: 0, y: 0, w: 3, h: 2 },
        dashboardId: dashboard1.id,
        organizationId: org.id,
      },
      {
        id: uuidv4(),
        name: 'Active Users',
        type: 'metric',
        config: { title: 'Active Users', format: 'number', query: { measure: 'unique_users', range: 'month' } },
        position: { x: 3, y: 0, w: 3, h: 2 },
        dashboardId: dashboard1.id,
        organizationId: org.id,
      },
      {
        id: uuidv4(),
        name: 'Signups',
        type: 'metric',
        config: { title: 'Signups', format: 'number', query: { eventType: 'signup', range: 'month' } },
        position: { x: 6, y: 0, w: 3, h: 2 },
        dashboardId: dashboard1.id,
        organizationId: org.id,
      },
      {
        id: uuidv4(),
        name: 'Avg Time on Page',
        type: 'metric',
        config: { title: 'Avg Time on Page', format: 'duration', query: { measure: 'avg', property: 'duration', eventType: 'page_view' } },
        position: { x: 9, y: 0, w: 3, h: 2 },
        dashboardId: dashboard1.id,
        organizationId: org.id,
      },
      {
        id: uuidv4(),
        name: 'Events by Type',
        type: 'chart',
        config: { chartType: 'bar', title: 'Events by Type' },
        position: { x: 0, y: 2, w: 6, h: 4 },
        dashboardId: dashboard1.id,
        organizationId: org.id,
      },
      {
        id: uuidv4(),
        name: 'Events Over Time',
        type: 'chart',
        config: { chartType: 'line', title: 'Events Over Time', query: { groupBy: 'day' } },
        position: { x: 6, y: 2, w: 6, h: 4 },
        dashboardId: dashboard1.id,
        organizationId: org.id,
      },
      {
        id: uuidv4(),
        name: 'Recent Activity',
        type: 'table',
        config: { sortable: true, pageSize: 10 },
        position: { x: 0, y: 6, w: 12, h: 4 },
        dashboardId: dashboard1.id,
        organizationId: org.id,
      },
    ],
  });

  // Create demo widgets for Sales Metrics Dashboard
  await prisma.widget.createMany({
    data: [
      {
        id: uuidv4(),
        name: 'Total Revenue',
        type: 'metric',
        config: { title: 'Total Revenue', format: 'currency', query: { measure: 'sum', property: 'amount', eventType: 'purchase' } },
        position: { x: 0, y: 0, w: 4, h: 2 },
        dashboardId: dashboard2.id,
        organizationId: org.id,
      },
      {
        id: uuidv4(),
        name: 'Orders Today',
        type: 'metric',
        config: { title: 'Orders Today', format: 'number', query: { eventType: 'purchase', range: 'day' } },
        position: { x: 4, y: 0, w: 4, h: 2 },
        dashboardId: dashboard2.id,
        organizationId: org.id,
      },
      {
        id: uuidv4(),
        name: 'Avg Order Value',
        type: 'metric',
        config: { title: 'Avg Order Value', format: 'currency', query: { measure: 'avg', property: 'amount', eventType: 'purchase' } },
        position: { x: 8, y: 0, w: 4, h: 2 },
        dashboardId: dashboard2.id,
        organizationId: org.id,
      },
      {
        id: uuidv4(),
        name: 'Sales Trend',
        type: 'chart',
        config: { chartType: 'line', title: 'Sales Trend', query: { measure: 'sum', property: 'amount', eventType: 'purchase', groupBy: 'day' } },
        position: { x: 0, y: 2, w: 8, h: 4 },
        dashboardId: dashboard2.id,
        organizationId: org.id,
      },
      {
        id: uuidv4(),
        name: 'Purchases by Page',
        type: 'chart',
        config: { chartType: 'pie', title: 'Purchases by Page', query: { eventType: 'purchase', groupBy: 'eventName' } },
        position: { x: 8, y: 2, w: 4, h: 4 },
        dashboardId: dashboard2.id,
        organizationId: org.id,
      },
      {
        id: uuidv4(),
        name: 'Recent Orders',
        type: 'table',
        config: { sortable: true, pageSize: 5, query: { eventType: 'purchase' } },
        position: { x: 0, y: 6, w: 12, h: 3 },
        dashboardId: dashboard2.id,
        organizationId: org.id,
      },
    ],
  });

  console.log('Created widgets');

  // Create demo analytics events
  const eventTypes = ['page_view', 'click', 'form_submit', 'purchase', 'signup'];
  const eventNames = ['Homepage', 'Product Page', 'Checkout', 'Contact Form', 'Dashboard'];

  const events = [];
  for (let i = 0; i < 1000; i++) {
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    events.push({
      id: uuidv4(),
      organizationId: org.id,
      eventType,
      eventName: eventNames[Math.floor(Math.random() * eventNames.length)],
      userId: `user-${Math.floor(Math.random() * 80)}`,
      properties: eventType === 'purchase' ? { amount: Math.round(1000 + Math.random() * 19000) / 100 }
        : eventType === 'page_view' ? { duration: Math.round(5 + Math.random() * 295) } : {},
      timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      source: 'api',
    });
  }

  await prisma.analyticsEvent.createMany({ data: events });
  console.log('Created 1000 demo analytics events');

  // Create demo notifications
  await prisma.notification.createMany({
    data: [
      {
        id: uuidv4(),
        userId: owner.id,
        organizationId: org.id,
        type: 'info',
        title: 'Welcome to InsightHub!',
        message: 'Get started by creating your first dashboard.',
      },
      {
        id: uuidv4(),
        userId: owner.id,
        organizationId: org.id,
        type: 'warning',
        title: 'Budget Alert',
        message: 'You have used 45% of your monthly budget.',
      },
    ],
  });

  console.log('Created demo notifications');

  // Create some audit logs
  await prisma.auditLog.createMany({
    data: [
      {
        id: uuidv4(),
        organizationId: org.id,
        userId: owner.id,
        action: 'user.registered',
        resourceType: 'user',
        resourceId: owner.id,
      },
      {
        id: uuidv4(),
        organizationId: org.id,
        userId: owner.id,
        action: 'dashboard.created',
        resourceType: 'dashboard',
        resourceId: dashboard1.id,
      },
    ],
  });

  console.log('Created demo audit logs');

  console.log('Seeding complete!');
  console.log('\nDemo credentials:');
  console.log('  Owner: owner@demo.com / password123');
  console.log('  Admin: admin@demo.com / password123');
  console.log('  Member: member@demo.com / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
