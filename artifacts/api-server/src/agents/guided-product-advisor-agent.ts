import { db, productsTable } from '@workspace/db';
import { and, eq, lte, gte, ilike, sql } from 'drizzle-orm';
import type {
  Agent,
  AgentContext,
  AgentResponse,
  ParsedIntent,
} from './types.js';

interface ConsultationState {
  category: string | null;
  useCase: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  brand: string | null;
}

// Helper to detect category from text
function detectCategory(text: string): string | null {
  const t = text.toLowerCase();
  if (
    /\b(mobil|mobile|phone|handset|smartphone|cellular|iphone|galaxy|redmi|realme|oneplus|vivo|oppo)\b/.test(
      t,
    )
  ) {
    return 'Mobiles';
  }
  if (/laptop|notebook|macbook|thinkpad|zenbook|pavilion|inspiron/.test(t)) {
    return 'Laptops';
  }
  if (
    /headphone|headset|earphone|earbud|airpod|audio|speaker|neckband|tws|soundbar/.test(
      t,
    )
  ) {
    return 'Audio';
  }
  if (/camera|dslr|mirrorless|camcorder|gopro|vlog/.test(t)) {
    return 'Cameras';
  }
  if (/mouse|keyboard|charger|powerbank|monitor|hub|cable|accessory/.test(t)) {
    return 'Accessories';
  }
  // TV & Smart Display detection
  if (
    /\btv\b|smart tv|television|qled|oled tv|4k tv|led tv|smart display/.test(t)
  ) {
    return 'TV';
  }
  // Tablet detection
  if (/\btablet\b|ipad|android tablet|fire tablet/.test(t)) {
    return 'Tablets';
  }
  return null;
}

// Helper to detect use-case from text
function detectUseCase(text: string, category: string | null): string | null {
  const t = text.toLowerCase();

  if (category === 'Mobiles') {
    if (/photo|camera|vlog|video|snap|shot/.test(t))
      return 'Photography & Vlogging';
    if (/game|gaming|pubg|fps|performance|speed/.test(t))
      return 'Gaming & High Performance';
    if (/battery|mah|long|charging|backup/.test(t)) return 'Long Battery Life';
    if (/work|office|business|email|call/.test(t))
      return 'Business & Office Work';
    if (/budget|cheap|low price|everyday|basic|daily/.test(t))
      return 'Everyday Budget Use';
  }

  if (category === 'Laptops') {
    if (
      /code|coding|programming|developer|student|study|college|school|office/.test(
        t,
      )
    )
      return 'Coding & Student Work';
    if (/game|gaming|graphics|rtx|gpu/.test(t)) return 'High-End Gaming';
    if (/edit|editing|video|design|render|3d|photoshop/.test(t))
      return 'Video Editing & Design';
    if (/travel|portable|light|business|slim/.test(t))
      return 'Business & Travel';
  }

  if (category === 'Audio') {
    if (/noise|anc|quiet|silence|cancelling/.test(t))
      return 'Active Noise Cancelling';
    if (/gym|sport|run|workout|fit|sweat/.test(t))
      return 'Gym & Sports Wireless';
    if (/game|gaming|latency|spatial/.test(t)) return 'Low-Latency Gaming';
    if (/call|office|mic|meeting|work/.test(t)) return 'Clear Work Calls';
  }

  if (category === 'Cameras') {
    if (/vlog|youtube|creator|stream/.test(t)) return 'Vlogging & YouTube';
    if (/travel|landscape|outdoor|nature/.test(t)) return 'Travel & Landscape';
    if (/portrait|studio|wedding|photo/.test(t)) return 'Studio & Portraits';
    if (/compact|point|shoot|everyday/.test(t)) return 'Compact Everyday Shoot';
  }

  if (category === 'TV') {
    if (/movie|film|cinema|streaming|netflix|disney/.test(t))
      return 'Movies & Streaming';
    if (/game|gaming|ps5|xbox|console/.test(t)) return 'Gaming Console Setup';
    if (/bedroom|small|compact/.test(t)) return 'Bedroom / Small Room';
    if (/living room|large|big screen|home theatre/.test(t))
      return 'Living Room & Home Theatre';
  }

  if (category === 'Tablets') {
    if (/student|study|note|learn|school/.test(t))
      return 'Students & Note-Taking';
    if (/draw|artist|art|sketch|stylus/.test(t)) return 'Digital Art & Drawing';
    if (/travel|portable|light|compact/.test(t)) return 'Travel & Portability';
    if (/video|stream|media|entertainment|netflix/.test(t))
      return 'Media & Entertainment';
  }

  return null;
}

// Helper to extract budget from text
function extractBudgetRange(text: string): {
  min: number | null;
  max: number | null;
} {
  const t = text.toLowerCase();

  const parseAmount = (value: string, unit?: string) => {
    let amount = parseFloat(value.replace(/,/g, ''));
    const normalizedUnit = unit?.toLowerCase();
    if (normalizedUnit === 'k' || normalizedUnit === 'thousand') amount *= 1000;
    if (['lakh', 'lakhs', 'lac', 'lacs', 'l'].includes(normalizedUnit ?? '')) {
      amount *= 100000;
    }
    return Math.round(amount);
  };

  const minimumMatch = t.match(
    /(?:above|over|more than|starting|from)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac|lacs|l)?/i,
  );
  if (minimumMatch) {
    return { min: parseAmount(minimumMatch[1], minimumMatch[2]), max: null };
  }

  const numMatch = t.match(
    /(?:under|below|less than|within|around|₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(k|lakh|lakhs|lac|lacs|l)?/i,
  );

  let amount: number | null = null;
  if (numMatch) {
    const raw = numMatch[1].replace(/,/g, '');
    let val = parseFloat(raw);
    if (!isNaN(val) && val > 0) {
      const suffix = (numMatch[2] ?? '').toLowerCase();
      if (suffix === 'k') val *= 1000;
      else if (['lakh', 'lakhs', 'lac', 'lacs', 'l'].includes(suffix))
        val *= 100000;
      else if (val > 0 && val <= 15) val *= 100000;
      else if (val > 15 && val <= 500 && !raw.includes('.')) val *= 1000;
      amount = Math.round(val);
    }
  }

  if (/under 15|below 15|15k|15,000/.test(t)) return { min: 0, max: 15000 };
  if (/15.*30|15k.*30k|15,000.*30,000/.test(t))
    return { min: 15000, max: 30000 };
  if (/30.*60|30k.*60k|30,000.*60,000/.test(t))
    return { min: 30000, max: 60000 };
  if (/premium|above 60|60k\+|over 60/.test(t))
    return { min: 60000, max: 300000 };

  if (/under 40|below 40|40k|40,000/.test(t)) return { min: 0, max: 40000 };
  if (/40.*70|40k.*70k|40,000.*70,000/.test(t))
    return { min: 40000, max: 70000 };
  if (/70.*120|70k.*120k|70,000.*1,20,000/.test(t))
    return { min: 70000, max: 120000 };

  // TV-specific budget ranges
  if (/under 20|below 20|20k|20,000/.test(t)) return { min: 0, max: 20000 };
  if (/20.*40|20k.*40k/.test(t)) return { min: 20000, max: 40000 };
  if (/40.*80|40k.*80k/.test(t)) return { min: 40000, max: 80000 };

  if (amount) {
    return { min: 0, max: amount };
  }

  return { min: null, max: null };
}

// Helper to extract brand from text
function extractBrand(text: string): string | null {
  const t = text.toLowerCase();
  const brands = [
    'Samsung',
    'Apple',
    'OnePlus',
    'Xiaomi',
    'Realme',
    'Motorola',
    'Redmi',
    'Vivo',
    'Oppo',
    'Sony',
    'Dell',
    'HP',
    'Lenovo',
    'Asus',
    'Adata',
    'Corsair',
    'Crucial',
    'Lian Li',
    'NZXT',
    'LG',
    'TCL',
    'MI',
    'Hisense',
  ];
  for (const b of brands) {
    if (t.includes(b.toLowerCase())) return b;
  }
  return null;
}

// Extract consultation state across turns
function extractConsultationState(
  history: Array<{ role: string; content: string }> | undefined,
  currentMessage: string,
  parsed: ParsedIntent,
): ConsultationState {
  const historyText = (history || []).map((h) => h.content).join(' ');
  const combined = `${historyText} ${currentMessage}`;

  // 1. Detect Category — prioritize history category if established
  let category =
    detectCategory(historyText) ||
    parsed.category ||
    detectCategory(currentMessage) ||
    detectCategory(combined);

  // 2. Detect Use Case — pass category context
  let useCase =
    detectUseCase(currentMessage, category) ||
    detectUseCase(combined, category);

  // 3. Extract Budget Range
  let { min: budgetMin, max: budgetMax } = extractBudgetRange(currentMessage);
  if (!budgetMax) {
    const historicalBudget = extractBudgetRange(combined);
    budgetMin = historicalBudget.min;
    budgetMax = historicalBudget.max;
  }

  // 4. Extract Brand
  let brand = extractBrand(currentMessage) || extractBrand(combined);

  return { category, useCase, budgetMin, budgetMax, brand };
}

// ── Category-specific out-of-stock / not-in-catalog helper ───────────────────
function buildNotFoundResponse(
  category: string | null,
  useCase: string | null,
): AgentResponse {
  // TV and Tablet are not yet in catalog — provide friendly redirect
  if (category === 'TV') {
    return {
      reply:
        `⚠️ **Smart TVs** are not yet in our current catalog — we're adding them soon!\n\n` +
        `In the meantime, can I help you find something similar?\n` +
        `- 🖥️ **High-Resolution Monitors** for a great viewing experience\n` +
        `- 💻 **Laptops with large displays** for media consumption\n` +
        `- 🎧 **Soundbars & Audio** for an immersive home theatre sound`,
      products: [],
      orders: [],
      followUp: [
        'Show me monitors',
        'Show me laptops',
        'Show premium audio',
        'What else is trending?',
      ],
      userContext: null,
    };
  }

  if (category === 'Tablets') {
    return {
      reply:
        `⚠️ **Tablets & iPads** are not yet in our current catalog — coming soon!\n\n` +
        `Looking for portable computing? Here are great alternatives:\n` +
        `- 💻 **Ultrabook Laptops** — lightweight and powerful\n` +
        `- 📱 **Premium Smartphones** — large screen productivity on the go`,
      products: [],
      orders: [],
      followUp: [
        'Show me ultrabook laptops',
        'Show me premium phones',
        'What is trending?',
      ],
      userContext: null,
    };
  }

  return {
    reply:
      `⚠️ We currently don't have matching **${category ?? 'product'}** items in stock within that exact filter.\n\n` +
      `Would you like to explore another category or broaden your budget?`,
    products: [],
    orders: [],
    followUp: ['Show All Mobiles', 'Show All Laptops', 'Build a Gaming PC'],
    userContext: null,
  };
}

export class GuidedProductAdvisorAgent implements Agent {
  name = 'GuidedProductAdvisorAgent';

  async execute(
    ctx: AgentContext,
    parsed: ParsedIntent,
  ): Promise<AgentResponse> {
    const { message, history = [] } = ctx;
    const state = extractConsultationState(history, message, parsed);

    // ── STEP 1: Category Selection (if category is unknown) ─────────────────
    if (!state.category) {
      return {
        reply:
          `🎯 **I'd love to help you choose the right electronics!**\n\n` +
          `Which product category are you shopping for today?`,
        products: [],
        orders: [],
        followUp: [
          '📱 Mobiles & Smartphones',
          '💻 Laptops',
          '🎧 Headphones & Audio',
          '📷 Cameras',
          '📺 TV & Smart Displays',
          '📋 Tablets & iPads',
        ],
        userContext: null,
      };
    }

    // ── Early exit for TV / Tablet (not in catalog) ──────────────────────────
    if (state.category === 'TV' || state.category === 'Tablets') {
      // If use case already asked, return not-found response
      if (state.useCase) {
        return buildNotFoundResponse(state.category, state.useCase);
      }
    }

    // ── STEP 2: Primary Use Case / Need (if use-case is missing) ────────────
    if (!state.useCase) {
      let prompt = '';
      let chips: string[] = [];

      switch (state.category) {
        case 'Mobiles':
          prompt = `📱 **What is your primary use case for your new Mobile?**`;
          chips = [
            '📷 Photography & Vlogging',
            '🎮 Gaming & High Performance',
            '🔋 Long Battery Life',
            '💼 Business & Office Work',
            '💰 Everyday Budget Use',
          ];
          break;

        case 'Laptops':
          prompt = `💻 **What will you primarily use your new Laptop for?**`;
          chips = [
            '🎓 Coding & Student Work',
            '🎮 High-End Gaming',
            '🎬 Video Editing & Design',
            '✈️ Business & Travel',
          ];
          break;

        case 'Audio':
          prompt = `🎧 **What sound experience are you looking for in Headphones/Audio?**`;
          chips = [
            '🎧 Active Noise Cancelling',
            '🏋️ Gym & Sports Wireless',
            '🎮 Low-Latency Gaming',
            '📞 Clear Work Calls',
          ];
          break;

        case 'Cameras':
          prompt = `📷 **What type of photography will you primarily do?**`;
          chips = [
            '🎬 Vlogging & YouTube',
            '🏔️ Travel & Landscape',
            '📸 Studio & Portraits',
            '⚡ Compact Everyday Shoot',
          ];
          break;

        case 'TV':
          prompt = `📺 **What will you primarily use your new TV for?**`;
          chips = [
            '🎬 Movies & Streaming',
            '🎮 Gaming Console Setup',
            '🛋️ Bedroom / Small Room',
            '🏠 Living Room & Home Theatre',
          ];
          break;

        case 'Tablets':
          prompt = `📋 **What will you primarily use your Tablet for?**`;
          chips = [
            '🎓 Students & Note-Taking',
            '🎨 Digital Art & Drawing',
            '✈️ Travel & Portability',
            '🎬 Media & Entertainment',
          ];
          break;

        default:
          prompt = `⚙️ **What is your primary requirement for your ${state.category}?**`;
          chips = [
            '🔥 Top Rated Performance',
            '💰 Best Value for Money',
            '⭐ Premium Quality',
          ];
          break;
      }

      return {
        reply:
          prompt +
          `\n\nSelect an option below or tell me what features matter most to you!`,
        products: [],
        orders: [],
        followUp: chips,
        userContext: null,
      };
    }

    // ── Early exit for TV/Tablet after use-case collected ─────────────────────
    if (state.category === 'TV' || state.category === 'Tablets') {
      return buildNotFoundResponse(state.category, state.useCase);
    }

    // ── STEP 3: Target Budget Range (if budget is missing) ───────────────────
    if (state.budgetMin == null && state.budgetMax == null) {
      let prompt = `💰 **What is your target budget for your ${state.useCase} ${state.category}?**`;
      let chips: string[] = [];

      if (state.category === 'Mobiles') {
        chips = [
          'Under ₹15,000',
          '₹15,000 - ₹30,000',
          '₹30,000 - ₹60,000',
          'Premium ₹60,000+',
        ];
      } else if (state.category === 'Laptops') {
        chips = [
          'Under ₹40,000',
          '₹40,000 - ₹70,000',
          '₹70,000 - ₹1,20,000',
          'Premium ₹1,20,000+',
        ];
      } else if (state.category === 'Cameras') {
        chips = [
          'Under ₹30,000',
          '₹30,000 - ₹60,000',
          '₹60,000 - ₹1,20,000',
          'Premium ₹1,20,000+',
        ];
      } else {
        chips = [
          'Under ₹3,000',
          '₹3,000 - ₹8,000',
          '₹8,000 - ₹15,000',
          'Premium ₹15,000+',
        ];
      }

      return {
        reply:
          prompt +
          `\n\nTap a budget range below or type your specific budget (e.g. **"₹25,000"** or **"1.5 lakh"**).`,
        products: [],
        orders: [],
        followUp: chips,
        userContext: null,
      };
    }

    // ── STEP 4: Precision Database Query & #1 Best Recommendation ─────────────
    const conditions = [
      eq(productsTable.inStock, true),
      eq(productsTable.category, state.category),
    ];

    if (state.budgetMax) {
      conditions.push(lte(productsTable.price, String(state.budgetMax)));
    }
    if (state.budgetMin && state.budgetMin > 0) {
      conditions.push(gte(productsTable.price, String(state.budgetMin)));
    }
    if (state.brand) {
      conditions.push(ilike(productsTable.brand, `%${state.brand}%`));
    }

    let candidates = await db
      .select()
      .from(productsTable)
      .where(and(...conditions))
      .limit(20);

    // Fallback broadened search if zero matching within tight bounds
    if (candidates.length === 0 && state.budgetMax) {
      const broaderConditions = [
        eq(productsTable.inStock, true),
        eq(productsTable.category, state.category),
      ];
      candidates = await db
        .select()
        .from(productsTable)
        .where(and(...broaderConditions))
        .limit(20);
    }

    if (candidates.length === 0) {
      return buildNotFoundResponse(state.category, state.useCase);
    }

    // An explicit lower price bound signals a premium request, so surface the
    // highest-priced in-stock options first instead of defaulting to rating.
    const prefersPremium = state.budgetMin != null && state.budgetMax == null;
    candidates.sort((a, b) =>
      prefersPremium
        ? Number(b.price) - Number(a.price)
        : Number(b.rating) - Number(a.rating),
    );

    const bestMatch = candidates[0];
    const alternatives = candidates.slice(1, 3);

    const priceFormatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(Number(bestMatch.price));

    const originalPriceFormatted = bestMatch.originalPrice
      ? new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0,
        }).format(Number(bestMatch.originalPrice))
      : null;

    let markdownText = `## 🌟 #1 Recommended ${state.category}: **${bestMatch.name}**\n\n`;
    markdownText += `### 🎯 Why This Is Your Best Match:\n`;
    markdownText += `- ⚡ **Ideal for ${state.useCase}**: Optimized for performance and user rating (**${bestMatch.rating}/5** stars).\n`;
    markdownText += `- 💰 **Price & Value**: **${priceFormatted}**`;
    if (originalPriceFormatted) {
      markdownText += ` ~(${originalPriceFormatted})~ | **Save ${bestMatch.discountPct}% OFF**`;
    }
    markdownText += `\n`;
    markdownText += `- 🏷️ **Brand & Quality**: Authentic **${bestMatch.brand}** hardware with official warranty.\n\n`;

    if (alternatives.length > 0) {
      markdownText += `### 🛍️ Top Alternative Options:\n`;
      alternatives.forEach((alt, idx) => {
        const altPrice = new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0,
        }).format(Number(alt.price));
        markdownText += `${idx + 1}. **${alt.name}** — **${altPrice}** (Rated ${alt.rating}/5 ⭐)\n`;
      });
      markdownText += `\n`;
    }

    markdownText += `---\n✅ **Ready to order or customize?** Click **"Yes, add best match to cart"** or select an option below!`;

    const allProductCards = [bestMatch, ...alternatives].map((p) => ({
      ...p,
      price: Number(p.price),
      originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
      rating: Number(p.rating),
    }));

    return {
      reply: markdownText,
      products: allProductCards,
      orders: [],
      followUp: [
        'Yes, add best match to cart',
        'Show cheaper option',
        state.brand ? `Other brands` : `Filter by Samsung`,
        'Can I save with a coupon?',
      ],
      explanation: {
        why: [
          `Matches the requested ${state.category} category and ${state.useCase} goal.`,
          `Fits the stated budget${state.brand ? ` and ${state.brand} brand preference` : ''}.`,
          'Selected from products currently marked in stock in the catalog.',
        ],
        tradeoffs: [
          'The ranking uses catalog facts and rating confidence; it does not assume popularity means best fit.',
        ],
        source: 'catalog',
      },
      userContext: null,
    };
  }
}
