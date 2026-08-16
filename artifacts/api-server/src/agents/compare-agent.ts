import { getAIProvider, type StructuredSchema } from './ai-provider.js';

export interface CompareFeature {
  label: string;
  icon: string;
  values: string[];
  winner?: number;
  higherIsBetter?: boolean;
}

export interface CompareResult {
  summary: string;
  features: CompareFeature[];
  followUpQuestions: string[];
  verdict?: string;
}

export interface RecommendResult {
  bestProductIndex: number;
  reason: string;
  alternativeNote?: string;
}

const COMPARE_SCHEMA: StructuredSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    features: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          icon: { type: 'string' },
          values: { type: 'array', items: { type: 'string' } },
          winner: { type: 'number' },
          higherIsBetter: { type: 'boolean' },
        },
      },
    },
    followUpQuestions: { type: 'array', items: { type: 'string' } },
  },
};

const RECOMMEND_SCHEMA: StructuredSchema = {
  type: 'object',
  properties: {
    bestProductIndex: { type: 'number' },
    reason: { type: 'string' },
    alternativeNote: { type: 'string' },
  },
};

function formatProductSpecs(specsRaw: any): string {
  if (!specsRaw) return 'N/A';
  if (typeof specsRaw === 'object') {
    return Object.entries(specsRaw)
      .filter(([k, v]) => v != null && v !== '' && typeof v !== 'object')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }
  try {
    const parsed = JSON.parse(specsRaw);
    if (typeof parsed === 'object' && parsed !== null) {
      return Object.entries(parsed)
        .filter(([k, v]) => v != null && v !== '' && typeof v !== 'object')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    }
  } catch {}
  return String(specsRaw);
}

function parseSpecsObject(specsRaw: any): Record<string, string> {
  if (!specsRaw) return {};
  if (typeof specsRaw === 'object') return specsRaw;
  try {
    const parsed = JSON.parse(specsRaw);
    if (typeof parsed === 'object' && parsed !== null) {
      const res: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v != null && typeof v !== 'object') {
          res[k] = String(v);
        }
      }
      return res;
    }
  } catch {}
  return {};
}

export async function compareProducts(products: any[]): Promise<CompareResult> {
  const provider = getAIProvider();

  const productSummaries = products.map(
    (p, i) =>
      `Product ${i + 1}: ${p.name}
Category: ${p.category || 'General'}
Brand: ${p.brand || 'Unknown'}
Price: ₹${Math.round(parseFloat(p.price)).toLocaleString()}
Original Price: ${p.originalPrice ? `₹${Math.round(parseFloat(p.originalPrice)).toLocaleString()}` : 'N/A'}
Discount: ${p.discountPct || 0}%
Rating: ${p.rating} / 5 (${p.reviewCount || 0} reviews)
Specifications:
${formatProductSpecs(p.specs)}`,
  );

  const prompt = `You are an expert product advisor for an Indian electronics e-commerce store.

Compare these ${products.length} products and return structured JSON.

Products:
${productSummaries.join('\n\n')}

Return JSON with this exact schema:
{
  "summary": "Clear, informative 1-2 sentence overview comparing key differences and ideal user for each",
  "features": [
    {
      "label": "Feature name (e.g. Price, Processor / CPU, RAM & Storage, Display, Camera / Battery, Brand, Value)",
      "icon": "Single relevant emoji (e.g. 💰, ⚡, 💾, 📱, 📷, 🔋, 🏢, ⭐)",
      "values": ["value for product 1", "value for product 2", ...],
      "winner": 0,
      "higherIsBetter": true
    }
  ],
  "followUpQuestions": [
    "Question 1 relevant to help choose between these products (e.g. primary use case)",
    "Question 2 (e.g. specific feature preference)",
    "Question 3 (e.g. budget flexibility)"
  ]
}

Rules:
- Include 5-8 informative features comparing actual specs (CPU, RAM, GPU/Graphics, Screen/Display, Storage, Camera, Battery, Build, Price, Rating).
- winner: 0-based index of the product that wins that feature, -1 for tie/not applicable
- higherIsBetter: true if a higher value is better for this feature (false for Price, Weight)
- followUpQuestions: 3 smart questions to help narrow down the best choice for the user.
- Keep feature values concise and descriptive (under 40 chars each)
- Respond ONLY with valid JSON, no markdown`;

  try {
    const json = await provider.generateStructuredJSON(prompt, COMPARE_SCHEMA);
    if (json.features && Array.isArray(json.features) && json.features.length >= 3) {
      return {
        summary: json.summary || `Comparing ${products.map(p => p.name).join(' vs ')}`,
        features: json.features,
        followUpQuestions: json.followUpQuestions || [
          'What is your primary use case?',
          'What is your target budget?',
          'Do you have a specific brand preference?',
        ],
      };
    }
    return buildFallbackComparison(products);
  } catch (err) {
    console.error('compareProducts error:', err);
    return buildFallbackComparison(products);
  }
}

export async function recommendProduct(
  products: any[],
  userAnswers: string,
): Promise<RecommendResult> {
  const provider = getAIProvider();

  const productSummaries = products.map(
    (p, i) =>
      `Product ${i + 1}: ${p.name} — ₹${Math.round(parseFloat(p.price)).toLocaleString()} — Rating: ${p.rating} — ${formatProductSpecs(p.specs)}`,
  );

  const prompt = `You are an expert product advisor. Based on user preferences, pick the best product.

Products:
${productSummaries.join('\n')}

User preferences/answers: "${userAnswers}"

Return JSON:
{
  "bestProductIndex": 0,
  "reason": "Clear 2-sentence reason why this product fits the user best",
  "alternativeNote": "Optional note about when another product might be better"
}

bestProductIndex is 0-based. Respond ONLY with valid JSON.`;

  try {
    const json = await provider.generateStructuredJSON(prompt, RECOMMEND_SCHEMA);
    return {
      bestProductIndex: json.bestProductIndex ?? 0,
      reason: json.reason || '',
      alternativeNote: json.alternativeNote,
    };
  } catch {
    return {
      bestProductIndex: 0,
      reason: 'Based on your requirements, this product is the best fit.',
    };
  }
}

function buildFallbackComparison(products: any[]): CompareResult {
  const prices = products.map((p) => parseFloat(p.price));
  const minPriceIdx = prices.indexOf(Math.min(...prices));
  const ratings = products.map((p) => parseFloat(p.rating || '0'));
  const maxRatingIdx = ratings.indexOf(Math.max(...ratings));
  const discounts = products.map((p) => p.discountPct || 0);
  const maxDiscountIdx = discounts.indexOf(Math.max(...discounts));

  const parsedSpecsList = products.map(p => parseSpecsObject(p.specs));

  // Collect all unique spec keys across products
  const allSpecKeys = new Set<string>();
  parsedSpecsList.forEach(specs => {
    Object.keys(specs).forEach(k => allSpecKeys.add(k));
  });

  const specFeatures: CompareFeature[] = [];
  const keyIcons: Record<string, string> = {
    processor: '⚡',
    cpu: '⚡',
    ram: '💾',
    memory: '💾',
    storage: '💽',
    graphics: '🎮',
    gpu: '🎮',
    display: '🖥️',
    screen: '🖥️',
    battery: '🔋',
    camera: '📷',
    socket: '🔌',
    wattage: '⚡',
    formfactor: '📐',
  };

  allSpecKeys.forEach(key => {
    const values = parsedSpecsList.map(specs => specs[key] || 'N/A');
    if (values.some(v => v !== 'N/A')) {
      const lowerKey = key.toLowerCase();
      const matchedIconKey = Object.keys(keyIcons).find(ik => lowerKey.includes(ik));
      specFeatures.push({
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
        icon: matchedIconKey ? keyIcons[matchedIconKey] : '⚙️',
        values,
        winner: -1,
      });
    }
  });

  const baseFeatures: CompareFeature[] = [
    {
      label: 'Price',
      icon: '💰',
      values: prices.map((p) => `₹${Math.round(p).toLocaleString()}`),
      winner: minPriceIdx,
      higherIsBetter: false,
    },
    {
      label: 'Rating',
      icon: '⭐',
      values: ratings.map((r) => `${r} / 5`),
      winner: maxRatingIdx,
      higherIsBetter: true,
    },
    {
      label: 'Discount',
      icon: '🏷️',
      values: discounts.map((d) => `${d}% off`),
      winner: maxDiscountIdx,
      higherIsBetter: true,
    },
    {
      label: 'Brand',
      icon: '🏢',
      values: products.map((p) => p.brand || 'Unknown'),
      winner: -1,
    },
  ];

  return {
    summary: `Comparing ${products.map(p => p.name).join(' vs ')} across pricing, ratings, and detailed specifications.`,
    features: [...baseFeatures, ...specFeatures.slice(0, 6)],
    followUpQuestions: [
      'What is your primary use case for this device?',
      'What is your target budget range?',
      'Do you prefer higher performance or better value for money?',
    ],
  };
}

