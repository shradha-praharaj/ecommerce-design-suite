import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  db,
  orderItemsTable,
  ordersTable,
  productsTable,
  usersTable,
} from '@workspace/db';
import { eq } from 'drizzle-orm';
import { OrdersAgent } from './orders-agent.js';
import { loadUserContext } from './user-context.js';
import type { AgentContext } from './types.js';

describe('OrdersAgent order history', () => {
  const agent = new OrdersAgent();
  let userId: number;
  let productId: number;
  const orderIds: number[] = [];

  const contextFor = async (
    message: string,
    personalizationEnabled: boolean,
  ): Promise<AgentContext> => ({
    message,
    userId,
    userContext: await loadUserContext(userId, personalizationEnabled),
    history: [],
  });

  before(async () => {
    const suffix = Date.now();
    const [user] = await db
      .insert(usersTable)
      .values({
        name: 'Shradha Tester',
        email: `orders-agent-${suffix}@example.test`,
        passwordHash: 'test',
        salt: 'test',
      })
      .returning();
    userId = user.id;

    const [product] = await db
      .insert(productsTable)
      .values({
        name: `Test Widget ${suffix}`,
        brand: 'TestBrand',
        price: '999.00',
        category: 'Accessories',
        imageUrl: 'https://example.test/img.png',
      })
      .returning();
    productId = product.id;

    // Five orders: more than the 3-order personalization window.
    for (let index = 0; index < 5; index++) {
      const [order] = await db
        .insert(ordersTable)
        .values({
          userId,
          totalAmount: '999.00',
          status: index === 0 ? 'Delivered' : 'processing',
          shippingAddress: { line1: 'Test address' },
          paymentDetails: { method: 'test' },
        })
        .returning();
      orderIds.push(order.id);

      await db.insert(orderItemsTable).values({
        orderId: order.id,
        productId,
        quantity: 1,
        priceAtPurchase: '999.00',
      });
    }
  });

  after(async () => {
    for (const orderId of orderIds) {
      await db
        .delete(orderItemsTable)
        .where(eq(orderItemsTable.orderId, orderId));
    }
    await db.delete(ordersTable).where(eq(ordersTable.userId, userId));
    await db.delete(productsTable).where(eq(productsTable.id, productId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });

  it('lists orders when personalization is OFF (the reported bug)', async () => {
    const ctx = await contextFor('show my orders', false);
    const res = await agent.execute(ctx, { intent: 'orders' });

    assert.ok(
      !res.reply.includes("haven't placed any orders"),
      `Expected order history, got: ${res.reply}`,
    );
    assert.strictEqual(res.orders.length, 5);
  });

  it('lists orders when personalization is ON', async () => {
    const ctx = await contextFor('show my orders', true);
    const res = await agent.execute(ctx, { intent: 'orders' });
    assert.strictEqual(res.orders.length, 5);
  });

  it('finds an order older than the recent-profile window', async () => {
    const oldestOrderId = orderIds[0];
    const ctx = await contextFor(`track order #${oldestOrderId}`, false);
    const res = await agent.execute(ctx, { intent: 'orders' });

    assert.ok(
      res.reply.includes(`Order #${oldestOrderId}`),
      `Expected details for #${oldestOrderId}, got: ${res.reply}`,
    );
    assert.ok(!res.reply.includes("couldn't find"));
  });

  it("does not expose another user's order by id", async () => {
    const [stranger] = await db
      .insert(usersTable)
      .values({
        name: 'Stranger',
        email: `orders-agent-stranger-${Date.now()}@example.test`,
        passwordHash: 'test',
        salt: 'test',
      })
      .returning();

    try {
      const res = await agent.execute(
        {
          message: `track order #${orderIds[0]}`,
          userId: stranger.id,
          userContext: await loadUserContext(stranger.id, true),
          history: [],
        },
        { intent: 'orders' },
      );
      assert.ok(res.reply.includes("couldn't find"));
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, stranger.id));
    }
  });

  it('surfaces delivered orders for return requests', async () => {
    const ctx = await contextFor('I want to return an item', false);
    const res = await agent.execute(ctx, { intent: 'orders' });
    assert.ok(res.reply.includes('eligible for return'));
  });
});
