import { pgTable, serial, integer, numeric, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { productsTable } from "./products";

export const ordersTable = pgTable('orders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => usersTable.id, {
    onDelete: 'cascade',
  }),
  /** Immutable snapshot fields — never mutated after order creation */
  /** Sum of item prices before any discount */
  subtotalAmount: numeric('subtotal_amount', { precision: 10, scale: 2 }),
  /** Total product-level markdown savings (originalPrice - price) */
  productDiscountAmount: numeric('product_discount_amount', {
    precision: 10,
    scale: 2,
  })
    .notNull()
    .default('0'),
  /** Coupon discount applied at checkout */
  couponDiscountAmount: numeric('coupon_discount_amount', {
    precision: 10,
    scale: 2,
  })
    .notNull()
    .default('0'),
  /** Shipping fee charged */
  shippingAmount: numeric('shipping_amount', { precision: 10, scale: 2 })
    .notNull()
    .default('0'),
  /** Final charged amount = subtotal - productDiscount - couponDiscount + shipping */
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  /** Coupon code used, kept even if campaign is later deleted */
  appliedCouponCode: text('applied_coupon_code'),
  /** Full snapshot of coupon at checkout time for audit / display */
  couponSnapshot: jsonb('coupon_snapshot'),
  status: text('status').notNull().default('Processing'),
  paymentGateway: text('payment_gateway').notNull().default('cod'),
  razorpayOrderId: text('razorpay_order_id'),
  razorpayPaymentId: text('razorpay_payment_id'),
  razorpaySignature: text('razorpay_signature'),
  paymentStatus: text('payment_status').notNull().default('pending'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  shippingAddress: jsonb('shipping_address').notNull(),
  paymentDetails: jsonb('payment_details').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  quantity: integer("quantity").notNull(),
  priceAtPurchase: numeric("price_at_purchase", { precision: 10, scale: 2 }).notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;

export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;
