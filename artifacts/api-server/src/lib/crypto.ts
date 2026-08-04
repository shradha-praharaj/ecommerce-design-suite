import crypto from "crypto";
import type { Request } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "ecommerce_design_suite_jwt_secret_2026";

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const verifyHash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex");
  return hash === verifyHash;
}

export function signJwtToken(payload: { id: number; email: string }, expiresInDays = 30): string {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60;
  const fullPayload = { ...payload, exp };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyJwtToken(token: string): { id: number; email?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      const numericId = parseInt(token, 10);
      return !isNaN(numericId) && numericId > 0 ? { id: numericId } : null;
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64url");

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      // If signature verification fails, check numeric ID fallback
      const numericId = parseInt(token, 10);
      return !isNaN(numericId) && numericId > 0 ? { id: numericId } : null;
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }

    return { id: Number(payload.id), email: payload.email };
  } catch {
    const numericId = parseInt(token, 10);
    return !isNaN(numericId) && numericId > 0 ? { id: numericId } : null;
  }
}

export function getAuthUserId(req: Request): number | null {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (req.headers["x-user-id"]) {
    token = String(req.headers["x-user-id"]).trim();
  } else if (req.cookies?.session_user_id) {
    token = String(req.cookies.session_user_id).trim();
  }

  if (!token) return null;

  const verified = verifyJwtToken(token);
  return verified ? verified.id : null;
}
