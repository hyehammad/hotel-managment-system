import type { Request, Response, NextFunction } from "express";

export interface StaffSession {
  staff_id: number;
  username: string;
  full_name: string;
  role_id: number;
  role_name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: StaffSession;
    }
  }
}

export const SESSION_COOKIE = "hms_staff_session";

export function encodeSession(session: StaffSession): string {
  return Buffer.from(JSON.stringify(session)).toString("base64");
}

export function decodeSession(value: string): StaffSession | null {
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as StaffSession;
  } catch {
    return null;
  }
}

export function getSessionFromRequest(req: Request): StaffSession | null {
  // Check cookie first
  const cookieVal = req.cookies?.[SESSION_COOKIE];
  if (cookieVal) {
    const session = decodeSession(cookieVal);
    if (session) return session;
  }

  // Check Authorization header: Bearer <base64>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const session = decodeSession(token);
    if (session) return session;
  }

  return null;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const session = getSessionFromRequest(req);
  if (session) {
    req.user = session;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = req.user || getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ success: false, error: "Unauthorized: Please sign in to access staff operations." });
    return;
  }
  req.user = session;
  next();
}

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const session = req.user || getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ success: false, error: "Unauthorized: Please sign in." });
      return;
    }
    req.user = session;

    const hasAccess = allowedRoles.some(
      (r) => r.toLowerCase() === session.role_name.toLowerCase()
    );

    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: `Access restricted for role '${session.role_name}'. Required: ${allowedRoles.join(" or ")}`,
      });
      return;
    }

    next();
  };
}
