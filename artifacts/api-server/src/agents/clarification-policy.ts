import type { AgentContext, AgentResponse, ParsedIntent } from './types.js';

const PERSONA_OR_USE_CASE_PATTERN =
  /\b(student|college|gamer|gaming|professional|office|work from home|remote work|creator|designer|photographer|programming|developer|travel|fitness)\b/i;

const PREFERENCE_QUESTION = 'What matters most for your';

const CATEGORY_PATTERNS: Array<{ category: string; pattern: RegExp }> = [
  { category: 'Mobiles', pattern: /\b(mobile|mobiles|phone|phones)\b/i },
  { category: 'Laptops', pattern: /\b(laptop|laptops)\b/i },
  {
    category: 'Audio',
    pattern: /\b(headphone|headphones|earbuds?|speaker|speakers|audio)\b/i,
  },
  { category: 'Cameras', pattern: /\b(camera|cameras)\b/i },
  {
    category: 'Accessories',
    pattern: /\b(accessory|accessories|keyboard|mouse|power bank)\b/i,
  },
];

interface PendingProductSearch {
  category: string;
  minPrice?: number;
  maxPrice?: number;
}

function hasBudget(parsed: ParsedIntent): boolean {
  return parsed.minPrice != null || parsed.maxPrice != null;
}

function hasPreference(parsed: ParsedIntent, message: string): boolean {
  return Boolean(
    parsed.keyword ||
    parsed.brands?.length ||
    parsed.minPrice != null ||
    parsed.maxPrice != null ||
    PERSONA_OR_USE_CASE_PATTERN.test(message) ||
    /\b(camera|battery|gaming|performance|display|rated|rating|show all)\b/i.test(
      message,
    ),
  );
}

function extractPendingProductSearch(
  history: AgentContext['history'],
): PendingProductSearch | null {
  if (
    !history?.some(
      (entry) =>
        entry.role === 'assistant' &&
        entry.content.includes(PREFERENCE_QUESTION),
    )
  ) {
    return null;
  }

  const priorUserMessage = [...history]
    .reverse()
    .find((entry) => entry.role === 'user');
  if (!priorUserMessage) return null;

  const category = CATEGORY_PATTERNS.find(({ pattern }) =>
    pattern.test(priorUserMessage.content),
  )?.category;
  if (!category) return null;

  const lower = priorUserMessage.content.toLowerCase();
  const maxPriceMatch = lower.match(
    /(?:under|below|less than|<)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac|lacs|l)?/,
  );
  const minPriceMatch = lower.match(
    /(?:above|over|more than|starting|from)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac|lacs|l)?/,
  );
  const toPrice = (value: string, unit?: string) => {
    let amount = parseFloat(value.replace(/,/g, ''));
    const normalizedUnit = unit?.toLowerCase();
    if (normalizedUnit === 'k' || normalizedUnit === 'thousand') amount *= 1000;
    if (['lakh', 'lakhs', 'lac', 'lacs', 'l'].includes(normalizedUnit ?? '')) {
      amount *= 100000;
    }
    return Math.round(amount);
  };

  return {
    category,
    maxPrice: maxPriceMatch
      ? toPrice(maxPriceMatch[1], maxPriceMatch[2])
      : undefined,
    minPrice: minPriceMatch
      ? toPrice(minPriceMatch[1], minPriceMatch[2])
      : undefined,
  };
}

export function mergePendingProductSearch(
  ctx: AgentContext,
  parsed: ParsedIntent,
): ParsedIntent {
  const pendingSearch = extractPendingProductSearch(ctx.history);
  if (!pendingSearch || !hasPreference(parsed, ctx.message)) {
    return parsed;
  }

  return {
    ...parsed,
    intent: 'product_search',
    category: parsed.category ?? pendingSearch.category,
    maxPrice: parsed.maxPrice ?? pendingSearch.maxPrice,
    minPrice: parsed.minPrice ?? pendingSearch.minPrice,
  };
}

export function needsProductSearchClarification(
  ctx: AgentContext,
  parsed: ParsedIntent,
): boolean {
  if (parsed.intent !== 'product_search' || !hasBudget(parsed)) {
    return false;
  }

  const hasSearchTarget = Boolean(
    parsed.category || hasPreference(parsed, ctx.message),
  );

  if (!hasSearchTarget) return true;

  return Boolean(parsed.category && !hasPreference(parsed, ctx.message));
}

export function createProductSearchClarification(
  ctx: AgentContext,
  parsed: ParsedIntent,
): AgentResponse {
  const budget =
    parsed.maxPrice != null
      ? `within ₹${parsed.maxPrice.toLocaleString('en-IN')}`
      : parsed.minPrice != null
        ? `above ₹${parsed.minPrice.toLocaleString('en-IN')}`
        : 'within your budget';

  if (parsed.category) {
    const categoryLabel = parsed.category.toLowerCase();
    const followUp =
      parsed.category === 'Mobiles'
        ? [
            `Samsung mobiles ${budget}`,
            `Xiaomi mobiles ${budget}`,
            `Best camera mobile ${budget}`,
            `Gaming mobile ${budget}`,
          ]
        : [
            `Best rated ${categoryLabel} ${budget}`,
            `Best battery ${categoryLabel} ${budget}`,
            `Gaming ${categoryLabel} ${budget}`,
            `Show all ${categoryLabel} ${budget}`,
          ];

    return {
      reply: `${PREFERENCE_QUESTION} ${categoryLabel} ${budget}? Choose a brand or tell me the feature you care about.`,
      products: [],
      orders: [],
      followUp,
      userContext: ctx.userId
        ? {
            name: ctx.userContext.name,
            recentOrderCount: ctx.userContext.recentOrders?.length ?? 0,
            interests: ctx.userContext.interests,
          }
        : null,
    };
  }

  return {
    reply: `What are you shopping for ${budget}? I can help you find the right option.`,
    products: [],
    orders: [],
    followUp: [
      `Mobiles ${budget}`,
      `Headphones ${budget}`,
      `Accessories ${budget}`,
      `Cameras ${budget}`,
    ],
    userContext: ctx.userId
      ? {
          name: ctx.userContext.name,
          recentOrderCount: ctx.userContext.recentOrders?.length ?? 0,
          interests: ctx.userContext.interests,
        }
      : null,
  };
}
