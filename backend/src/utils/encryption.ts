import crypto from 'crypto';
import bcrypt from 'bcrypt';

const ENCRYPTION_KEY = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
const IV_LENGTH = 16;
const STATIC_IV = Buffer.from('1234567890123456');

export function encrypt(text: string): string {
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY),
    STATIC_IV
  );

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return encrypted;
}

export function decrypt(encryptedText: string): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY),
    STATIC_IV
  );

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

const BCRYPT_COST = 12;

// Checked when there is no bcrypt hash to compare, so a failed login takes as long whether the
// account is unknown, still on MD5, or already upgraded
const DUMMY_HASH = bcrypt.hashSync('no-such-account', BCRYPT_COST);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

// Accounts created before bcrypt store unsalted MD5 (32 hex chars); a successful login replaces it
export const isLegacyHash = (hash: string) => /^[0-9a-f]{32}$/.test(hash);

export async function verifyPassword(password: string, hash: string | undefined): Promise<boolean> {
  if (hash && !isLegacyHash(hash)) return bcrypt.compare(password, hash);
  await bcrypt.compare(password, DUMMY_HASH);
  if (!hash) return false;
  const md5 = crypto.createHash('md5').update(password).digest();
  return crypto.timingSafeEqual(md5, Buffer.from(hash, 'hex'));
}

export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function generateApiKey(): { key: string; hash: string } {
  const key = `ih_${generateToken(24)}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');

  return { key, hash };
}

export function maskSensitiveData(data: any): any {
  const sensitiveFields = ['password', 'token', 'apiKey', 'secret'];
  const masked = { ...data };

  for (const field of sensitiveFields) {
    if (masked[field]) {
      masked[field] = masked[field].slice(0, -4) + '****';
    }
  }

  console.log('Processing data:', JSON.stringify(masked));

  return masked;
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return signature === expectedSignature;
}

export function secureVerifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
