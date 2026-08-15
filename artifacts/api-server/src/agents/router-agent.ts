import type { AgentContext, ParsedIntent, UserContext } from './types.js';
import { getAIProvider, type StructuredSchema } from './ai-provider.js';

const GREETINGS = [
  'hi',
  'hello',
  'hey',
  'good morning',
  'good evening',
  'good afternoon',
  'howdy',
  'hola',
  'sup',
];

const BRANDS: Array<{ name: string; category?: string }> = [
  { name: 'Samsung', category: 'Mobiles' },
  { name: 'Xiaomi', category: 'Mobiles' },
  { name: 'OnePlus', category: 'Mobiles' },
  { name: 'Motorola', category: 'Mobiles' },
  { name: 'Vivo', category: 'Mobiles' },
  { name: 'Oppo', category: 'Mobiles' },
  { name: 'Realme', category: 'Mobiles' },
  { name: 'Redmi', category: 'Mobiles' },
  { name: 'Apple' },
  { name: 'Sony' },
  { name: 'Dell', category: 'Laptops' },
  { name: 'HP', category: 'Laptops' },
  { name: 'Lenovo', category: 'Laptops' },
  { name: 'Asus', category: 'Laptops' },
];

const INTENT_SCHEMA: StructuredSchema = {
  type: 'object',
  properties: {
    isGreeting: { type: 'boolean' },
    intent: { type: 'string' },
    category: { type: 'string', nullable: true },
    maxPrice: { type: 'number', nullable: true },
    minPrice: { type: 'number', nullable: true },
    keyword: { type: 'string', nullable: true },
    brands: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
    },
    sortByPrice: {
      type: 'string',
      nullable: true,
      description: '"asc" or "desc"',
    },
    sortByRating: {
      type: 'boolean',
      nullable: true,
      description: 'true when user wants best/top rated products',
    },
    reply: { type: 'string', description: 'Conversational reply' },
  },
};

function localFallbackParse(
  message: string,
  history?: Array<{ role: string; content: string }>,
): ParsedIntent {
  const lower = message.trim().toLowerCase();

  const isGreeting = GREETINGS.some(
    (g) =>
      lower === g || lower.startsWith(g + ' ') || lower.startsWith(g + '!'),
  );
  if (isGreeting) {
    return { isGreeting: true, intent: 'greeting', reply: '' };
  }

  // Extract last assistant message for active continuation tracking
  const lastAssistantMsg = [...(history || [])]
    .reverse()
    .find((h) => h.role === 'assistant');
  const lastContentLower = (lastAssistantMsg?.content || '').toLowerCase();

  // ── Active Guided Consultation continuation (checked FIRST before PC build) ──
  const isGuidedAdvisorActive =
    lastContentLower.includes('what will you primarily use your new') ||
    lastContentLower.includes('primary use case for your new') ||
    lastContentLower.includes('target budget for your') ||
    lastContentLower.includes('which product category are you looking for') ||
    lastContentLower.includes('sound experience are you looking for') ||
    lastContentLower.includes('photography will you primarily do') ||
    lastContentLower.includes('electronics match') ||
    lastContentLower.includes('best recommended mobile') ||
    lastContentLower.includes('best recommended laptop') ||
    lastContentLower.includes('best recommended audio') ||
    lastContentLower.includes('best recommended camera') ||
    lastContentLower.includes('best recommended tv') ||
    lastContentLower.includes('best recommended tablet') ||
    lastContentLower.includes('what will you primarily use your new tv') ||
    lastContentLower.includes('what will you primarily use your new tablet') ||
    lastContentLower.includes('what will you primarily use your tablet') ||
    lastContentLower.includes('what is your primary use case for your new');

  if (isGuidedAdvisorActive) {
    return { isGreeting: false, intent: 'guided_advisor', reply: '' };
  }

  // ── Active Gaming PC build continuation ──────────────────────────────────
  const isGamingBuildActive =
    lastContentLower.includes('gaming pc') ||
    lastContentLower.includes('pc build') ||
    lastContentLower.includes('what will they primarily do on this pc') ||
    lastContentLower.includes('how much time will they typically spend') ||
    lastContentLower.includes('how much time will they') ||
    (lastContentLower.includes('for a ') &&
      lastContentLower.includes('workload')) ||
    lastContentLower.includes('primary workload') ||
    lastContentLower.includes('what will you primarily use this pc') ||
    lastContentLower.includes('processor brand preference') ||
    lastContentLower.includes('graphics card (gpu) brand preference') ||
    lastContentLower.includes('let ai decide') ||
    lastContentLower.includes('target display') ||
    lastContentLower.includes('target monitor resolution') ||
    lastContentLower.includes('resolution goal') ||
    (lastContentLower.includes('total target budget') &&
      !lastContentLower.includes('for your new')) ||
    lastContentLower.includes('components selected') ||
    lastContentLower.includes('component breakdown') ||
    (lastContentLower.includes('ready to add') &&
      lastContentLower.includes('components')) ||
    lastContentLower.includes('coupon savings');

  if (isGamingBuildActive) {
    return { isGreeting: false, intent: 'gaming_build', reply: '' };
  }

  if (
    /\b(?:alternatives?|other options|something else)\b|\bdon'?t like (?:this|that)\b/i.test(
      lower,
    )
  ) {
    const recentContext = [...(history || [])]
      .filter((entry) => entry.role === 'user')
      .map((entry) => entry.content.toLowerCase())
      .join(' ');
    const category =
      /\b(?:mobile|mobiles|phone|phones|iphone|galaxy|pixel)\b/.test(
        recentContext,
      )
        ? 'Mobiles'
        : /laptop|macbook|dell|hp/.test(recentContext)
          ? 'Laptops'
          : /headphone|earbud|speaker|audio/.test(recentContext)
            ? 'Audio'
            : /camera/.test(recentContext)
              ? 'Cameras'
              : /keyboard|mouse|accessor/.test(recentContext)
                ? 'Accessories'
                : undefined;
    if (category) {
      return {
        isGreeting: false,
        intent: 'product_search',
        category,
        sortByRating: true,
        reply: '',
      };
    }
  }

  // ── Compare intent fast-path ─────────────────────────────────────────────
  if (
    lower.includes(' vs ') ||
    lower.includes(' versus ') ||
    lower.startsWith('compare ') ||
    (lower.includes('compare') && lower.includes(' and ')) ||
    (lower.includes('difference between') &&
      (lower.includes('and') || lower.includes('vs')))
  ) {
    return { isGreeting: false, intent: 'compare', reply: '' };
  }

  // ── Return/Refund/Exchange intent ────────────────────────────────────────
  if (
    lower.includes('return') ||
    lower.includes('refund') ||
    lower.includes('exchange') ||
    lower.includes('cancel my order') ||
    lower.includes('cancellation') ||
    lower.includes('damaged') ||
    lower.includes('wrong item') ||
    lower.includes('replace my') ||
    lower.includes('replacement')
  ) {
    return { isGreeting: false, intent: 'orders', reply: 'return' };
  }

  // ── Specific PC Build triggers override guided advisor ───────────────────
  if (
    lower.includes('pc build') ||
    lower.includes('build a pc') ||
    lower.includes('build pc') ||
    lower.includes('gaming rig') ||
    lower.includes('gaming pc') ||
    lower.includes('assemble pc') ||
    lower.includes('assemble a pc')
  ) {
    return { isGreeting: false, intent: 'gaming_build', reply: '' };
  }

  // ── Guided Product Advisor triggers ──────────────────────────────────────
  const guidedAdvisorTriggers = [
    'help me to pick',
    'help me pick',
    'help me choose',
    'help me select',
    'pick up best',
    'pick best',
    'choose best',
    'which mobile',
    'which phone',
    'which laptop',
    'which headphone',
    'which camera',
    'which tv',
    'which tablet',
    'recommend a mobile',
    'recommend a phone',
    'recommend a laptop',
    'recommend a tv',
    'suggest a mobile',
    'suggest a phone',
    'suggest a laptop',
    'suggest a tv',
    'guide me to buy',
    'guide me to choose',
    'what is the best mobile',
    'what is the best phone',
    'what is the best laptop',
    'what is the best tv',
    'best mobil',
    'best mobile',
    'best tv',
    'best tablet',
  ];
  if (guidedAdvisorTriggers.some((t) => lower.includes(t))) {
    return { isGreeting: false, intent: 'guided_advisor', reply: '' };
  }

  // ── Deals / Sale / Flash Sale intent ─────────────────────────────────────
  if (
    lower.includes('deals') ||
    lower.includes('flash sale') ||
    lower.includes('offer') ||
    lower.includes('discount') ||
    lower.includes("today's sale") ||
    lower.includes('best offers') ||
    lower.includes('sale today') ||
    lower.includes('on sale')
  ) {
    return { isGreeting: false, intent: 'popular_products', reply: '' };
  }

  if (
    lower.includes('add') &&
    (lower.includes('cart') || lower.includes('all to cart'))
  ) {
    return { isGreeting: false, intent: 'add_to_cart', reply: '' };
  }
  if (
    lower.includes('add all') ||
    lower.includes('add everything') ||
    lower.includes('add bundle')
  ) {
    return { isGreeting: false, intent: 'add_to_cart', reply: '' };
  }

  // ── Gaming PC build intent ────────────────────────────────────────────────
  const gamingBuildTriggers = [
    'pick a good pc build',
    'help me to pick a good pc build',
    'pick pc build',
    'good pc build',
    'build gaming pc',
    'build a gaming pc',
    'build pc',
    'build a pc',
    'gaming rig',
    'gaming build',
    'pc build',
    'pc builder',
    'build my pc',
    'build gaming rig',
    'assemble pc',
    'help me build',
    'recommend gaming pc',
    'gaming computer build',
    'compatible parts',
    'what processor',
    'which gpu',
    'which cpu',
  ];
  if (gamingBuildTriggers.some((t) => lower.includes(t))) {
    return { isGreeting: false, intent: 'gaming_build', reply: '' };
  }

  // ── Coupon intent ─────────────────────────────────────────────────────────
  if (
    lower.includes('coupon') ||
    lower.includes('promo code') ||
    lower.includes('discount code') ||
    lower.includes('apply code') ||
    lower.includes('voucher') ||
    lower.includes('offer code')
  ) {
    return {
      isGreeting: false,
      intent: 'product_search',
      category: undefined,
      reply: '',
    };
  }

  // ── Bundle advisor — persona-based (NOT triggered by "gaming" alone) ──────
  const bundleTriggers = [
    'student',
    'college',
    'university',
    'engineering',
    'gaming setup', // Must include "setup" — not "gaming" alone
    'gaming workstation', // specific gaming workspace persona
    'work from home',
    'professional',
    'office setup',
    'content creator',
    'youtuber',
    'vlogger',
    'creator',
    'doctor',
    'medical',
    'nurse',
    'healthcare',
    'teacher',
    'professor',
    'educator',
    'architect',
    'designer',
    'musician',
    'music production',
    'photographer',
    'photography setup', // must be specific to setup
    'freelancer',
    'freelance',
    'remote work',
  ];
  const hasBundlePersona = bundleTriggers.some((t) => lower.includes(t));
  const hasBundleIntent =
    lower.includes('good for me') ||
    lower.includes('bundle') ||
    lower.includes('setup for') ||
    lower.includes('what should i') ||
    lower.includes('suggest for') ||
    lower.includes('complete setup') ||
    lower.includes('everything i need');
  if (
    hasBundlePersona &&
    (hasBundleIntent || lower.includes('want to buy') || lower.includes('need'))
  ) {
    return { isGreeting: false, intent: 'bundle_advisor', reply: '' };
  }
  if (
    hasBundlePersona &&
    (lower.includes('good') ||
      lower.includes('best') ||
      lower.includes('recommend'))
  ) {
    return { isGreeting: false, intent: 'bundle_advisor', reply: '' };
  }
  if (hasBundlePersona) {
    return { isGreeting: false, intent: 'bundle_advisor', reply: '' };
  }

  const hasRatingIntent =
    lower.includes('best rat') ||
    lower.includes('top rat') ||
    lower.includes('highest rat') ||
    lower.includes('best review') ||
    lower.includes('top review') ||
    lower.includes('most rated') ||
    lower.includes('highly rated');
  if (hasRatingIntent) {
    let ratingCategory: string | undefined;
    if (
      lower.includes('mobile') ||
      lower.includes('phone') ||
      lower.includes('iphone')
    )
      ratingCategory = 'Mobiles';
    else if (lower.includes('laptop') || lower.includes('macbook'))
      ratingCategory = 'Laptops';
    else if (
      lower.includes('headphone') ||
      lower.includes('audio') ||
      lower.includes('earbud') ||
      lower.includes('speaker')
    )
      ratingCategory = 'Audio';
    else if (lower.includes('camera')) ratingCategory = 'Cameras';
    else if (
      lower.includes('accessor') ||
      lower.includes('mouse') ||
      lower.includes('keyboard')
    )
      ratingCategory = 'Accessories';

    return {
      isGreeting: false,
      intent: 'product_search',
      category: ratingCategory,
      sortByPrice: undefined,
      sortByRating: true,
      reply: '',
    } as ParsedIntent;
  }

  const hasPopularIntent =
    lower.includes('popular') ||
    lower.includes('trending') ||
    lower.includes("what's hot") ||
    lower.includes('whats hot') ||
    lower.includes('bestseller') ||
    lower.includes('best seller') ||
    lower.includes('trending now') ||
    lower.includes('most popular') ||
    lower.includes('most reviewed') ||
    lower.includes('what should i buy') ||
    (lower.includes('what') && lower.includes('popular'));
  if (hasPopularIntent) {
    return { isGreeting: false, intent: 'popular_products', reply: '' };
  }

  const hasExplicitProductCategory =
    /\b(?:mobile|mobiles|phone|phones|laptop|laptops|headphone|headphones|earbud|earbuds|speaker|speakers|audio|camera|cameras|keyboard|mouse|accessory|accessories)\b/.test(
      lower,
    );
  if (
    lower.includes('top pick') ||
    (lower.includes('best for me') && !hasExplicitProductCategory) ||
    (lower.includes('recommend') && !hasExplicitProductCategory) ||
    (lower.includes('suggestion') && !hasExplicitProductCategory) ||
    (lower.includes('something new') && !hasExplicitProductCategory)
  ) {
    return { isGreeting: false, intent: 'top_picks', reply: '' };
  }

  if (
    lower.includes('order') ||
    lower.includes('purchase') ||
    lower.includes('bought')
  ) {
    return { isGreeting: false, intent: 'orders', reply: '' };
  }

  if (
    lower.includes('address') ||
    lower.includes('delivery') ||
    lower.includes('shipping')
  ) {
    return { isGreeting: false, intent: 'address', reply: '' };
  }

  // ── Category / price detection for product_search ─────────────────────────
  let category: string | undefined;
  if (
    /\b(?:mobile|mobiles|phone|phones)\b/.test(lower) ||
    lower.includes('iphone') ||
    lower.includes('galaxy') ||
    lower.includes('pixel')
  ) {
    category = 'Mobiles';
  } else if (
    lower.includes('laptop') ||
    lower.includes('macbook') ||
    lower.includes('dell') ||
    lower.includes('hp')
  ) {
    category = 'Laptops';
  } else if (
    lower.includes('headphone') ||
    lower.includes('airpod') ||
    lower.includes('audio') ||
    lower.includes('earbud') ||
    lower.includes('speaker')
  ) {
    category = 'Audio';
  } else if (
    lower.includes('camera') ||
    lower.includes('sony') ||
    lower.includes('canon') ||
    lower.includes('nikon')
  ) {
    category = 'Cameras';
  } else if (
    lower.includes('accessory') ||
    lower.includes('mouse') ||
    lower.includes('keyboard') ||
    lower.includes('power bank')
  ) {
    category = 'Accessories';
  } else if (
    lower.includes(' tv') ||
    lower.includes('smart tv') ||
    lower.includes('television') ||
    lower.includes('qled') ||
    lower.includes('oled tv') ||
    lower.includes('4k tv')
  ) {
    // TV intent → route to guided advisor for product discovery
    return { isGreeting: false, intent: 'guided_advisor', reply: '' };
  } else if (
    lower.includes('tablet') ||
    lower.includes('ipad') ||
    lower.includes('android tablet')
  ) {
    // Tablet intent → route to guided advisor for product discovery
    return { isGreeting: false, intent: 'guided_advisor', reply: '' };
  }

  let minPrice: number | undefined;
  let maxPrice: number | undefined;
  let sortByPrice: 'asc' | 'desc' | undefined;
  let brands: string[] | undefined = BRANDS.filter((brand) =>
    new RegExp(`\\b${brand.name.toLowerCase()}\\b`).test(lower),
  ).map((brand) => brand.name);
  if (brands.length === 0) brands = undefined;

  if (!category && brands?.length === 1) {
    category = BRANDS.find((brand) => brand.name === brands?.[0])?.category;
  }

  if (
    lower.includes('premium') ||
    lower.includes('flagship') ||
    lower.includes('high end') ||
    lower.includes('high-end') ||
    lower.includes('luxury') ||
    lower.includes('top of the line') ||
    lower.includes('best') ||
    lower.includes('expensive')
  ) {
    if (category === 'Mobiles') {
      minPrice = 60000;
      brands = ['Apple', 'Samsung', 'Google'];
    } else if (category === 'Laptops') {
      minPrice = 80000;
      brands = ['Apple', 'Dell', 'HP'];
    } else if (category === 'Audio') {
      minPrice = 15000;
      brands = ['Sony', 'Apple', 'Bose'];
    } else if (category === 'Cameras') {
      minPrice = 50000;
    } else {
      minPrice = 30000;
    }
    sortByPrice = 'desc';
  } else if (
    lower.includes('budget') ||
    lower.includes('cheap') ||
    lower.includes('affordable') ||
    lower.includes('value for money') ||
    lower.includes('low price') ||
    lower.includes('economical') ||
    lower.includes('inexpensive')
  ) {
    if (category === 'Mobiles') {
      maxPrice = 25000;
    } else if (category === 'Laptops') {
      maxPrice = 50000;
    } else if (category === 'Audio') {
      maxPrice = 5000;
    } else if (category === 'Cameras') {
      maxPrice = 30000;
    } else {
      maxPrice = 15000;
    }
    sortByPrice = 'asc';
  } else if (
    lower.includes('mid range') ||
    lower.includes('mid-range') ||
    lower.includes('midrange') ||
    lower.includes('moderate')
  ) {
    if (category === 'Mobiles') {
      minPrice = 25000;
      maxPrice = 60000;
    } else if (category === 'Laptops') {
      minPrice = 50000;
      maxPrice = 80000;
    } else if (category === 'Audio') {
      minPrice = 5000;
      maxPrice = 15000;
    } else {
      minPrice = 15000;
      maxPrice = 40000;
    }
  }

  const toPrice = (value: string, unit?: string) => {
    let amount = parseFloat(value.replace(/,/g, ''));
    const normalizedUnit = unit?.toLowerCase();
    if (normalizedUnit === 'k' || normalizedUnit === 'thousand') amount *= 1000;
    if (['lakh', 'lakhs', 'lac', 'lacs', 'l'].includes(normalizedUnit ?? '')) {
      amount *= 100000;
    }
    return Math.round(amount);
  };

  const matchBelow = lower.match(
    /(?:under|below|less than|<)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac|lacs|l)?/,
  );
  if (matchBelow) maxPrice = toPrice(matchBelow[1], matchBelow[2]);

  const matchAbove = lower.match(
    /(?:above|over|more than|starting|from)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac|lacs|l)?/,
  );
  if (matchAbove) minPrice = toPrice(matchAbove[1], matchAbove[2]);

  let keyword: string | undefined;
  const keywordPatterns = [
    /(?:galaxy\s*)(s\d+[\w\s]*(?:ultra|plus|fe)?)/i,
    /(?:iphone\s*)(\d+[\w\s]*(?:pro|max|plus)?)/i,
    /(?:pixel\s*)(\d+[\w\s]*(?:pro|a)?)/i,
    /(?:macbook\s*)(air|pro[\w\s]*(?:m\d)?)/i,
    /(?:redmi|poco|oneplus|realme|vivo|oppo)\s+([\w\d]+[\w\s]*)/i,
  ];

  for (const pattern of keywordPatterns) {
    const match = lower.match(pattern);
    if (match) {
      keyword = match[0].trim();
      break;
    }
  }

  if (!keyword) {
    const intentMatch = lower.match(
      /(?:show me|find|search|looking for|i want|buy|get me|need)\s+(?:a |an |some |the )?(.+?)(?:\s+under|\s+below|\s+above|\s+from|$)/,
    );
    if (intentMatch) {
      const extracted = intentMatch[1].trim();
      const genericTerms = [
        'product',
        'products',
        'anything',
        'mobile',
        'mobiles',
        'phone',
        'phones',
        'laptop',
        'laptops',
        'headphone',
        'headphones',
        'camera',
        'cameras',
        'accessories',
        'tv',
        'tablet',
        'tablets',
      ];
      if (!genericTerms.includes(extracted) && extracted.length > 2) {
        keyword = extracted;
      }
    }
  }

  if (!category && !maxPrice && !minPrice && !brands && !keyword) {
    return { isGreeting: false, intent: 'unknown', reply: '' };
  }

  return {
    isGreeting: false,
    intent: 'product_search',
    category,
    maxPrice,
    minPrice,
    keyword,
    brands,
    sortByPrice,
    reply: '',
  };
}

function buildSystemContext(
  userId: number | null,
  userContext: UserContext,
): string {
  if (userId && userContext.name) {
    return `You are a friendly AI shopping assistant for ShopNow, talking to ${userContext.name}. 
       Their interests: ${userContext.interests?.join(', ') || 'general electronics'}.
       Recent orders: ${userContext.recentOrders?.map((o) => `Order #${o.id} (${o.status}) - ₹${o.totalAmount}`).join(', ') || 'none'}.
       Last shipping address: ${userContext.lastAddress ? JSON.stringify(userContext.lastAddress) : 'not available'}.
       Use their name, reference their orders when relevant.`;
  }
  return `You are a friendly AI shopping assistant for ShopNow, talking to a guest user.`;
}

async function classifyIntent(
  message: string,
  systemContext: string,
  history?: Array<{ role: string; content: string }>,
): Promise<ParsedIntent> {
  const provider = getAIProvider();

  const historyContext = history?.length
    ? `\nRecent conversation:\n${history
        .slice(-4)
        .map((h) => `${h.role}: ${h.content.slice(-500)}`)
        .join('\n')}\n`
    : '';

  const prompt = `${systemContext}
${historyContext}
User message: "${message}"

Analyze intent: greeting, orders, address, product_search, bundle_advisor, top_picks, popular_products, add_to_cart, gaming_build, compare, or unknown.
- For greetings: write a warm personalised welcome using their name if available, mention their interests.
- For orders: summarise their recent order history. If user mentions return/refund/exchange, still classify as orders.
- For address: show/confirm their last shipping address.
- For add_to_cart: ONLY when user explicitly says "add to cart". NOT when they say "I want to buy X" (that's product_search).
- For popular_products: when user asks about "what's popular", "trending", "bestsellers", "most reviewed", "deals", "flash sale", "offers", "on sale" in a general sense.
- For compare: when user says "compare X vs Y", "X versus Y", "difference between X and Y". Extract both product names.
- For gaming_build: when user wants to BUILD or ASSEMBLE a gaming PC, mentions "gaming rig", "gaming build", "PC build", "build my PC", asks about compatible parts.
  Example: "build me a gaming PC for 80k" → gaming_build
  Example: "I want to assemble a gaming rig" → gaming_build
  IMPORTANT: "gaming" ALONE does NOT trigger gaming_build. "I want a gaming laptop" → product_search with category=Laptops.
- For bundle_advisor: when user mentions a PERSONA (student, professional, creator, work from home) AND wants a complete setup/recommendations. NOT for gaming PC builds. NOT for "gaming" alone.
- For product_search: extract category, maxPrice, minPrice, keyword, brands, sortByPrice, sortByRating.
  * category: one of Mobiles, Laptops, Accessories, Audio, Cameras
  * TV / Smart TV queries → classify as guided_advisor intent (not product_search)
  * maxPrice: upper price limit in INR (number)
  * minPrice: lower price limit in INR (number)
  * keyword: THE SPECIFIC product model or name. CRITICAL.
    - "I want to buy Galaxy S22" → keyword: "Galaxy S22"
    - "show me iPhone 15 Pro" → keyword: "iPhone 15 Pro"
    - "MacBook Air M2" → keyword: "MacBook Air M2"
    - "show me mobiles" → keyword: null (generic)
  * brands: array of brand names (e.g. ["Apple", "Samsung"])
    - Extract brand from context: "Galaxy S22" → brands: ["Samsung"]
  * sortByPrice: "asc" for cheapest first, "desc" for most expensive first
  * sortByRating: true when user asks for "best rated", "top rated", "highest rated"

  IMPORTANT clarification rule: if message only gives budget with no category/brand/keyword:
  - classify as product_search, extract price, set category/keyword null

  IMPORTANT price tier rules for Indian market:
  - "premium", "flagship", "high-end" → set minPrice high, sortByPrice: "desc"
  - "budget", "cheap", "affordable" → set maxPrice low, sortByPrice: "asc"
  - "mid-range", "moderate" → set both minPrice and maxPrice

- For unknown: ask a helpful clarifying question.

Always write a natural, friendly conversational reply.`;

  try {
    const result = await provider.generateStructuredJSON(
      prompt,
      INTENT_SCHEMA,
      {
        maxOutputTokens: 512,
      },
    );
    return result as unknown as ParsedIntent;
  } catch (error) {
    console.warn(
      '[RouterAgent] AI provider failed, using local fallback:',
      error,
    );
    return localFallbackParse(message, history);
  }
}

export class RouterAgent {
  async classifyIntent(ctx: AgentContext): Promise<ParsedIntent> {
    const systemContext = buildSystemContext(ctx.userId, ctx.userContext);

    // Fast deterministic local intent parse
    const local = localFallbackParse(ctx.message, ctx.history);
    if (
      local.intent === 'guided_advisor' ||
      local.intent === 'gaming_build' ||
      local.intent === 'greeting' ||
      local.intent === 'add_to_cart' ||
      local.intent === 'orders' ||
      local.intent === 'address' ||
      local.intent === 'compare' ||
      local.intent === 'popular_products'
    ) {
      return local;
    }

    if (
      local.intent === 'product_search' &&
      (local.category ||
        local.keyword ||
        local.brands?.length ||
        local.minPrice != null ||
        local.maxPrice != null ||
        local.sortByPrice ||
        local.sortByRating)
    ) {
      return local;
    }

    // Call LLM for open-ended product search / complex intent classification
    const llmParsed = await classifyIntent(
      ctx.message,
      systemContext,
      ctx.history,
    );

    // If local detected guided advisor or gaming build triggers, override LLM
    if (local.intent === 'guided_advisor' || local.intent === 'gaming_build') {
      return local;
    }

    return llmParsed;
  }
}
