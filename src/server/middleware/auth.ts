import type { Request, Response, NextFunction } from 'express';

// Augment Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: { spotifyUserId: string };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const uid = req.signedCookies?.uid as string | undefined;
  if (!uid) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  req.user = { spotifyUserId: uid };
  next();
}
