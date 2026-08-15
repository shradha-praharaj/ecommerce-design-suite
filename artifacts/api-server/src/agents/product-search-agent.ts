import { db, productsTable } from '@workspace/db';
import {
  ilike,
  and,
  lte,
  gte,
  eq,
  desc,
  or as drizzleOr,
  sql,
} from 'drizzle-orm';
import type {
  Agent,
  AgentContext,
  AgentResponse,
  ParsedIntent,
} from './types.js';
import {
  createProductSearchClarification,
  needsProductSearchClarification,
} from './clarification-policy.js';

export class ProductSearchAgent implements Agent {
  name = 'ProductSearchAgent';

  async execute(
    ctx: AgentContext,
    parsed: ParsedIntent,
  ): Promise<AgentResponse> {
    if (needsProductSearchClarification(ctx, parsed)) {
      return createProductSearchClarification(ctx, parsed);
    }

    const { userContext, userId } = ctx;
    const name = userContext.name ? `, ${userContext.name}` : '';

    // Intelligent cascading search: try specific → progressively broader
    let products = await this.cascadingSearch(parsed);
    products = this.diversifyResults(products, parsed);

    // Generate contextual follow-up suggestions for multi-turn conversation
    const followUp = this.generateFollowUps(
      parsed,
      products,
      userContext,
      userId,
    );

    // Build a conversational reply that encourages continued interaction
    let reply = parsed.reply || '';
    if (!reply) {
      if (products.length === 0) {
        reply = `I couldn't find any matching products${name}. Try adjusting your filters or ask me differently!`;
      } else if (parsed.keyword) {
        reply = `Here's what I found for "${parsed.keyword}"${name}:`;
      } else {
        reply = `Here are the best options I found for you${name}:`;
      }
    }

    // Add conversational nudge if products found
    if (products.length > 0 && !parsed.reply) {
      reply += `\n\n💬 Want me to narrow it down? Just tell me your budget or preferred brand!`;
    }

    return {
      reply,
      products,
      orders: [],
      followUp,
      explanation: {
        why: [
          parsed.category
            ? `Filtered to the ${parsed.category} category requested.`
            : 'Matched the product terms in your request against the catalog.',
          parsed.maxPrice != null
            ? `Kept products at or below ₹${parsed.maxPrice.toLocaleString('en-IN')}.`
            : 'No price ceiling was applied.',
          'Only products currently marked in stock were returned.',
        ],
        tradeoffs: [
          parsed.sortByRating
            ? 'Results favor rating, which may trade lower price for stronger review history.'
            : 'You can request a different budget, brand, or sort preference.',
        ],
        source: 'catalog',
      },
      userContext: userId
        ? {
            name: userContext.name,
            recentOrderCount: userContext.recentOrders?.length ?? 0,
            interests: userContext.interests,
          }
        : null,
    };
  }

  /**
   * Cascading search strategy:
   * 1. Try exact keyword match in product name
   * 2. Try each word of the keyword separately (e.g. "galaxy s22" → "galaxy" OR "s22")
   * 3. Try with just category + brand (no keyword)
   * 4. Try with just category
   * Each level respects price/brand filters if set.
   */
  private async cascadingSearch(parsed: ParsedIntent): Promise<any[]> {
    const sortOrder =
      parsed.sortByPrice === 'asc'
        ? productsTable.price
        : parsed.sortByPrice === 'desc'
          ? desc(productsTable.price)
          : desc(productsTable.rating);

    // Build base conditions (price + brand + inStock) — always applied
    const baseConditions = [eq(productsTable.inStock, true)];
    if (parsed.maxPrice)
      baseConditions.push(lte(productsTable.price, parsed.maxPrice.toString()));
    if (parsed.minPrice)
      baseConditions.push(gte(productsTable.price, parsed.minPrice.toString()));
    if (parsed.brands && parsed.brands.length > 0) {
      const brandConditions = parsed.brands.map((b: string) =>
        ilike(productsTable.brand, `%${b}%`),
      );
      baseConditions.push(drizzleOr(...brandConditions)!);
    }

    // Level 1: Full keyword + category (most specific)
    if (parsed.keyword) {
      const level1Conditions = [...baseConditions];
      if (parsed.category)
        level1Conditions.push(eq(productsTable.category, parsed.category));
      level1Conditions.push(
        drizzleOr(
          ilike(productsTable.name, `%${parsed.keyword}%`),
          ilike(productsTable.brand, `%${parsed.keyword}%`),
        )!,
      );

      const results = await db
        .select()
        .from(productsTable)
        .where(and(...level1Conditions))
        .orderBy(sortOrder)
        .limit(6);

      if (results.length > 0) return results;

      // Level 2: Split keyword into parts and match ANY part in name
      const keywordParts = parsed.keyword
        .split(/\s+/)
        .filter((w) => w.length > 1);
      if (keywordParts.length > 1) {
        const level2Conditions = [...baseConditions];
        if (parsed.category)
          level2Conditions.push(eq(productsTable.category, parsed.category));

        const partConditions = keywordParts.map((part) =>
          ilike(productsTable.name, `%${part}%`),
        );
        level2Conditions.push(drizzleOr(...partConditions)!);

        const results2 = await db
          .select()
          .from(productsTable)
          .where(and(...level2Conditions))
          .orderBy(sortOrder)
          .limit(6);

        if (results2.length > 0) return results2;
      }

      // Level 3: Just category + base conditions (drop keyword entirely)
      if (parsed.category) {
        const level3Conditions = [
          ...baseConditions,
          eq(productsTable.category, parsed.category),
        ];

        const results3 = await db
          .select()
          .from(productsTable)
          .where(and(...level3Conditions))
          .orderBy(sortOrder)
          .limit(6);

        if (results3.length > 0) return results3;
      }
    }

    // Standard search: category + base conditions
    const conditions = [...baseConditions];
    if (parsed.category)
      conditions.push(eq(productsTable.category, parsed.category));

    // If only keyword, no category — search name broadly
    if (!parsed.category && parsed.keyword) {
      const keywordParts = parsed.keyword
        .split(/\s+/)
        .filter((w) => w.length > 1);
      const partConditions = keywordParts.map((part) =>
        ilike(productsTable.name, `%${part}%`),
      );
      if (partConditions.length > 0) {
        conditions.push(drizzleOr(...partConditions)!);
      }
    }

    const resultLimit =
      !parsed.keyword &&
      !parsed.brands?.length &&
      (parsed.category === 'Mobiles' || parsed.category === 'Audio')
        ? 18
        : 6;

    return await db
      .select()
      .from(productsTable)
      .where(and(...conditions))
      .orderBy(sortOrder)
      .limit(resultLimit);
  }

  private diversifyResults(products: any[], parsed: ParsedIntent): any[] {
    if (
      products.length <= 1 ||
      parsed.keyword ||
      parsed.brands?.length ||
      (parsed.category !== 'Mobiles' && parsed.category !== 'Audio')
    ) {
      return products.slice(0, 6);
    }

    const selected: any[] = [];
    const selectedIds = new Set<number>();
    const add = (product: any) => {
      if (!selectedIds.has(product.id) && selected.length < 6) {
        selected.push(product);
        selectedIds.add(product.id);
      }
    };

    // Unbounded audio recommendations should also include low, mid, and high price points.
    if (parsed.category === 'Audio' && !parsed.minPrice && !parsed.maxPrice) {
      const byPrice = [...products].sort(
        (left, right) => Number(left.price) - Number(right.price),
      );
      add(byPrice[0]);
      add(byPrice[Math.floor(byPrice.length / 2)]);
      add(byPrice[byPrice.length - 1]);
    }

    // Guarantee brand choice before filling remaining result slots.
    const seenBrands = new Set<string>();
    for (const product of products) {
      const brand = String(product.brand ?? '').toLowerCase();
      if (brand && !seenBrands.has(brand)) {
        seenBrands.add(brand);
        add(product);
      }
    }

    for (const product of products) add(product);
    return selected;
  }

  private generateFollowUps(
    parsed: ParsedIntent,
    products: any[],
    userContext: any,
    userId: number | null,
  ): string[] {
    const suggestions: string[] = [];

    if (products.length === 0) {
      // No results - suggest broadening
      if (parsed.maxPrice)
        suggestions.push(`Show me options without price limit`);
      if (parsed.category) suggestions.push(`Show all ${parsed.category}`);
      suggestions.push(`What's popular right now?`);
      return suggestions;
    }

    // Budget-based follow-ups
    if (!parsed.maxPrice && !parsed.minPrice) {
      suggestions.push(`Under ₹30,000`);
      suggestions.push(`Premium options`);
    } else if (parsed.maxPrice && parsed.maxPrice <= 30000) {
      suggestions.push(`Show mid-range options`);
    }

    // Brand-based follow-ups from results
    const resultBrands = [...new Set(products.map((p) => p.brand))];
    if (resultBrands.length > 1 && !parsed.brands?.length) {
      suggestions.push(`Only ${resultBrands[0]}`);
    }

    // Category-specific follow-ups
    if (parsed.category === 'Mobiles') {
      if (!parsed.brands?.length) suggestions.push(`Samsung phones`);
      suggestions.push(`Compare top 2`);
    } else if (parsed.category === 'Laptops') {
      suggestions.push(`Good for programming`);
      suggestions.push(`Gaming laptops`);
    } else if (parsed.category === 'Audio') {
      suggestions.push(`Wireless only`);
    }

    // Add to cart nudge
    if (products.length > 0) {
      suggestions.push(`Add the best one to cart`);
    }

    // History-based suggestions
    if (userContext.purchasedBrands?.length && !parsed.brands?.length) {
      const favBrand = userContext.purchasedBrands[0];
      if (!suggestions.some((s) => s.includes(favBrand))) {
        suggestions.push(`Show ${favBrand} options`);
      }
    }

    return suggestions.slice(0, 4); // Max 4 follow-ups
  }
}
