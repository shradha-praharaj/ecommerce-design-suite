/**
 * pc-builder.ts — Deterministic PC compatibility and recommendation service.
 *
 * This service selects compatible gaming PC components without relying on
 * an LLM for compatibility decisions. The LLM may call this service and
 * explain its output, but must not override it.
 *
 * Full-build mode is gated: requires ALL mandatory component types to be
 * present in the catalog. Until then, partial (core-components only) mode
 * is returned and clearly labelled.
 *
 * Mandatory for a complete build:
 *   Processor, CPU Cooler, Graphics Card, RAM, Storage, Power Supply,
 *   Motherboard, Case
 *
 * Core-only build (from the first catalog import):
 *   Processor, CPU Cooler, Graphics Card, RAM, Storage, Power Supply
 */

import { and, eq, gte, lte, not, sql } from 'drizzle-orm';
import { db, productsTable } from '@workspace/db';
import type { Product } from '@workspace/db';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BuildBrief {
  /** Total budget in INR */
  budget: number;
  /** Primary use case: 'gaming' | 'streaming' | 'creator' | 'workstation' */
  workload: 'gaming' | 'streaming' | 'creator' | 'workstation';
  /** Target resolution + refresh: '1080p60' | '1080p144' | '1440p144' | '4k60' */
  targetDisplay: '1080p60' | '1080p144' | '1440p144' | '4k60';
  /** Whether streaming/recording is a primary use */
  needsStreaming: boolean;
  /** Include monitor and peripherals in budget */
  includePeripherals: boolean;
  /** 'compact' | 'mid' | 'full' — only relevant once cases/motherboards arrive */
  formFactor?: 'compact' | 'mid' | 'full';
  cpuBrand?: 'AMD' | 'Intel' | null;
  gpuBrand?: 'AMD' | 'Nvidia' | null;
  /** Premium requests favor the highest-priced compatible in-stock components. */
  selectionMode?: 'balanced' | 'premium';
}

export type ComponentKey =
  | 'processor'
  | 'cooler'
  | 'gpu'
  | 'ram'
  | 'storage'
  | 'psu'
  | 'motherboard'
  | 'case'
  | 'monitor'
  | 'peripheral';

export interface BuildComponent {
  componentKey: ComponentKey;
  product: Product;
  reason: string;
}

export interface BuildResult {
  /** Whether the build covers ALL component types (requires second catalog) */
  isComplete: boolean;
  /** Human-readable label when the build is partial */
  partialNote?: string;
  components: BuildComponent[];
  totalPrice: number;
  estimatedPowerDraw: number;
  compatibilityErrors: string[];
  budgetRemaining: number;
}

// ─── Budget allocation ratios by workload ────────────────────────────────────

const BUDGET_RATIOS: Record<
  BuildBrief['workload'],
  Record<ComponentKey, number>
> = {
  gaming: {
    gpu: 0.35,
    processor: 0.18,
    motherboard: 0.1,
    ram: 0.08,
    storage: 0.08,
    psu: 0.08,
    case: 0.07,
    cooler: 0.06,
    monitor: 0.0,
    peripheral: 0.0,
  },
  streaming: {
    gpu: 0.3,
    processor: 0.2,
    motherboard: 0.1,
    ram: 0.1,
    storage: 0.1,
    psu: 0.08,
    case: 0.06,
    cooler: 0.06,
    monitor: 0.0,
    peripheral: 0.0,
  },
  creator: {
    gpu: 0.26,
    processor: 0.22,
    motherboard: 0.1,
    ram: 0.12,
    storage: 0.12,
    psu: 0.08,
    case: 0.05,
    cooler: 0.05,
    monitor: 0.0,
    peripheral: 0.0,
  },
  workstation: {
    gpu: 0.24,
    processor: 0.24,
    motherboard: 0.1,
    ram: 0.14,
    storage: 0.12,
    psu: 0.08,
    case: 0.04,
    cooler: 0.04,
    monitor: 0.0,
    peripheral: 0.0,
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSpecs(product: Product): Record<string, unknown> {
  try {
    return product.specs ? JSON.parse(product.specs) : {};
  } catch {
    return {};
  }
}

/** Fetch all in-stock Gaming products of a given component type */
async function getCandidates(
  componentType: string,
  maxPrice: number,
  brandHint?: string | null,
  selectionMode: BuildBrief['selectionMode'] = 'balanced',
): Promise<Product[]> {
  const conditions = [
    eq(productsTable.department, 'Gaming'),
    eq(productsTable.componentType, componentType),
    eq(productsTable.inStock, true),
    lte(productsTable.price, String(maxPrice)),
  ];

  const rows = await db
    .select()
    .from(productsTable)
    .where(and(...conditions))
    .orderBy(
      selectionMode === 'premium'
        ? sql`CAST(${productsTable.price} AS numeric) desc, ${productsTable.rating} desc`
        : sql`${productsTable.rating} desc, ${productsTable.reviewCount} desc`,
    );

  // Prefer brand hint but don't require it
  const branded = brandHint
    ? rows.filter((r) =>
        r.brand.toLowerCase().includes(brandHint.toLowerCase()),
      )
    : [];
  return branded.length > 0 ? branded : rows;
}

/** Check whether a catalog section has any inventory */
async function hasInventory(componentType: string): Promise<boolean> {
  const [row] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.department, 'Gaming'),
        eq(productsTable.componentType, componentType),
      ),
    )
    .limit(1);
  return !!row;
}

/** Pick the best candidate within budget (highest rating, then highest reviewCount) */
function pickBest(candidates: Product[]): Product | null {
  return candidates[0] ?? null;
}

/** Estimate power draw from specs or fallback heuristic */
function estimatePowerDraw(components: BuildComponent[]): number {
  let total = 50; // Baseline (motherboard + fans + misc)
  for (const c of components) {
    const specs = getSpecs(c.product);
    const tdp = Number(
      specs['TDP'] ?? specs['Power Consumption'] ?? specs['Wattage'] ?? 0,
    );
    if (tdp > 0) {
      total += tdp;
    } else {
      // Fallback heuristics
      if (c.componentKey === 'processor') total += 65;
      if (c.componentKey === 'gpu') total += 150;
      if (c.componentKey === 'ram') total += 5;
      if (c.componentKey === 'storage') total += 5;
    }
  }
  return total;
}

// ─── Main exported function ──────────────────────────────────────────────────

export async function buildGamingPc(brief: BuildBrief): Promise<BuildResult> {
  const compatibilityErrors: string[] = [];
  const components: BuildComponent[] = [];

  // Determine which component types are available in the catalog
  const [hasMotherboard, hasCase] = await Promise.all([
    hasInventory('Motherboard'),
    hasInventory('Case'),
  ]);
  const isComplete = hasMotherboard && hasCase;

  // ── Budget allocation ────────────────────────────────────────────────────
  const ratios = BUDGET_RATIOS[brief.workload];
  const effectiveBudget = brief.budget;
  const budgets: Partial<Record<ComponentKey, number>> = {};

  // Only allocate to components we actually have
  const activeKeys: ComponentKey[] = [
    'processor',
    'cooler',
    'gpu',
    'ram',
    'storage',
    'psu',
  ];
  if (hasMotherboard) activeKeys.push('motherboard');
  if (hasCase) activeKeys.push('case');

  // Normalise ratios for active keys
  const activeRatioSum = activeKeys.reduce((s, k) => s + (ratios[k] ?? 0), 0);
  for (const key of activeKeys) {
    budgets[key] = Math.floor(
      (effectiveBudget * (ratios[key] ?? 0)) / activeRatioSum,
    );
  }

  // ── Select components ────────────────────────────────────────────────────

  // Processor
  {
    const candidates = await getCandidates(
      'Processor',
      budgets.processor!,
      brief.cpuBrand,
      brief.selectionMode,
    );
    const picked = pickBest(candidates);
    if (picked) {
      components.push({
        componentKey: 'processor',
        product: picked,
        reason:
          brief.selectionMode === 'premium'
            ? `Premium ${picked.brand} processor within ₹${budgets.processor} allocation`
            : `Best rated ${picked.brand} processor within ₹${budgets.processor} budget`,
      });
    } else {
      compatibilityErrors.push(
        `No Processor found within ₹${budgets.processor}`,
      );
    }
  }

  // GPU
  {
    const candidates = await getCandidates(
      'Graphics Card',
      budgets.gpu!,
      brief.gpuBrand,
      brief.selectionMode,
    );
    const picked = pickBest(candidates);
    if (picked) {
      // Boost the reason based on display target
      const displayNote =
        brief.targetDisplay === '4k60'
          ? 'suitable for 4K gaming'
          : brief.targetDisplay === '1440p144'
            ? 'handles 1440p 144Hz well'
            : 'solid for 1080p performance';
      components.push({
        componentKey: 'gpu',
        product: picked,
        reason: `${picked.brand} GPU — ${displayNote}`,
      });
    } else {
      compatibilityErrors.push(`No Graphics Card found within ₹${budgets.gpu}`);
    }
  }

  // RAM
  {
    const candidates = await getCandidates(
      'RAM',
      budgets.ram!,
      undefined,
      brief.selectionMode,
    );
    // Prefer higher capacity for streaming/creator workloads
    const sorted = [...candidates].sort((a, b) => {
      const specA = getSpecs(a);
      const specB = getSpecs(b);
      const capA = parseInt(
        String(specA['Capacity'] ?? specA['Memory Size'] ?? '0'),
        10,
      );
      const capB = parseInt(
        String(specB['Capacity'] ?? specB['Memory Size'] ?? '0'),
        10,
      );
      return capB - capA;
    });
    const picked = pickBest(
      brief.selectionMode === 'premium'
        ? candidates
        : brief.needsStreaming
          ? sorted
          : candidates,
    );
    if (picked) {
      components.push({
        componentKey: 'ram',
        product: picked,
        reason: `${picked.brand} RAM — reliable performance for ${brief.workload}`,
      });
    } else {
      compatibilityErrors.push(`No RAM found within ₹${budgets.ram}`);
    }
  }

  // Storage
  {
    const candidates = await getCandidates(
      'Storage',
      budgets.storage!,
      undefined,
      brief.selectionMode,
    );
    // Prefer NVMe/SSD for gaming
    const ssdFirst = [...candidates].sort((a, b) => {
      const specA = getSpecs(a);
      const specB = getSpecs(b);
      const isNvmeA = /nvme|m\.2/i.test(
        String(specA['storageInterface'] ?? specA['Interface'] ?? ''),
      );
      const isNvmeB = /nvme|m\.2/i.test(
        String(specB['storageInterface'] ?? specB['Interface'] ?? ''),
      );
      return isNvmeB ? 1 : isNvmeA ? -1 : 0;
    });
    const picked = pickBest(
      brief.selectionMode === 'premium' ? candidates : ssdFirst,
    );
    if (picked) {
      components.push({
        componentKey: 'storage',
        product: picked,
        reason: `${picked.brand} storage — fast load times for gaming`,
      });
    } else {
      compatibilityErrors.push(`No Storage found within ₹${budgets.storage}`);
    }
  }

  // CPU Cooler
  {
    const candidates = await getCandidates(
      'CPU Cooler',
      budgets.cooler!,
      undefined,
      brief.selectionMode,
    );
    // Prefer AIO for streaming/creator (thermal headroom), Air for budget builds
    const coolerTypePref =
      brief.needsStreaming || brief.workload === 'creator' ? 'AIO' : 'Air';
    const preferred = candidates.filter((c) => {
      const specs = getSpecs(c);
      return (
        (specs['coolerType'] ?? '').toString().toUpperCase() === coolerTypePref
      );
    });
    const picked = pickBest(preferred.length > 0 ? preferred : candidates);
    if (picked) {
      const specs = getSpecs(picked);
      const coolerType = specs['coolerType'] ?? 'Cooler';
      components.push({
        componentKey: 'cooler',
        product: picked,
        reason: `${picked.brand} ${coolerType} — keeps thermals in check`,
      });
    } else {
      compatibilityErrors.push(`No CPU Cooler found within ₹${budgets.cooler}`);
    }
  }

  // PSU
  {
    const estimatedDraw = estimatePowerDraw(components);
    const recommendedPsuWattage = Math.ceil((estimatedDraw * 1.25) / 50) * 50; // 25% headroom

    const candidates = await getCandidates(
      'Power Supply',
      budgets.psu!,
      undefined,
      brief.selectionMode,
    );
    // Pick PSU with sufficient wattage
    const sufficient = candidates.filter((c) => {
      const specs = getSpecs(c);
      const wattage = parseInt(
        String(specs['psuWattage'] ?? specs['Wattage'] ?? '0'),
        10,
      );
      return wattage >= recommendedPsuWattage;
    });
    const picked = pickBest(sufficient.length > 0 ? sufficient : candidates);
    if (picked) {
      components.push({
        componentKey: 'psu',
        product: picked,
        reason: `${picked.brand} PSU — adequate headroom for this build`,
      });
    } else {
      compatibilityErrors.push(`No PSU found within ₹${budgets.psu}`);
    }
  }

  // Motherboard (if catalog has it)
  if (hasMotherboard && budgets.motherboard) {
    const candidates = await getCandidates(
      'Motherboard',
      budgets.motherboard,
      undefined,
      brief.selectionMode,
    );
    const picked = pickBest(candidates);
    if (picked) {
      components.push({
        componentKey: 'motherboard',
        product: picked,
        reason: `${picked.brand} motherboard`,
      });
    }
  }

  // Case (if catalog has it)
  if (hasCase && budgets.case) {
    const candidates = await getCandidates(
      'Case',
      budgets.case,
      undefined,
      brief.selectionMode,
    );
    const picked = pickBest(candidates);
    if (picked) {
      components.push({
        componentKey: 'case',
        product: picked,
        reason: `${picked.brand} case`,
      });
    }
  }

  const totalPrice = components.reduce(
    (s, c) => s + Number(c.product.price),
    0,
  );
  const estimatedPowerDraw = estimatePowerDraw(components);

  return {
    isComplete,
    partialNote: isComplete
      ? undefined
      : '⚠️ Motherboard and case are not yet in our catalog. This recommendation covers core components only — you will need to source a motherboard and case separately.',
    components,
    totalPrice,
    estimatedPowerDraw,
    compatibilityErrors,
    budgetRemaining: Math.max(0, effectiveBudget - totalPrice),
  };
}
