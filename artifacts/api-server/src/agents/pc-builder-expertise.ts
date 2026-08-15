/**
 * pc-builder-expertise.ts
 *
 * Detects user expertise level in PC building and routes to appropriate conversation flow.
 * Three tiers:
 *   BEGINNER - No technical knowledge, needs guided through use-case → budget
 *   INTERMEDIATE - Some technical knowledge, asks clarifying questions
 *   EXPERT - Deep technical knowledge, specifies components and brands
 */

export type ExpertiseLevel = 'beginner' | 'intermediate' | 'expert';

export interface ExpertiseProfile {
  level: ExpertiseLevel;
  signals: string[];
  confidence: number; // 0-1: how confident we are in this classification
  technicalKeywords: string[];
}

/**
 * Detects user expertise level from their PC build request
 * Analyzes for technical terminology, specific component knowledge, and brand awareness
 */
export function detectPCBuilderExpertise(
  message: string,
  conversationHistory?: Array<{ role: string; content: string }>,
): ExpertiseProfile {
  const lower = message.toLowerCase();
  const signals: string[] = [];
  const technicalKeywords: string[] = [];

  // ─── EXPERT SIGNALS ──────────────────────────────────────────────────────
  // Expert knows specific models, brands, generations, technical specs

  const expertModelPatterns = [
    // GPU models - expert knows the exact chip
    /\b(rtx 5090|rtx 5080|rtx 5070|rtx 4090|rtx 4080|rtx 4070 ti|rtx 4070|rtx 4060|rx 7900 xtx|rx 7900 xt|rx 7800 xt|rx 7700 xt|rx 7600|arc b580|arc a770)\b/i,
    // CPU models - expert knows exact SKU
    /\b(ryzen (?:[579] )?(?:9950x3d|9950x|9900x|9800x3d|9700x|7950x3d|7900x3d|7800x3d)|core i9-14900k|core i7-14700k|intel xeon|threadripper|epyc)\b/i,
    // Motherboard specific
    /\b(x870|x870e|z890|z790|b850|b850e|a620|b650e)\b/i,
    // Power supply wattage specificity
    /\b(850w|1000w|1200w psu|power supply.*850|power supply.*1000)\b/i,
    // Memory timing/specs
    /\b(ddr5|ddr5.*6400|ddr5.*7200|cl30|cl32|cl36|memory timing|latency)\b/i,
    // Cooling solutions
    /\b(arctic liquid freezer|noctua nh-d15|corsair h150|nzxt kraken|360mm aio|240mm aio|lga1700 socket)\b/i,
    // Case specifications
    /\b(fractal north|lian li lancool|nzxt h7|corsair 5000t|case airflow|support.*mm radiator)\b/i,
  ];

  const expertTerminologyPatterns = [
    /\b(bottleneck|thermal paste|vrm quality|power delivery|chipset limitation|cache bandwidth)\b/i,
    /\b(overclock|pbo|curve optimizer|memory timing|ipc|cpi improvement)\b/i,
    /\b(form factor|atx|e-atx|micro-atx|mini-itx|m.2 slot|nvme gen4|gen5)\b/i,
    /\b(pcie 5\.0|usb 3\.2|thunderbolt|connectivity|lane allocation)\b/i,
    /\b(platform|ecosystem|upgrade path|socket compatibility|future-proof)\b/i,
  ];

  // Count expert patterns
  let expertMatches = 0;
  for (const pattern of expertModelPatterns) {
    if (pattern.test(message)) {
      expertMatches++;
      const match = message.match(pattern);
      if (match) {
        signals.push(`Knows model: ${match[0]}`);
        technicalKeywords.push(match[0]);
      }
    }
  }

  for (const pattern of expertTerminologyPatterns) {
    if (pattern.test(message)) {
      expertMatches++;
      const match = message.match(pattern);
      if (match) {
        signals.push(`Technical term: ${match[0]}`);
        technicalKeywords.push(match[0]);
      }
    }
  }

  // ─── INTERMEDIATE SIGNALS ────────────────────────────────────────────────
  // Intermediate knows general categories, some brand awareness, basic specs

  const intermediatePatterns = [
    // General component preferences but not specific models
    /\b(amd|nvidia|intel|ryzen|geforce|radeon|asus|msi|gigabyte)\b/i,
    // General spec awareness
    /\b(high-end|mid-range|premium|flagship|more expensive|top-tier|budget|performance|efficiency|fps target|1080p|1440p|4k)\b/i,
    /\b(gaming|streaming|video editing|3d rendering|development)\b/i,
    // Component category knowledge
    /\b(graphics card|processor|cpu|gpu|motherboard|ram|memory|ssd|storage|cooling|power supply|psu)\b/i,
    // Moderate price awareness
    /\b(under ₹|within ₹|total budget|price range|₹.*[k-]?(?:thousand|lakh)|\d+(?:\.\d+)?\s*(?:k|thousand|lakh|lakhs|lac|lacs))\b/i,
  ];

  let intermediateMatches = 0;
  for (const pattern of intermediatePatterns) {
    if (pattern.test(message)) {
      intermediateMatches++;
    }
  }

  // ─── BEGINNER SIGNALS ────────────────────────────────────────────────────
  // Beginner uses generic terms, asks for help without technical detail

  const beginnerIndicators = [
    /\b(help me|can you help|don't know|no idea|don't understand|confused|lost)\b/i,
    /\b(good for gaming|best value|most popular|what do you recommend)\b/i,
    /\b(simple|basic|normal|standard|regular)\b/i,
    /\b(my friend said|someone told me|i heard)\b/i, // relies on secondhand info
  ];

  let beginnerMatches = 0;
  for (const pattern of beginnerIndicators) {
    if (pattern.test(message)) {
      beginnerMatches++;
      signals.push(`Beginner trait: ${pattern.source}`);
    }
  }

  // ─── KEYWORD EXTRACTOR ──────────────────────────────────────────────────

  const techKeywordMatches = message.match(
    /\b(ryzen|intel|nvidia|amd|ddr5|pcie|bottleneck|tgp|cache|ipc|vrm|fps|hz|overclock|curve|memory timing|chipset|platform|socket|upgrade|thermal|watt|power delivery)\b/gi,
  );
  if (techKeywordMatches) {
    techKeywordMatches.forEach((match) => {
      technicalKeywords.push(match.toLowerCase());
    });
    // Remove duplicates
    const uniqueTechKeywords: string[] = [];
    technicalKeywords.forEach((k) => {
      if (!uniqueTechKeywords.includes(k)) {
        uniqueTechKeywords.push(k);
      }
    });
  }

  // ─── DECIDE EXPERTISE LEVEL ─────────────────────────────────────────────

  let level: ExpertiseLevel = 'beginner';
  let confidence = 0;

  // Scoring heuristic
  if (expertMatches >= 3) {
    // 3+ expert signals = clear expert
    level = 'expert';
    confidence = Math.min(0.95, 0.7 + expertMatches * 0.08);
  } else if (expertMatches === 2) {
    // 2 expert signals = likely expert, but could be intermediate
    level = 'expert';
    confidence = 0.65;
  } else if (expertMatches === 1 && intermediateMatches >= 3) {
    // 1 expert signal + moderate intermediate = intermediate-to-expert
    level = 'intermediate';
    confidence = 0.7;
  } else if (intermediateMatches >= 4) {
    // Multiple intermediate signals = intermediate
    level = 'intermediate';
    confidence = 0.75;
  } else if (beginnerMatches >= 2 && intermediateMatches <= 2) {
    // Beginner traits + few intermediate = beginner
    level = 'beginner';
    confidence = 0.8;
  } else if (
    intermediateMatches >= 2 &&
    expertMatches === 0 &&
    beginnerMatches === 0
  ) {
    // Moderate intermediate signals, no expert/beginner = intermediate
    level = 'intermediate';
    confidence = 0.65;
  } else {
    // Default to beginner if unclear
    level = 'beginner';
    confidence = 0.5;
  }

  // Check conversation history for signals
  if (conversationHistory && conversationHistory.length > 0) {
    const historicalExpertise =
      detectPCBuilderExpertiseFromHistory(conversationHistory);
    if (
      historicalExpertise &&
      confidence < 0.8 &&
      (level === 'beginner' || historicalExpertise.level !== 'beginner')
    ) {
      level = historicalExpertise.level;
      confidence = Math.max(confidence, 0.7); // boost confidence if we have history
      signals.push('Refined from conversation history');
    }
  }

  return {
    level,
    signals,
    confidence,
    technicalKeywords,
  };
}

/**
 * Refines expertise detection by analyzing conversation history
 * Looks at earlier messages for clues about technical knowledge
 */
export function detectPCBuilderExpertiseFromHistory(
  history: Array<{ role: string; content: string }>,
): ExpertiseProfile | null {
  const userMessages = history.filter((h) => h.role === 'user');
  if (userMessages.length === 0) return null;

  let totalExpertSignals = 0;
  let totalIntermediateSignals = 0;
  let allTechKeywords: string[] = [];

  for (const msg of userMessages) {
    const profile = detectPCBuilderExpertise(msg.content);
    if (profile.level === 'expert') totalExpertSignals++;
    if (profile.level === 'intermediate') totalIntermediateSignals++;
    allTechKeywords.push(...profile.technicalKeywords);
  }

  // Majority vote with history
  const level: ExpertiseLevel =
    totalExpertSignals > totalIntermediateSignals
      ? 'expert'
      : totalIntermediateSignals > 0
        ? 'intermediate'
        : 'beginner';

  return {
    level,
    signals: userMessages.map((m) => m.content.substring(0, 50)),
    confidence: 0.75,
    technicalKeywords: Array.from(
      new Map(allTechKeywords.map((k) => [k, true])).keys(),
    ),
  };
}

/**
 * Returns adaptive follow-up questions based on expertise level
 */
export function getAdaptiveFollowUpForExpertise(
  level: ExpertiseLevel,
  context?: { budget?: number; workload?: string },
): string[] {
  switch (level) {
    case 'expert':
      // Expert wants to choose components, not answer guided questions
      return [
        '🔴 AMD Ryzen (high IPC)',
        '🔵 Intel Core (efficiency)',
        '🟢 Nvidia RTX (CUDA)',
        '🔴 AMD Radeon (RDNA3)',
      ];

    case 'intermediate':
      // Intermediate wants options with some guidance
      return [
        '🎮 Pure Gaming (no streaming)',
        '📡 Gaming + Streaming',
        '🎬 Content Creation Focus',
        '💼 Heavy Workstation',
      ];

    case 'beginner':
    default:
      // Beginner needs simple, outcome-focused questions
      return [
        '🎮 Gaming & Esports',
        '🎬 Video Editing & Creative',
        '📡 Streaming & Gaming',
        '💼 Workstation & Professional',
      ];
  }
}

/**
 * Determines the conversation flow for PC building based on expertise
 * Returns the field to ask about next
 */
export function getNextFieldForExpertise(
  level: ExpertiseLevel,
  currentBrief: {
    cpuPreference?: string;
    gpuPreference?: string;
    budget?: number;
    workload?: string;
    targetDisplay?: string;
    usageIntensity?: string;
  },
): {
  field: string;
  question: string;
  followUp: string[];
  skipFields?: string[];
} {
  switch (level) {
    case 'expert': {
      // Expert flow: CPU preference → GPU preference → Display → Budget
      if (!currentBrief.cpuPreference) {
        return {
          field: 'cpuPreference',
          question:
            '🔧 **CPU Preference** — Which processor brand fits your workflow?\n> _AMD excels in multi-threaded workloads; Intel in single-threaded IPC._',
          followUp: [
            '🔴 AMD Ryzen (multi-core)',
            '🔵 Intel Core (single-thread)',
            '🤖 Your choice (decide for me)',
          ],
          skipFields: ['workload', 'usageIntensity'], // Skip beginner questions
        };
      }
      if (!currentBrief.gpuPreference) {
        return {
          field: 'gpuPreference',
          question:
            '🎮 **GPU Preference** — Which graphics card ecosystem?\n> _NVIDIA has better CUDA tools; AMD offers better price-to-performance at mid-range._',
          followUp: [
            '🟢 Nvidia RTX (CUDA, DLSS)',
            '🔴 AMD Radeon (value, FSR)',
            '🤖 Your choice (decide for me)',
          ],
        };
      }
      if (!currentBrief.targetDisplay) {
        return {
          field: 'targetDisplay',
          question:
            '🖥️ **Target Display** — What resolution & refresh rate?\n> _Higher = more GPU power needed & higher cost._',
          followUp: ['1080p 144Hz', '1440p 144Hz', '4K 60Hz', '4K 144Hz'],
        };
      }
      if (!currentBrief.budget) {
        return {
          field: 'budget',
          question:
            '💰 **Final Budget** - Total amount for the build?\n> We will optimize components within this range.',
          followUp: ['60,000', '1,00,000', '1,50,000', '2,50,000+'],
        };
      }
      break;
    }

    case 'intermediate': {
      // Intermediate flow: Workload → Budget → (optional) Display & brand prefs
      if (!currentBrief.workload) {
        return {
          field: 'workload',
          question:
            '🎯 **Primary Use Case** — What will this PC primarily do?\n> _Helps us balance performance, power draw, and cooling._',
          followUp: [
            '🎮 Gaming & Esports',
            '📡 Streaming & Gaming',
            '🎬 Video Editing',
            '💼 Workstation',
          ],
        };
      }
      if (!currentBrief.budget) {
        return {
          field: 'budget',
          question:
            '💰 **Budget** - Total amount you want to spend?\n> Includes all components in one build.',
          followUp: ['60,000', '1,00,000', '1,50,000', '2,50,000+'],
        };
      }
      if (!currentBrief.targetDisplay) {
        return {
          field: 'targetDisplay',
          question:
            '📺 **Display Target** — What resolution + refresh rate?\n> _Optional: Helps fine-tune GPU selection._',
          followUp: ['1080p 144Hz', '1440p 144Hz', '4K 60Hz', 'Not sure'],
        };
      }
      break;
    }

    case 'beginner':
    default: {
      // Beginner flow: Workload → Usage Intensity → Budget (current implementation)
      if (!currentBrief.workload) {
        return {
          field: 'workload',
          question: `🖥️ **Let's build the right PC for the person who will use it!**\n\n🎯 **What will they primarily do on this PC?**\n> _For example: games, schoolwork, video editing, streaming, or a mix._`,
          followUp: [
            '🎮 Pure Gaming & Esports',
            '🎬 Video Editing & Content Creation',
            '📡 Live Streaming & Gaming',
            '💼 Heavy Workstation & CAD',
          ],
        };
      }
      if (!currentBrief.usageIntensity) {
        return {
          field: 'usageIntensity',
          question: `👍 **${currentBrief.workload ?? 'this task'}** noted. How much time will they typically spend using it?\n> This helps me balance durability, cooling, and performance for the real workload.`,
          followUp: [
            'Occasional / weekends',
            'Daily school or home use',
            'Long hours / intensive use',
          ],
        };
      }
      if (!currentBrief.budget) {
        return {
          field: 'budget',
          question: `💰 For a **${currentBrief.usageIntensity ?? 'regular'}** ${currentBrief.workload ?? 'PC'} workload, what is your total target budget in INR?\n> I will use live in-stock components and keep the build within this amount.`,
          followUp: ['60,000', '1,00,000', '1,50,000', '2,50,000', '3,00,000'],
        };
      }
      break;
    }
  }

  // All fields filled
  return {
    field: 'ready_to_build',
    question: 'Ready to build your custom PC!',
    followUp: [],
  };
}
