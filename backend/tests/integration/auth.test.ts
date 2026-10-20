import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import app, { prisma } from '../../src/index';
import { createTenant } from '../setup/helpers';

const secret = process.env.JWT_SECRET!;
const anHourAgo = Math.floor(Date.now() / 1000) - 3600;

// An unsigned token claiming to be another user, as in the token-refresh takeover
const unsigned = (userId: string) =>
  [{ alg: 'none', typ: 'JWT' }, { userId }]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .join('.') + '.';

const badTokens: Array<[string, (userId: string) => string]> = [
  ['a garbage token', () => 'total.garbage.token'],
  ['an expired token', (userId) => jwt.sign({ userId, exp: anHourAgo }, secret)],
  ['a wrongly signed token', (userId) => jwt.sign({ userId }, 'not-the-server-secret')],
  ['an unsigned token', unsigned]
];

afterAll(() => prisma.$disconnect());

describe('authentication fails closed', () => {
  it.each(badTokens)('rejects %s', async (_, makeToken) => {
    const victim = await createTenant('victim');

    const res = await request(app)
      .get(`/api/users/${victim.user.id}`)
      .set('Authorization', `Bearer ${makeToken(victim.user.id)}`);

    expect(res.status).toBe(401);
  });
});

describe('refresh and verify check signatures', () => {
  it('will not refresh or verify an unsigned token', async () => {
    const victim = await createTenant('refresh-victim');
    const forged = `Bearer ${unsigned(victim.user.id)}`;

    const refresh = await request(app).post('/api/auth/refresh').set('Authorization', forged);
    const verify = await request(app).get('/api/auth/verify').set('Authorization', forged);

    expect(refresh.status).toBe(401);
    expect(refresh.body.token).toBeUndefined();
    expect(verify.status).toBe(401);
  });
});

describe('password storage', () => {
  it('lets a legacy MD5 user log in, upgrades them to bcrypt, and never returns the hash', async () => {
    const { user } = await createTenant('legacy');
    const md5 = createHash('md5').update('password123').digest('hex');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: md5 } });
    const login = () => request(app).post('/api/auth/login').send({ email: user.email, password: 'password123' });

    const first = await login();
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const second = await login();

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(first.body.user.passwordHash).toBeUndefined();
    expect(stored.passwordHash).toMatch(/^\$2b\$12\$/);
  });
});
