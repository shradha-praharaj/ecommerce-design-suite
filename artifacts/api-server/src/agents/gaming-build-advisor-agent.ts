/**
 * gaming-build-advisor-agent.ts
 *
 * Multi-turn chatbot agent that guides users through a gaming PC build brief,
 * calls the deterministic pc-builder service, shows the result with a coupon
 * quote, and requests one explicit confirmation before bulk-adding to cart.
 *
 * Conversation flow:
 *   1. Detect intent (budget, workload, display, streaming, brands)
 *   2. Ask one clarifying question per missing required field
 *   3. Once brief is complete → call buildGamingPc()
 *   4. Present result with compatibility note and coupon savings
 *   5. Wait for explicit "yes, add to cart" confirmation
 *   6. Return product list with add-to-cart capability
 */

import { db, cartItemsTable, productsTable } from '@workspace/db';
import { and, eq } from 'drizzle-orm';
import { buildGamingPc } from '../services/pc-builder.js';
import type { BuildBrief } from '../services/pc-builder.js';
import type {
  Agent,
  AgentContext,
  AgentResponse,
  ParsedIntent,
} from './types.js';
import {
  detectPCBuilderExpertise,
  getAdaptiveFollowUpForExpertise,
  getNextFieldForExpertise,
  type ExpertiseLevel,
} from './pc-builder-expertise.js';

// ─── Stockpile brand discovery helpers ──────────────────────────────────────

async function getInStockBrandsForComponent(
  componentType: string,
): Promise<string[]> {
  const rows = await db
    .select({ brand: productsTable.brand })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.department, 'Gaming'),
        eq(productsTable.componentType, componentType),
        eq(productsTable.inStock, true),
      ),
    );

  const brandSet = new Set<string>();
  for (const r of rows) {
    if (r.brand && r.brand.trim()) brandSet.add(r.brand.trim());
  }
  return Array.from(brandSet).sort();
}

function detectRequestedComponentType(text: string): string | null {
  const t = text.toLowerCase();
  if (
    /gpu|graphics card|card|5090|4090|4080|4070|7900|7800|radeon|geforce|rtx|gtx/.test(
      t,
    )
  ) {
    return 'Graphics Card';
  }
  if (
    /cpu|processor|ryzen|intel|threadripper|i7|i9|i5|i3|7800x3d|14900k/.test(t)
  ) {
    return 'Processor';
  }
  if (/motherboard|mb|board|b650|z790|b760|x670/.test(t)) {
    return 'Motherboard';
  }
  if (/case|cabinet|tower|chassis|lian li|nzxt|fractal/.test(t)) {
    return 'Case';
  }
  if (/cooler|liquid|aio|air cooler|fan/.test(t)) {
    return 'CPU Cooler';
  }
  if (/ram|memory|ddr4|ddr5/.test(t)) {
    return 'RAM';
  }
  if (/storage|ssd|nvme|hdd/.test(t)) {
    return 'Storage';
  }
  if (/psu|power supply|smps|watt/.test(t)) {
    return 'Power Supply';
  }
  return null;
}

// ─── Brief extraction helpers ─────────────────────────────────────────────────

function extractBudget(text: string): number | null {
  // Strip out model names/spec words that contain numbers (e.g. ryzen 5, core i7, rtx 4070, rx 7900, 1080p, 1440p, 4k, ddr5)
  // so hardware model numbers don't get misparsed as user budgets!
  const sanitized = text
    .replace(
      /(?:ryzen|core\s*i|rtx|gtx|rx|radeon|ddr|ghz|mhz|fps|hz|1080p|1440p|2160p|4k|2k)\s*\d+/gi,
      '',
    )
    .replace(/\b(i3|i5|i7|i9)\b/gi, '');

  // Look for explicit currency/budget pattern first
  const explicitMatch = sanitized.match(
    /(?:budget|spend|cost|₹|rs\.?|inr|under|below|around|approx|above|over|more than|starting|from)\s*:?\s*([\d,]+(?:\.\d+)?)\s*(k|lakh|lakhs|lac|lacs|l)?/i,
  );

  let match = explicitMatch;
  if (!match) {
    // Fallback: match standalone numbers like "60000", "1.5 lakh", "150000", "1 lakh"
    match =
      sanitized.match(/\b([\d,]+(?:\.\d+)?)\s*(k|lakh|lakhs|lac|lacs|l)\b/i) ||
      sanitized.match(/\b([\d,]{5,})\b/);
  }

  if (!match) return null;
  const rawNum = match[1].replace(/,/g, '');
  let amount = parseFloat(rawNum);
  if (isNaN(amount) || amount <= 0) return null;

  const suffix = (match[2] ?? '').toLowerCase();
  if (suffix === 'k') {
    amount *= 1000;
  } else if (['lakh', 'lakhs', 'lac', 'lacs', 'l'].includes(suffix)) {
    amount *= 100000;
  } else if (
    amount > 0 &&
    amount <= 15 &&
    (suffix === 'l' || explicitMatch || rawNum.includes('.'))
  ) {
    amount *= 100000;
  } else if (amount > 15 && amount <= 500 && !rawNum.includes('.')) {
    amount *= 1000;
  }

  return amount >= 20000 ? Math.round(amount) : null;
}

function hasMinimumBudgetRequest(text: string): boolean {
  return /\b(?:above|over|more than|starting from)\s*(?:₹|rs\.?|inr)?\s*[\d,.]+\s*(?:k|thousand|lakh|lakhs|lac|lacs|l)\b/i.test(
    text,
  );
}

function extractWorkload(text: string): BuildBrief['workload'] | null {
  const t = text.toLowerCase();
  if (/stream|broadcast|obs|📡/.test(t)) return 'streaming';
  if (/creat|video edit|render|3d|blender|premiere|🎬/.test(t))
    return 'creator';
  if (/workstation|cad|simulation|professional|heavy|💼/.test(t))
    return 'workstation';
  if (/game|gaming|play|fps|esport|🎮/.test(t)) return 'gaming';
  return null;
}

function extractDisplay(text: string): BuildBrief['targetDisplay'] | null {
  const t = text.toLowerCase();
  if (/4k|2160|🌟/.test(t)) return '4k60';
  if (/multi.?monitor|🖥/.test(t)) return '1440p144';
  if (/1440|2k|wqhd|🎯/.test(t)) return '1440p144';
  if (/1080p?|fhd|full.?hd|⚡/.test(t)) return '1080p144';
  return null;
}

// CPU preference — 'auto' means user said "decide for me"
function extractCpuPreference(text: string): 'AMD' | 'Intel' | 'auto' | null {
  const t = text.toLowerCase();
  if (
    /decide|you choose|let ai|auto|any|no preference|doesn.t matter|dont mind|don.t care|🤖/.test(
      t,
    )
  )
    return 'auto';
  if (/\bamd\b|ryzen|🔴/.test(t)) return 'AMD';
  if (/\bintel\b|core\s*i[3579]|🔵/.test(t)) return 'Intel';
  return null;
}

// GPU preference — 'auto' means user said "decide for me"
function extractGpuPreference(text: string): 'AMD' | 'Nvidia' | 'auto' | null {
  const t = text.toLowerCase();
  if (
    /decide|you choose|let ai|auto|any|no preference|doesn.t matter|dont mind|don.t care|🤖/.test(
      t,
    )
  )
    return 'auto';
  if (/\bamd\b|radeon|rx \d|🔴/.test(t)) return 'AMD';
  if (/nvidia|geforce|rtx|gtx|🟢/.test(t)) return 'Nvidia';
  return null;
}

// Legacy helpers (kept for post-build swap commands)
function extractCpuBrand(text: string): 'AMD' | 'Intel' | null {
  if (/\bamd\b|ryzen/.test(text.toLowerCase())) return 'AMD';
  if (/\bintel\b|core\s*i[3579]/.test(text.toLowerCase())) return 'Intel';
  return null;
}

function extractGpuBrand(text: string): 'AMD' | 'Nvidia' | null {
  if (/\bamd\b|radeon/.test(text.toLowerCase())) return 'AMD';
  if (/nvidia|geforce|rtx|gtx/.test(text.toLowerCase())) return 'Nvidia';
  return null;
}

// ─── Confirmation detection ───────────────────────────────────────────────────

function isConfirmation(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    t.includes('yes') ||
    t.includes('add') ||
    t.includes('confirm') ||
    t.includes('go ahead') ||
    t.includes('do it') ||
    t.includes('proceed') ||
    t === 'ok' ||
    t === 'okay' ||
    t === 'sure' ||
    t === 'yep' ||
    t === 'yup'
  );
}

// ─── Build brief from conversation history ────────────────────────────────────
// Marks a request to start a fresh build, e.g. "build a pc for my son".
// Follow-up answers and tweaks ("show cheaper build") must not match.
function isBuildInitiation(text: string): boolean {
  return (
    /\b(?:build|assemble|configure|make)\b[^.?!]{0,40}\b(?:pc|computer|rig|desktop)\b/i.test(
      text,
    ) ||
    /\b(?:pc build|pc builder|gaming rig)\b/i.test(text) ||
    /\b(?:suggest|recommend)\b[^.?!]{0,30}\bpc\b/i.test(text)
  );
}
interface PartialBrief {
  budget?: number;
  minimumBudget?: boolean;
  premiumPreference?: boolean;
  workload?: BuildBrief['workload'];
  usageIntensity?: 'occasional' | 'daily' | 'heavy';
  // 'auto' = user said "decide for me"; undefined = not answered yet
  cpuPreference?: 'AMD' | 'Intel' | 'auto';
  gpuPreference?: 'AMD' | 'Nvidia' | 'auto';
  targetDisplay?: BuildBrief['targetDisplay'];
  needsStreaming?: boolean;
  // Resolved brand for the build engine (null = auto)
  cpuBrand?: 'AMD' | 'Intel' | null;
  gpuBrand?: 'AMD' | 'Nvidia' | null;
}

function extractBriefFromHistory(
  history: Array<{ role: string; content: string }>,
  currentMessage: string,
): PartialBrief {
  const conversation = [
    ...history,
    { role: 'user', content: currentMessage },
  ];

  // Only consider messages from the latest build request onward so a new build
  // never inherits an earlier build's answers.
  let initiationIndex = -1;
  for (let i = conversation.length - 1; i >= 0; i--) {
    if (
      conversation[i].role === 'user' &&
      isBuildInitiation(conversation[i].content)
    ) {
      initiationIndex = i;
      break;
    }
  }
  const scope =
    initiationIndex >= 0 ? conversation.slice(initiationIndex) : conversation;
  const scopedUserMessages = scope
    .filter((entry) => entry.role === 'user')
    .map((entry) => entry.content);

  const brief: PartialBrief = {};

  for (let i = scopedUserMessages.length - 1; i >= 0; i--) {
    const budget = extractBudget(scopedUserMessages[i]);
    if (budget) {
      brief.budget = budget;
      break;
    }
  }
  if (!brief.budget) {
    for (let i = scope.length - 1; i >= 0; i--) {
      if (scope[i].role !== 'assistant') continue;
      const match = scope[i].content.match(/₹([\d,]+)/);
      if (match) {
        const parsed = parseInt(match[1].replace(/,/g, ''), 10);
        if (parsed >= 20000) {
          brief.budget = parsed;
          break;
        }
      }
    }
  }

  // Handle budget modifiers in latest message
  const lowerMsg = currentMessage.toLowerCase();
  if (brief.budget) {
    if (
      lowerMsg.includes('cheaper build') ||
      lowerMsg.includes('lower budget') ||
      lowerMsg.includes('less expensive')
    ) {
      brief.budget = Math.max(
        40000,
        Math.round((brief.budget * 0.8) / 5000) * 5000,
      );
    } else if (
      lowerMsg.includes('upgrade build') ||
      lowerMsg.includes('higher budget') ||
      lowerMsg.includes('better build')
    ) {
      brief.budget = Math.round((brief.budget * 1.25) / 5000) * 5000;
    }
  }

  // Context-gated CPU/GPU preference extraction.
  // We pair each user reply with the assistant question that preceded it to avoid
  // extracting CPU brand from a GPU chip label and vice versa.
  const allMessages = scope; // includes both roles, scoped to the current build
  for (let i = allMessages.length - 1; i >= 0; i--) {
    if (allMessages[i].role !== 'user') continue;
    const userReply = allMessages[i].content;
    const precedingAssistant = [...allMessages.slice(0, i)]
      .reverse()
      .find((m) => m.role === 'assistant');
    const assistantQ = (precedingAssistant?.content || '').toLowerCase();

    // Only set CPU preference when the assistant was asking about CPU brand
    if (
      brief.cpuPreference === undefined &&
      (assistantQ.includes('processor brand') || assistantQ.includes('cpu'))
    ) {
      const pref = extractCpuPreference(userReply);
      if (pref !== null) {
        brief.cpuPreference = pref;
        if (pref !== 'auto') brief.cpuBrand = pref;
      }
    }

    // Only set GPU preference when the assistant was asking about GPU brand
    if (
      brief.gpuPreference === undefined &&
      (assistantQ.includes('graphics card') || assistantQ.includes('gpu brand'))
    ) {
      const pref = extractGpuPreference(userReply);
      if (pref !== null) {
        brief.gpuPreference = pref;
        if (pref !== 'auto') brief.gpuBrand = pref;
      }
    }
  }

  // Also check the current message if it was answering the most recent assistant question
  const lastAssistant = [...scope]
    .reverse()
    .find((m) => m.role === 'assistant');
  const lastAsstQ = (lastAssistant?.content || '').toLowerCase();
  if (
    brief.cpuPreference === undefined &&
    lastAsstQ.includes('processor brand')
  ) {
    const pref = extractCpuPreference(currentMessage);
    if (pref !== null) {
      brief.cpuPreference = pref;
      if (pref !== 'auto') brief.cpuBrand = pref;
    }
  }
  if (
    brief.gpuPreference === undefined &&
    (lastAsstQ.includes('graphics card') || lastAsstQ.includes('gpu brand'))
  ) {
    const pref = extractGpuPreference(currentMessage);
    if (pref !== null) {
      brief.gpuPreference = pref;
      if (pref !== 'auto') brief.gpuBrand = pref;
    }
  }

  // Extract workload from user messages
  for (let i = scopedUserMessages.length - 1; i >= 0; i--) {
    const w = extractWorkload(scopedUserMessages[i]);
    if (w) {
      brief.workload = w;
      break;
    }
  }

  // Understand the recipient's time commitment before asking about components.
  const allUserText = scopedUserMessages.join(' ').toLowerCase();
  brief.minimumBudget = scopedUserMessages.some(hasMinimumBudgetRequest);
  brief.premiumPreference =
    /\b(premium|flagship|high[- ]end|top[- ]tier|more expensive|higher[- ]end)\b/.test(
      allUserText,
    ) ||
    /\b(?:above|over|more than)\s*(?:₹|rs\.?|inr)?\s*[\d,.]+\s*(?:k|thousand|lakh|lakhs|lac|lacs|l)\b/.test(
      allUserText,
    );
  if (/occasion|weekend|sometimes|few hours/.test(allUserText)) {
    brief.usageIntensity = 'occasional';
  } else if (/every day|daily|school days|regularly/.test(allUserText)) {
    brief.usageIntensity = 'daily';
  } else if (
    /all day|long hours|heavy use|intensive|many hours/.test(allUserText)
  ) {
    brief.usageIntensity = 'heavy';
  }

  // Extract display target from user messages (only if display/resolution was asked or explicit resolution specified)
  for (let i = scope.length - 1; i >= 0; i--) {
    if (scope[i].role !== 'user') continue;
    const msg = scope[i].content;
    const precedingAssistant = [...scope.slice(0, i)]
      .reverse()
      .find((m) => m.role === 'assistant');
    const assistantQ = (precedingAssistant?.content || '').toLowerCase();
    const isDisplayQuestion =
      assistantQ.includes('target display') ||
      assistantQ.includes('resolution') ||
      assistantQ.includes('monitor');
    const isExplicitRes = /1080|1440|4k|2k|2160|fhd|wqhd|multi.?monitor/i.test(
      msg,
    );

    if (isDisplayQuestion || isExplicitRes) {
      const d = extractDisplay(msg);
      if (d) {
        brief.targetDisplay = d;
        break;
      }
    }
  }

  // Handle explicit swap GPU command if no brand specified
  if (
    lowerMsg.includes('swap gpu') ||
    lowerMsg.includes('change gpu') ||
    lowerMsg.includes('swap the gpu')
  ) {
    if (
      !lowerMsg.includes('nvidia') &&
      !lowerMsg.includes('amd') &&
      !lowerMsg.includes('radeon') &&
      !lowerMsg.includes('geforce') &&
      !lowerMsg.includes('rtx')
    ) {
      brief.gpuBrand = brief.gpuBrand === 'Nvidia' ? 'AMD' : 'Nvidia';
    }
  }

  // Handle explicit swap CPU command if no brand specified
  if (
    lowerMsg.includes('swap cpu') ||
    lowerMsg.includes('change cpu') ||
    lowerMsg.includes('swap the cpu')
  ) {
    if (
      !lowerMsg.includes('intel') &&
      !lowerMsg.includes('amd') &&
      !lowerMsg.includes('ryzen')
    ) {
      brief.cpuBrand = brief.cpuBrand === 'Intel' ? 'AMD' : 'Intel';
    }
  }

  if (/stream|broadcast/i.test(scopedUserMessages.join(' '))) {
    brief.needsStreaming = true;
  }

  return brief;
}

function getBuildBudget(brief: PartialBrief): number {
  if (!brief.budget) return 100000;
  if (!brief.minimumBudget) return brief.budget;
  return Math.ceil((brief.budget * 1.1) / 5000) * 5000;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export class GamingBuildAdvisorAgent implements Agent {
  name = 'GamingBuildAdvisorAgent';

  async execute(
    ctx: AgentContext,
    _parsed: ParsedIntent,
  ): Promise<AgentResponse> {
    const { message, userId, history = [] } = ctx;
    const lowerMsg = message.toLowerCase();

    // ── STEP 1: DETECT USER EXPERTISE LEVEL ────────────────────────────────
    const expertise = detectPCBuilderExpertise(message, history);
    console.log(
      `[GamingBuildAdvisor] Detected expertise: ${expertise.level} (confidence: ${expertise.confidence.toFixed(2)}) | Keywords: ${expertise.technicalKeywords.slice(0, 5).join(', ')}`,
    );

    // ── Extract brief from conversation history ────────────────────────────
    const brief = extractBriefFromHistory(history, message);

    // ── Check for specific brand or component request ─────────────────────
    const targetComp = detectRequestedComponentType(message);
    const isBrandQuery =
      lowerMsg.includes('add') ||
      lowerMsg.includes('want') ||
      lowerMsg.includes('brand') ||
      lowerMsg.includes('5090') ||
      lowerMsg.includes('4090') ||
      lowerMsg.includes('4070') ||
      lowerMsg.includes('asus') ||
      lowerMsg.includes('msi') ||
      lowerMsg.includes('gigabyte') ||
      lowerMsg.includes('zotac') ||
      lowerMsg.includes('corsair') ||
      lowerMsg.includes('lian li');

    if (
      targetComp &&
      brief.budget &&
      isBrandQuery &&
      !isConfirmation(message) &&
      !lowerMsg.includes('coupon')
    ) {
      const inStockBrands = await getInStockBrandsForComponent(targetComp);

      const requestedBrandMatch = inStockBrands.find((b) =>
        lowerMsg.includes(b.toLowerCase()),
      );

      const is5090 = lowerMsg.includes('5090');

      if (is5090) {
        const brandListFormatted = inStockBrands
          .slice(0, 6)
          .map((b) => `- **${b}**`)
          .join('\n');
        const chipOptions = inStockBrands.slice(0, 4);

        return {
          reply:
            `⚠️ We don't currently have the **NVIDIA RTX 5090** in stock yet.\n\n` +
            `Here are the available in-stock brands for **${targetComp}s** in our catalog:\n\n` +
            `${brandListFormatted}\n\n` +
            `Which brand would you like to select for your build?`,
          products: [],
          orders: [],
          followUp: chipOptions,
          userContext: null,
        };
      }

      if (
        (lowerMsg.includes('add') || lowerMsg.includes('which brand')) &&
        !requestedBrandMatch &&
        inStockBrands.length > 0
      ) {
        const brandListFormatted = inStockBrands
          .slice(0, 6)
          .map((b) => `- **${b}**`)
          .join('\n');
        const chipOptions = inStockBrands.slice(0, 4);

        return {
          reply:
            `Which brand would you prefer for your **${targetComp}**? Here are the available in-stock brands in our catalog:\n\n` +
            `${brandListFormatted}\n\n` +
            `Tap a brand below or reply with your preferred brand!`,
          products: [],
          orders: [],
          followUp: chipOptions,
          userContext: null,
        };
      }

      if (requestedBrandMatch) {
        if (targetComp === 'Graphics Card') {
          brief.gpuBrand =
            requestedBrandMatch.toLowerCase().includes('nvidia') ||
            requestedBrandMatch.toLowerCase().includes('asus') ||
            requestedBrandMatch.toLowerCase().includes('msi') ||
            requestedBrandMatch.toLowerCase().includes('zotac') ||
            requestedBrandMatch.toLowerCase().includes('gigabyte')
              ? 'Nvidia'
              : 'AMD';
        } else if (targetComp === 'Processor') {
          brief.cpuBrand = requestedBrandMatch.toLowerCase().includes('intel')
            ? 'Intel'
            : 'AMD';
        }
      }
    }

    // ── Check for coupon queries while in build flow ───────────────────────
    const isCouponRequest =
      lowerMsg.includes('coupon') ||
      lowerMsg.includes('promo') ||
      lowerMsg.includes('discount') ||
      lowerMsg.includes('save with') ||
      lowerMsg.includes('code');

    if (isCouponRequest && brief.budget) {
      try {
        const result = await buildGamingPc({
          budget: getBuildBudget(brief),
          workload: brief.workload ?? 'gaming',
          targetDisplay: brief.targetDisplay ?? '1440p144',
          needsStreaming: brief.needsStreaming ?? false,
          includePeripherals: false,
          cpuBrand: brief.cpuBrand ?? null,
          gpuBrand: brief.gpuBrand ?? null,
          selectionMode: brief.premiumPreference ? 'premium' : 'balanced',
        });

        const total = result.totalPrice;
        const build50kPrice = total >= 50000 ? total - 5000 : total;
        const gaming10Discount = Math.round(total * 0.1);
        const gaming10Price = total - gaming10Discount;

        let reply = `## 🏷️ Coupon & Promo Savings for Your PC Build\n\n`;
        reply += `Your current PC build total is **₹${total.toLocaleString('en-IN')}**.\n\n`;
        reply += `Here are the best promo codes you can use:\n\n`;
        reply += `1. 🎟️ **\`BUILD50K\`** — **Flat ₹5,000 OFF** (for carts over ₹50,000)\n`;
        reply += `   - **Discounted Price:** ~**₹${build50kPrice.toLocaleString('en-IN')}**\n\n`;
        reply += `2. 🎮 **\`GAMING10\`** — **10% OFF** Gaming Department\n`;
        reply += `   - **Discounted Price:** ~**₹${gaming10Price.toLocaleString('en-IN')}** (Save ₹${gaming10Discount.toLocaleString('en-IN')})\n\n`;
        reply += `3. ⚡ **\`CPU15\`** — **15% OFF** Processors | 🎮 **\`GPU5K\`** — **₹5,000 OFF** GPUs\n\n`;
        reply += `---\n✅ **Ready to add all ${result.components.length} components to your cart with coupon support?** Type **"Yes, add to cart"** or select a swap option below.`;

        return {
          reply,
          products: result.components.map((c) => c.product),
          orders: [],
          followUp: [
            'Yes, add to cart',
            brief.gpuBrand === 'Nvidia'
              ? 'Swap GPU to AMD'
              : 'Swap GPU to Nvidia',
            brief.cpuBrand === 'Intel'
              ? 'Swap CPU to AMD'
              : 'Swap CPU to Intel',
            'Show cheaper build',
          ],
          userContext: ctx.userContext
            ? {
                name: ctx.userContext.name,
                recentOrderCount: ctx.userContext.recentOrders?.length ?? 0,
                interests: ctx.userContext.interests,
              }
            : null,
        };
      } catch (err) {
        console.error('Coupon query in gaming build failed:', err);
      }
    }

    // ── Check if user is confirming a previously presented build ──────────
    const lastAssistantMsg = [...history]
      .reverse()
      .find((h) => h.role === 'assistant');
    const lastContentLower = (lastAssistantMsg?.content || '').toLowerCase();
    const isAwaitingConfirmation =
      lastContentLower.includes('ready to add') ||
      lastContentLower.includes('add all') ||
      lastContentLower.includes('confirm your build');

    if (isAwaitingConfirmation && isConfirmation(message)) {
      return this.confirmAndAddToCart(ctx, history);
    }

    // ── Handle resume from leftout session ─────────────────────────────────
    if (
      lowerMsg.includes('continue where i left off') ||
      lowerMsg.includes('continue my pc build') ||
      lowerMsg.includes('review build components')
    ) {
      const inc = ctx.userContext?.incompleteCheckpoint;
      if (inc && inc.budgetMax && !brief.budget) {
        brief.budget = Number(inc.budgetMax);
      }
      if (inc && inc.answers) {
        if (inc.answers.workload) brief.workload = inc.answers.workload as any;
        if (inc.answers.cpuBrand) brief.cpuBrand = inc.answers.cpuBrand as any;
        if (inc.answers.gpuBrand) brief.gpuBrand = inc.answers.gpuBrand as any;
      }
    }

    // ── Detect recipient context (asking for self vs gift/other) ───────────
    const isOtherRecipient =
      /\b(for my|for a friend|for my friend|for my brother|for my sister|for my wife|for my husband|for my kid|for my son|for my daughter|gift for)\b/i.test(
        message,
      );

    const userProfile = ctx.userContext?.preferenceProfile;
    const isKnownGamer =
      !isOtherRecipient &&
      (userProfile?.personaHint === 'gamer' ||
        userProfile?.useCases?.includes('gaming') ||
        ctx.userContext?.interests?.includes('Gaming'));

    // If user is a known gamer building for themselves, prefill workload and skip processor prompt
    if (isKnownGamer) {
      brief.workload = brief.workload || 'gaming';
      brief.usageIntensity = brief.usageIntensity || 'heavy';

      // If budget is still missing, directly ask for budget without asking CPU/workload
      if (!brief.budget) {
        const userName = ctx.userContext?.name ? `${ctx.userContext.name}` : '';
        const greetingPrefix = userName ? `Awesome, ${userName}! 🎮` : `Awesome! 🎮`;
        return {
          reply:
            `${greetingPrefix} Since you're building a dedicated gaming rig, what is your target budget for this setup (e.g. ₹60,000, ₹80,000, ₹1,00,000, ₹1,50,000+)?\n\n` +
            `Once you specify your budget, I will automatically calculate the best performance gaming build for your preference with maximum FPS and optimal component synergy!`,
          products: [],
          orders: [],
          followUp: [
            '₹60,000 budget',
            '₹80,000 budget',
            '₹1,00,000 budget',
            '₹1,50,000 budget',
          ],
          userContext: ctx.userContext
            ? {
                name: ctx.userContext.name,
                recentOrderCount: ctx.userContext.recentOrders?.length ?? 0,
                interests: ctx.userContext.interests,
              }
            : null,
        };
      }
    }

    // ── STEP 2: ADAPTIVE FLOW BASED ON EXPERTISE ───────────────────────────
    const nextField = getNextFieldForExpertise(expertise.level, brief);
    const skipFields = nextField.skipFields ?? [];

    // Skip "workload" and "usageIntensity" for experts; they're focused on components
    if (expertise.level === 'expert' && !brief.cpuPreference && !isKnownGamer) {
      return this.askQuestion(nextField.question, ctx, nextField.followUp);
    }


    if (expertise.level === 'expert' && !brief.gpuPreference) {
      return this.askQuestion(nextField.question, ctx, nextField.followUp);
    }

    if (expertise.level === 'expert' && !brief.targetDisplay) {
      return this.askQuestion(nextField.question, ctx, nextField.followUp);
    }

    if (expertise.level === 'expert' && !brief.budget) {
      return this.askQuestion(nextField.question, ctx, nextField.followUp);
    }

    // Intermediate flow: workload + budget + optional display prefs
    if (expertise.level === 'intermediate' && !brief.workload) {
      return this.askQuestion(nextField.question, ctx, nextField.followUp);
    }

    if (expertise.level === 'intermediate' && !brief.budget) {
      return this.askQuestion(nextField.question, ctx, nextField.followUp);
    }

    if (expertise.level === 'intermediate' && !brief.targetDisplay) {
      return this.askQuestion(nextField.question, ctx, nextField.followUp);
    }

    // Beginner flow: workload → usageIntensity → budget
    if (!brief.workload) {
      return this.askQuestion(nextField.question, ctx, nextField.followUp);
    }

    if (!brief.usageIntensity && expertise.level === 'beginner') {
      return this.askQuestion(nextField.question, ctx, nextField.followUp);
    }

    if (!brief.budget) {
      return this.askQuestion(nextField.question, ctx, nextField.followUp);
    }

    // ── STEP 3: BUILD & PRESENT ────────────────────────────────────────────
    try {
      const targetDisplay =
        brief.targetDisplay ??
        (expertise.level === 'expert' ? '1440p144' : '1080p144');
      const result = await buildGamingPc({
        budget: getBuildBudget(brief),
        workload: brief.workload ?? 'gaming',
        targetDisplay,
        needsStreaming: brief.needsStreaming ?? false,
        includePeripherals: false,
        cpuBrand:
          brief.cpuPreference === 'auto' ? null : (brief.cpuBrand ?? null),
        gpuBrand:
          brief.gpuPreference === 'auto' ? null : (brief.gpuBrand ?? null),
        selectionMode: brief.premiumPreference ? 'premium' : 'balanced',
      });

      const products = result.components.map((c) => c.product);
      const totalFormatted = `₹${result.totalPrice.toLocaleString('en-IN')}`;
      const budgetRemaining =
        result.budgetRemaining > 0
          ? `₹${result.budgetRemaining.toLocaleString('en-IN')} under budget`
          : 'at budget';

      const workloadLabels: Record<string, string> = {
        gaming: '🎮 Gaming & Esports',
        creator: '🎬 Content Creator',
        streaming: '📡 Streaming + Gaming',
        workstation: '💼 Workstation',
      };

      const cpuLabel = brief.cpuBrand ?? 'best compatible in-stock option';
      const gpuLabel = brief.gpuBrand ?? 'best compatible in-stock option';
      const expertiseBadge = brief.premiumPreference
        ? '✨ **Premium Build**'
        : expertise.level === 'expert'
          ? '👨‍💻 **Expert Build**'
          : expertise.level === 'intermediate'
            ? '⚙️ **Optimized Build**'
            : '👶 **Guided Build**';

      let reply = `## 🖥️ ${expertiseBadge} — ${totalFormatted} (${budgetRemaining})\n`;
      reply += `> **Use Case:** ${workloadLabels[brief.workload] ?? brief.workload}  |  **CPU:** ${cpuLabel}  |  **GPU:** ${gpuLabel}  |  **Display:** ${targetDisplay}\n\n`;

      if (result.partialNote) {
        reply += `> ⚠️ ${result.partialNote}\n\n`;
      }

      if (result.compatibilityErrors.length > 0) {
        reply += `**⚠️ Compatibility notes:**\n${result.compatibilityErrors.map((e) => `- ${e}`).join('\n')}\n\n`;
      }

      reply += `### 🔩 Component Breakdown\n`;
      for (const c of result.components) {
        const label = c.componentKey.replace(/([A-Z])/g, ' $1').trim();
        reply += `- **${label}**: ${c.product.name} — ₹${Number(c.product.price).toLocaleString('en-IN')}\n  _${c.reason}_\n`;
      }

      reply += `\n**⚡ Estimated Power Draw:** ~${result.estimatedPowerDraw}W\n`;
      reply += `\n🏷️ **Coupon Savings:** Code **\`BUILD50K\`** → ₹5,000 OFF  |  **\`GAMING10\`** → 10% OFF`;

      // Adaptive follow-up based on expertise
      if (expertise.level === 'expert') {
        reply += `\n\n🔧 **Tweaks & Swaps:**\n`;
        reply += `- **"Swap GPU to ${brief.gpuBrand === 'Nvidia' ? 'AMD' : 'Nvidia'}"** — change GPU chip\n`;
        reply += `- **"Swap CPU to ${brief.cpuBrand === 'Intel' ? 'AMD' : 'Intel'}"** — change CPU chip\n`;
        reply += `- **"Optimize for 4K"** — upgrade GPU for higher resolution\n`;
        reply += `- **"Balance power/cost"** — reduce budget or TDP\n`;
      } else if (expertise.level === 'intermediate') {
        reply += `\n\n🔄 **Want to adjust?**\n`;
        reply += `- **"Show cheaper build"** — tighter budget\n`;
        reply += `- **"Upgrade build"** — better performance\n`;
        reply += `- **"Change to $(brand)"** — different GPU/CPU brand\n`;
      } else {
        reply += `\n\n🔄 **Want to tweak this build?**\n`;
        reply += `- **"Swap GPU to Nvidia"** or **"Swap GPU to AMD"**\n`;
        reply += `- **"Swap CPU to Intel"** or **"Swap CPU to AMD"**\n`;
        reply += `- **"Show cheaper build"** — tighter budget version\n`;
        reply += `- **"Upgrade build"** — push performance further\n`;
      }

      reply += `\n---\n✅ **Ready to add all ${result.components.length} components to your cart?** Type **"Yes, add to cart"** to confirm!`;

      return {
        reply,
        products,
        orders: [],
        followUp: [
          'Yes, add to cart',
          brief.gpuBrand === 'Nvidia'
            ? 'Swap GPU to AMD'
            : 'Swap GPU to Nvidia',
          brief.cpuBrand === 'Intel' ? 'Swap CPU to AMD' : 'Swap CPU to Intel',
          'Can I save with a coupon?',
          expertise.level === 'expert'
            ? 'Optimize for 4K'
            : 'Show cheaper build',
        ],
        explanation: {
          why: [
            `[${expertise.level.toUpperCase()}] Matched to the stated ${brief.workload} workload${brief.usageIntensity ? ` and ${brief.usageIntensity} usage pattern` : ''}.`,
            'Selected from compatible, in-stock gaming components within the stated budget.',
          ],
          tradeoffs: [
            brief.cpuPreference === 'auto'
              ? 'CPU brand was left automatic to optimize cost.'
              : `CPU brand was locked to ${brief.cpuBrand} as requested.`,
            brief.gpuPreference === 'auto'
              ? 'GPU brand was left automatic to optimize performance.'
              : `GPU brand was locked to ${brief.gpuBrand} as requested.`,
          ],
          source: 'catalog',
        },
        userContext: ctx.userContext
          ? {
              name: ctx.userContext.name,
              recentOrderCount: ctx.userContext.recentOrders?.length ?? 0,
              interests: ctx.userContext.interests,
            }
          : null,
      };
    } catch (err) {
      console.error('GamingBuildAdvisorAgent error:', err);
      return {
        reply:
          'I ran into an issue while building your PC config. Please try again or browse Gaming components directly.',
        products: [],
        orders: [],
        userContext: null,
      };
    }
  }

  private askQuestion(
    question: string,
    ctx: AgentContext,
    followUp: string[] = [],
  ): AgentResponse {
    return {
      reply: question,
      products: [],
      orders: [],
      followUp,
      userContext: ctx.userContext
        ? {
            name: ctx.userContext.name,
            recentOrderCount: ctx.userContext.recentOrders?.length ?? 0,
            interests: ctx.userContext.interests,
          }
        : null,
    };
  }

  private async confirmAndAddToCart(
    ctx: AgentContext,
    history: Array<{ role: string; content: string }>,
  ): Promise<AgentResponse> {
    // Re-extract the brief from history to re-run the build
    const brief = extractBriefFromHistory(history, ctx.message);

    if (brief.budget) {
      if (!brief.workload) brief.workload = 'gaming';
      if (!brief.targetDisplay) {
        if (brief.budget >= 200000) {
          brief.targetDisplay = '4k60';
        } else if (brief.budget >= 100000) {
          brief.targetDisplay = '1440p144';
        } else {
          brief.targetDisplay = '1080p144';
        }
      }
    }

    if (!brief.budget) {
      // Default to 100k if budget was lost
      brief.budget = 100000;
    }

    try {
      const result = await buildGamingPc({
        budget: getBuildBudget(brief),
        workload: brief.workload ?? 'gaming',
        targetDisplay: brief.targetDisplay ?? '1440p144',
        needsStreaming: brief.needsStreaming ?? false,
        includePeripherals: false,
        cpuBrand: brief.cpuBrand ?? null,
        gpuBrand: brief.gpuBrand ?? null,
        selectionMode: brief.premiumPreference ? 'premium' : 'balanced',
      });

      // Add items to cart (for logged-in user or default session)
      const sessionId = ctx.userId ? `user_${ctx.userId}` : 'default';
      for (const c of result.components) {
        const productId = c.product.id;
        await db
          .insert(cartItemsTable)
          .values({ sessionId, productId, quantity: 1 })
          .onConflictDoNothing();
      }

      return {
        reply:
          `🎉 **Success! All ${result.components.length} gaming components have been added to your cart!**\n\n` +
          `**Build Summary:**\n` +
          `${result.components.map((c) => `- **${c.componentKey.toUpperCase()}**: ${c.product.name} — ₹${Number(c.product.price).toLocaleString('en-IN')}`).join('\n')}\n\n` +
          `**Total Build Price:** **₹${result.totalPrice.toLocaleString('en-IN')}**\n\n` +
          `💡 *Tip: Remember to apply promo code **\`BUILD50K\`** (₹5,000 off) or **\`GAMING10\`** (10% off) at checkout!*`,
        products: result.components.map((c) => c.product),
        orders: [],
        followUp: ['Go to cart', 'Apply a coupon', 'View order history'],
        userContext: ctx.userContext
          ? {
              name: ctx.userContext.name,
              recentOrderCount: ctx.userContext.recentOrders?.length ?? 0,
              interests: ctx.userContext.interests,
            }
          : null,
      };
    } catch (err) {
      console.error('GamingBuildAdvisorAgent confirm error:', err);
      return {
        reply: 'Something went wrong while adding to cart. Please try again.',
        products: [],
        orders: [],
        userContext: null,
      };
    }
  }
}
