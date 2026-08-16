import {
  db,
  usersTable,
  ordersTable,
  orderItemsTable,
  productsTable,
  chatCheckpointsTable,
  chatConversationsTable,
} from '@workspace/db';
import { eq, desc, inArray, and } from 'drizzle-orm';
import type {
  UserContext,
  UserPreferenceProfileSummary,
  IncompleteSessionSummary,
} from './types.js';
import { loadUserPreferenceProfile } from './user-preference-engine.js';

export async function loadLastIncompleteCheckpoint(
  userId: number,
): Promise<IncompleteSessionSummary | null> {
  try {
    const recentConv = await db
      .select({
        id: chatConversationsTable.id,
        updatedAt: chatConversationsTable.updatedAt,
      })
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.userId, userId))
      .orderBy(desc(chatConversationsTable.updatedAt))
      .limit(1);

    if (recentConv.length === 0) return null;
    const convId = recentConv[0].id;

    const [latestCheckpoint] = await db
      .select({
        state: chatCheckpointsTable.state,
        agentName: chatCheckpointsTable.agentName,
      })
      .from(chatCheckpointsTable)
      .where(eq(chatCheckpointsTable.conversationId, convId))
      .orderBy(desc(chatCheckpointsTable.sequence))
      .limit(1);

    if (!latestCheckpoint || !latestCheckpoint.state) return null;
    const state = latestCheckpoint.state as any;

    // Check if there is an actionable in-progress advisor session
    if (
      state.activeAgent &&
      (state.activeAgent === 'GamingBuildAdvisorAgent' ||
        state.activeAgent === 'GuidedProductAdvisorAgent' ||
        state.goal ||
        state.category)
    ) {
      let summaryText = 'your custom product recommendations';
      if (
        state.activeAgent === 'GamingBuildAdvisorAgent' ||
        state.goal === 'pc_build' ||
        state.goal === 'gaming_pc_build'
      ) {
        summaryText = state.budgetMax
          ? `your gaming PC build within ₹${Number(state.budgetMax).toLocaleString('en-IN')}`
          : 'your custom gaming PC build';
      } else if (state.category) {
        summaryText = `finding the best ${state.category} for you`;
      }

      return {
        goal: state.goal || 'recommendation',
        activeAgent: state.activeAgent,
        category: state.category,
        answers: state.answers || {},
        budgetMax: state.budgetMax || null,
        nextQuestion: state.nextQuestion || null,
        summaryText,
      };
    }

    return null;
  } catch (err) {
    console.warn('Could not check incomplete checkpoints:', err);
    return null;
  }
}

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

    // If personalization is disabled, return basic identity without profiling
    if (!personalizationEnabled) {
      return userContext;
    }

    const [recentOrders, rawProfile, incompleteCheckpoint] = await Promise.all([
      db
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
        .limit(3),
      loadUserPreferenceProfile(userId),
      loadLastIncompleteCheckpoint(userId),
    ]);

    const orderMap: Record<number, any> = Object.fromEntries(
      recentOrders.map((order: any) => [
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
            recentOrders.map((order: any) => order.id),
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
    userContext.recentOrders = recentOrders.map((order: any) => ({
      ...orderMap[order.id],
      products:
        orderMap[order.id].products.length > 0
          ? orderMap[order.id].products
          : ['Purchased items'],
    }));

    userContext.interests = Array.from(categorySet);
    userContext.purchasedProductIds = Array.from(purchasedIds);
    userContext.purchasedBrands = Array.from(brandSet);

    if (rawProfile) {
      userContext.preferenceProfile = {
        topCategories: (rawProfile.topCategories as string[]) || [],
        topBrands: (rawProfile.topBrands as string[]) || [],
        useCases: (rawProfile.useCases as string[]) || [],
        priceRange: rawProfile.priceRange as any,
        personaHint: rawProfile.personaHint,
        giftBuyerScore: parseFloat(rawProfile.giftBuyerScore || '0'),
        conversationSignals: (rawProfile.conversationSignals as string[]) || [],
      };
      // Merge top categories and brands into interests if not already present
      userContext.preferenceProfile.topCategories.forEach((cat) =>
        categorySet.add(cat),
      );
      userContext.preferenceProfile.topBrands.forEach((brand) =>
        brandSet.add(brand),
      );
      userContext.interests = Array.from(categorySet);
      userContext.purchasedBrands = Array.from(brandSet);
    }

    if (incompleteCheckpoint) {
      userContext.incompleteCheckpoint = incompleteCheckpoint;
    }
  } catch (e) {
    console.warn('Could not fetch user context:', e);
  }

  return userContext;
}

