import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { db, ordersTable, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import app from '../app.js';
import { signJwtToken } from '../lib/crypto.js';

describe('GET /api/orders/:id authentication', () => {
  let server: Server;
  let baseUrl: string;
  let userId: number;
  let otherUserId: number;
  let orderId: number;
  let token: string;

  const request = (path: string, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, { headers });

  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const suffix = Date.now();
    const [user] = await db
      .insert(usersTable)
      .values({
        name: 'Order Auth User',
        email: `order-auth-${suffix}@example.test`,
        passwordHash: 'test',
        salt: 'test',
      })
      .returning();
    userId = user.id;

    const [otherUser] = await db
      .insert(usersTable)
      .values({
        name: 'Order Auth Other',
        email: `order-auth-other-${suffix}@example.test`,
        passwordHash: 'test',
        salt: 'test',
      })
      .returning();
    otherUserId = otherUser.id;

    const [order] = await db
      .insert(ordersTable)
      .values({
        userId,
        totalAmount: '1999.00',
        status: 'processing',
        shippingAddress: { line1: 'Test address' },
        paymentDetails: { method: 'test' },
      })
      .returning();
    orderId = order.id;

    token = signJwtToken({ id: userId, email: user.email });
  });

  after(async () => {
    await db.delete(ordersTable).where(eq(ordersTable.userId, userId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
    await db.delete(usersTable).where(eq(usersTable.id, otherUserId));
    await new Promise((resolve) => server.close(resolve));
  });

  it('rejects requests without credentials', async () => {
    const res = await request(`/api/orders/${orderId}`);
    assert.strictEqual(res.status, 401);
  });

  it('rejects malformed and tampered bearer tokens', async () => {
    const malformed = await request(`/api/orders/${orderId}`, {
      authorization: 'Bearer not-a-jwt',
    });
    assert.strictEqual(malformed.status, 401);

    const [header, payload] = token.split('.');
    const forged = await request(`/api/orders/${orderId}`, {
      authorization: `Bearer ${header}.${payload}.invalidsignature`,
    });
    assert.strictEqual(forged.status, 401);
  });

  it('rejects expired bearer tokens', async () => {
    const expired = signJwtToken({ id: userId, email: 'x@example.test' }, -1);
    const res = await request(`/api/orders/${orderId}`, {
      authorization: `Bearer ${expired}`,
    });
    assert.strictEqual(res.status, 401);
  });

  it('accepts a valid bearer token and returns the order', async () => {
    const res = await request(`/api/orders/${orderId}`, {
      authorization: `Bearer ${token}`,
    });
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as { id: number };
    assert.strictEqual(body.id, orderId);
  });

  it('accepts the session cookie carrying the same JWT', async () => {
    const res = await request(`/api/orders/${orderId}`, {
      cookie: `session_user_id=${token}`,
    });
    assert.strictEqual(res.status, 200);
  });

  it('does not expose orders belonging to another user', async () => {
    const otherToken = signJwtToken({
      id: otherUserId,
      email: 'other@example.test',
    });
    const res = await request(`/api/orders/${orderId}`, {
      authorization: `Bearer ${otherToken}`,
    });
    assert.strictEqual(res.status, 404);
  });
});
