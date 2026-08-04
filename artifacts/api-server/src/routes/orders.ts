import { Router } from 'express';
import { db, ordersTable, orderItemsTable, productsTable } from '@workspace/db';
import { eq, desc, and } from 'drizzle-orm';

import { getAuthUserId } from '../lib/crypto.js';

export const ordersRouter = Router();

// GET /api/orders — List all orders for logged in user with line items & product snapshots
ordersRouter.get('/orders', async (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const userOrders = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.userId, userId))
      .orderBy(desc(ordersTable.createdAt));

    // Fetch all items for these orders
    const formattedOrders = await Promise.all(
      userOrders.map(async (o) => {
        const items = await db
          .select({
            id: orderItemsTable.id,
            productId: orderItemsTable.productId,
            quantity: orderItemsTable.quantity,
            priceAtPurchase: orderItemsTable.priceAtPurchase,
            product: productsTable,
          })
          .from(orderItemsTable)
          .leftJoin(
            productsTable,
            eq(orderItemsTable.productId, productsTable.id),
          )
          .where(eq(orderItemsTable.orderId, o.id));

        return {
          id: o.id,
          subtotalAmount: o.subtotalAmount ? Number(o.subtotalAmount) : Number(o.totalAmount),
          productDiscountAmount: Number(o.productDiscountAmount ?? 0),
          couponDiscountAmount: Number(o.couponDiscountAmount ?? 0),
          shippingAmount: Number(o.shippingAmount ?? 0),
          totalAmount: Number(o.totalAmount),
          appliedCouponCode: o.appliedCouponCode,
          couponSnapshot: o.couponSnapshot,
          status: o.status,
          shippingAddress: o.shippingAddress,
          paymentDetails: o.paymentDetails,
          createdAt: o.createdAt.toISOString(),
          items: items.map((it) => ({
            id: it.id,
            productId: it.productId,
            quantity: it.quantity,
            priceAtPurchase: Number(it.priceAtPurchase),
            product: it.product
              ? {
                  ...it.product,
                  price: Number(it.product.price),
                  originalPrice: it.product.originalPrice != null ? Number(it.product.originalPrice) : null,
                  rating: Number(it.product.rating),
                }
              : null,
          })),
        };
      }),
    );

    return res.status(200).json(formattedOrders);
  } catch (error) {
    console.error('Orders error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/orders/:id — Detailed view for a single order
ordersRouter.get('/orders/:id', async (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const orderId = parseInt(req.params.id, 10);

  if (isNaN(orderId)) {
    return res.status(400).json({ message: 'Invalid order ID' });
  }

  try {
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId)));

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const items = await db
      .select({
        id: orderItemsTable.id,
        productId: orderItemsTable.productId,
        quantity: orderItemsTable.quantity,
        priceAtPurchase: orderItemsTable.priceAtPurchase,
        product: productsTable,
      })
      .from(orderItemsTable)
      .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
      .where(eq(orderItemsTable.orderId, order.id));

    return res.status(200).json({
      id: order.id,
      subtotalAmount: order.subtotalAmount ? Number(order.subtotalAmount) : Number(order.totalAmount),
      productDiscountAmount: Number(order.productDiscountAmount ?? 0),
      couponDiscountAmount: Number(order.couponDiscountAmount ?? 0),
      shippingAmount: Number(order.shippingAmount ?? 0),
      totalAmount: Number(order.totalAmount),
      appliedCouponCode: order.appliedCouponCode,
      couponSnapshot: order.couponSnapshot,
      status: order.status,
      shippingAddress: order.shippingAddress,
      paymentDetails: order.paymentDetails,
      createdAt: order.createdAt.toISOString(),
      items: items.map((it) => ({
        id: it.id,
        productId: it.productId,
        quantity: it.quantity,
        priceAtPurchase: Number(it.priceAtPurchase),
        product: it.product
          ? {
              ...it.product,
              price: Number(it.product.price),
              originalPrice: it.product.originalPrice != null ? Number(it.product.originalPrice) : null,
              rating: Number(it.product.rating),
            }
          : null,
      })),
    });
  } catch (error) {
    console.error('Order detail error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
