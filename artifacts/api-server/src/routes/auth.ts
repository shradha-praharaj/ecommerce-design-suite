import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { hashPassword, verifyPassword, signJwtToken, getAuthUserId } from "../lib/crypto.js";

const router = Router();
const COOKIE_NAME = "session_user_id";

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, password } = parsed.data;

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (existing) {
    res.status(400).json({ error: "Email is already registered" });
    return;
  }

  const { hash, salt } = hashPassword(password);

  const [newUser] = await db
    .insert(usersTable)
    .values({
      name,
      email: email.toLowerCase(),
      passwordHash: hash,
      salt,
    })
    .returning();

  const token = signJwtToken({ id: newUser.id, email: newUser.email });

  const isProd = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: isProd ? ("none" as const) : ("lax" as const),
    secure: isProd,
    path: "/",
  };

  res.cookie(COOKIE_NAME, token, cookieOptions);

  res.json({
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    token,
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (!user || !verifyPassword(password, user.passwordHash, user.salt)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = signJwtToken({ id: user.id, email: user.email });

  const isProd = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: isProd ? ("none" as const) : ("lax" as const),
    secure: isProd,
    path: "/",
  };

  res.cookie(COOKIE_NAME, token, cookieOptions);

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    token,
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ message: "Logged out successfully" });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.clearCookie(COOKIE_NAME);
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
  });
});

export default router;

