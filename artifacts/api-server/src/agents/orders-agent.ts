import { db, ordersTable, orderItemsTable, productsTable } from '@workspace/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  Agent,
  AgentContext,
  AgentResponse,
  ParsedIntent,
} from './types.js';

// Extract a specific order ID if mentioned in the message
function extractOrderId(message: string): number | null {
  const match = message.match(/(?:order\s*#?\s*|#)(\d{1,6})/i);
  if (match) {
    const id = parseInt(match[1], 10);
    return id > 0 ? id : null;
  }
  return null;
}

// Detect if message is a return/refund/exchange request
function isReturnIntent(message: string): boolean {
  return /return|refund|exchange|cancel.*order|cancellation|damaged|wrong item|replace|replacement/i.test(
    message,
  );
}

interface OrderSummary {
  id: number;
  totalAmount: string;
  status: string;
  createdAt: string;
  address: unknown;
  products: string[];
}

type OrderRow = {
  id: number;
  totalAmount: string;
  status: string;
  createdAt: Date;
  shippingAddress: unknown;
};

async function attachProductNames(rows: OrderRow[]): Promise<OrderSummary[]> {
  if (rows.length === 0) return [];

  const items = await db
    .select({
      orderId: orderItemsTable.orderId,
      productName: productsTable.name,
    })
    .from(orderItemsTable)
    .innerJoin(productsTable, eq(productsTable.id, orderItemsTable.productId))
    .where(
      inArray(
        orderItemsTable.orderId,
        rows.map((row) => row.id),
      ),
    );

  const productsByOrder = new Map<number, string[]>();
  for (const item of items) {
    const names = productsByOrder.get(item.orderId) ?? [];
    names.push(item.productName);
    productsByOrder.set(item.orderId, names);
  }

  return rows.map((row) => ({
    id: row.id,
    totalAmount: row.totalAmount,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    address: row.shippingAddress,
    products: productsByOrder.get(row.id) ?? ['Purchased items'],
  }));
}

// Order history is an explicit user request, so it is read directly rather than
// from the personalization-gated user context.
async function loadOrdersForUser(
  userId: number,
  limit = 10,
): Promise<OrderSummary[]> {
  const rows = await db
    .select({
      id: ordersTable.id,
      totalAmount: ordersTable.totalAmount,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
      shippingAddress: ordersTable.shippingAddress,
    })
    .from(ordersTable)
    .where(eq(ordersTable.userId, userId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(limit);

  return attachProductNames(rows);
}

async function loadOrderForUser(
  userId: number,
  orderId: number,
): Promise<OrderSummary | null> {
  const rows = await db
    .select({
      id: ordersTable.id,
      totalAmount: ordersTable.totalAmount,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
      shippingAddress: ordersTable.shippingAddress,
    })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId)))
    .limit(1);

  const [order] = await attachProductNames(rows);
  return order ?? null;
}

export class OrdersAgent implements Agent {
  name = 'OrdersAgent';

  async execute(
    ctx: AgentContext,
    parsed: ParsedIntent,
  ): Promise<AgentResponse> {
    const { userContext, userId, message } = ctx;

    if (!userId) {
      return {
        reply: `🔒 To view your order history, you'll need to **log in** first. Once logged in, I can show you all your recent orders, track deliveries, and help with returns!`,
        products: [],
        orders: [],
        requiresLogin: true,
        userContext: null,
      };
    }

    const name = userContext.name ? `, ${userContext.name}` : '';
    const orders = await loadOrdersForUser(userId);

    // ── Return / Refund / Exchange request ─────────────────────────────────
    if (isReturnIntent(message) || parsed.reply === 'return') {
      if (!orders.length) {
        return {
          reply:
            `🔄 **Returns & Refunds${name}**\n\n` +
            `You don't have any recent orders to return. If you made a purchase, please check your email confirmation or contact our support team.`,
          products: [],
          orders: [],
          followUp: ['What can I buy today?', 'Show trending products'],
          userContext: {
            name: userContext.name,
            recentOrderCount: 0,
            interests: userContext.interests,
          },
        };
      }

      const eligibleOrders = orders.filter(
        (o) => o.status === 'Delivered' || o.status === 'delivered',
      );

      let reply = `🔄 **Returns & Refunds${name}**\n\n`;
      if (eligibleOrders.length > 0) {
        reply += `Here are your **delivered orders** eligible for return:\n\n`;
        eligibleOrders.forEach((o) => {
          reply += `• **Order #${o.id}** — ₹${o.totalAmount} _(${o.products.join(', ')})_\n`;
        });
        reply += `\n**To initiate a return**: Go to **[My Orders](/orders)** → Click the order → Tap **"Request Return"**.\n`;
        reply += `Returns are processed within **2–3 business days** after pickup.`;
      } else {
        reply +=
          `None of your recent orders are currently eligible for return (items must be in "Delivered" status).\n\n` +
          `For assistance, please contact our support team or check your order status below.`;
      }

      return {
        reply,
        products: [],
        orders,
        followUp: [
          'Show all my orders',
          'Track my delivery',
          'Browse new products',
        ],
        userContext: {
          name: userContext.name,
          recentOrderCount: orders.length,
          interests: userContext.interests,
        },
      };
    }

    // ── Specific Order ID tracking ──────────────────────────────────────────
    const specificOrderId = extractOrderId(message);
    if (specificOrderId) {
      const found = await loadOrderForUser(userId, specificOrderId);
      if (found) {
        return {
          reply:
            `📦 **Order #${found.id} Status${name}**\n\n` +
            `**Items**: ${found.products.join(', ')}\n` +
            `**Total**: ₹${found.totalAmount}\n` +
            `**Status**: ${found.status}\n\n` +
            `View full invoice and tracking → [Order Details](/order/${found.id})`,
          products: [],
          orders: [found],
          followUp: [
            `View Order #${found.id} Details`,
            'Show all my orders',
            'Track another order',
          ],
          userContext: {
            name: userContext.name,
            recentOrderCount: orders.length,
            interests: userContext.interests,
          },
        };
      } else {
        return {
          reply:
            `⚠️ I couldn't find **Order #${specificOrderId}** in your account${name}.\n\n` +
            `It may belong to a different account, or the order number may be incorrect. Here are your recent orders instead:`,
          products: [],
          orders,
          followUp: ['Show all my orders', 'Help me find a product'],
          userContext: {
            name: userContext.name,
            recentOrderCount: orders.length,
            interests: userContext.interests,
          },
        };
      }
    }

    // ── General order history ───────────────────────────────────────────────
    const orderSummary = orders.length
      ? orders
          .map(
            (o) =>
              `• **Order #${o.id}**: ${o.products.join(', ')} — ₹${o.totalAmount} *(${o.status})*`,
          )
          .join('\n')
      : `You haven't placed any orders yet${name}. Browse our collection and find something you love! 🛍️`;

    const reply = orders.length
      ? `📦 Here are your recent orders${name}:\n\n${orderSummary}\n\n_Click any order for full details & invoice._`
      : orderSummary;

    return {
      reply,
      products: [],
      orders,
      followUp: orders.length
        ? ['Track delivery status', 'Request a return', 'Continue shopping']
        : ['Show trending products', 'Help me pick a mobile'],
      userContext: userId
        ? {
            name: userContext.name,
            recentOrderCount: orders.length,
            interests: userContext.interests,
          }
        : null,
    };
  }
}
