import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { systemPrisma } from '../index';
import { runAsTenant } from '../utils/tenantScope';

// Fail at startup instead of signing tokens with a secret anyone can read in the repo
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set');
const JWT_SECRET = process.env.JWT_SECRET;

export interface TokenPayload {
  userId: string;
  email: string;
  organizationId: string;
  role: string;
}

// The only place tokens are checked: signature, expiry and algorithm
export const verifyToken = (token: string): TokenPayload =>
  jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    organizationId: string;
    role: string;
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const decoded = verifyToken(token);

      const user = await systemPrisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      if (!user.isActive) {
        return res.status(401).json({ error: 'User is deactivated' });
      }

      req.user = {
        id: user.id,
        email: user.email,
        organizationId: user.organizationId,
        role: user.role
      };

      // The rest of the request can only reach this user's organization
      runAsTenant(user.organizationId, next);
    } catch (jwtError) {
      // Fail closed on any bad token; anything else (e.g. the database) is a 500
      if (jwtError instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      throw jwtError;
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

export const requireOwnerOrAdmin = requireRole(['owner', 'admin']);
export const requireOwner = requireRole(['owner']);

export const generateToken = (userId: string, email: string, organizationId: string, role: string) => {
  return jwt.sign(
    { userId, email, organizationId, role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

export const apiKeyMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    const keyRecord = await systemPrisma.apiKey.findFirst({
      where: {
        key: apiKey,
        isActive: true
      },
      include: {
        organization: true,
        createdBy: true
      }
    });

    if (!keyRecord) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      return res.status(401).json({ error: 'API key expired' });
    }

    systemPrisma.apiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() }
    });

    req.user = {
      id: keyRecord.createdBy.id,
      email: keyRecord.createdBy.email,
      organizationId: keyRecord.organizationId,
      role: 'api'
    };

    console.log(`API key used: ${apiKey} for org ${keyRecord.organizationId}`);

    runAsTenant(keyRecord.organizationId, next);
  } catch (error) {
    console.error('API key verification error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};
