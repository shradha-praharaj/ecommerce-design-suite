import {
  db,
  usersTable,
  ordersTable,
  orderItemsTable,
  productsTable,
} from '@workspace/db';
import { eq, desc, inArray } from 'drizzle-orm';
import type { UserContext } from './types.js';

export async function loadUserContext(
  userId: number | null,
  personalizationEnabled: boolean = true,
): Promise<UserContext> {
  const userContext: UserContext = {};

  if (!userId) return userContext;

  try {
    const [user] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (user) userContext.name = user.name.split(' ')[0];

    // If personalization is disabled, return basic identity without order profiling
    if (!personalizationEnabled) {
      return userContext;
    }

    const recentOrders = await db
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
      .limit(3);

    const orderMap: Record<number, any> = Object.fromEntries(
      recentOrders.map((order) => [
        order.id,
        {
          ...order,
          address: order.shippingAddress,
          products: [],
        },
      ]),
    );
    const categorySet = new Set<string>();
    const brandSet = new Set<string>();
    const purchasedIds = new Set<number>();

    if (recentOrders.length > 0) {
      const detailedOrders = await db
        .select({
          orderId: orderItemsTable.orderId,
          productId: productsTable.id,
          productName: productsTable.name,
          category: productsTable.category,
          brand: productsTable.brand,
        })
        .from(orderItemsTable)
        .innerJoin(
          productsTable,
          eq(productsTable.id, orderItemsTable.productId),
        )
        .where(
          inArray(
            orderItemsTable.orderId,
            recentOrders.map((order) => order.id),
          ),
        );

      detailedOrders.forEach((row) => {
        categorySet.add(row.category);
        brandSet.add(row.brand);
        purchasedIds.add(row.productId);
        orderMap[row.orderId]?.products.push(row.productName);
      });
    }

    userContext.lastAddress = recentOrders[0]?.shippingAddress;
    userContext.recentOrders = recentOrders.map((order) => ({
      ...orderMap[order.id],
      products:
        orderMap[order.id].products.length > 0
          ? orderMap[order.id].products
          : ['Purchased items'],
    }));
    userContext.interests = Array.from(categorySet);
    userContext.purchasedProductIds = Array.from(purchasedIds);
    userContext.purchasedBrands = Array.from(brandSet);
  } catch (e) {
    console.warn('Could not fetch user context:', e);
  }

  return userContext;
}
