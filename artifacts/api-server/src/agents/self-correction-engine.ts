import type { AgentContext, AgentResponse, ParsedIntent } from './types.js';

export interface CorrectionAnalysis {
  isCorrection: boolean;
  correctionType?: 'budget' | 'brand' | 'category' | 'component' | 'intent' | 'general';
  correctedValue?: string | number;
  explanation?: string;
}

const CORRECTION_PATTERNS = [
  /no,?\s+i\s+(?:meant|said|asked|wanted)/i,
  /that'?s\s+not\s+what\s+i/i,
  /i\s+already\s+(?:told|said|specified)\s+you/i,
  /you\s+(?:misunderstood|got\s+it\s+wrong|didn'?t\s+get)/i,
  /wrong\s+(?:category|product|brand|price|budget)/i,
  /not\s+that,?\s+i\s+want/i,
  /i\s+said\s+[\w\s]+/i,
  /instead\s+of\s+[\w\s]+/i,
  /listen\s+to\s+me/i,
  /pay\s+attention/i,
];

/** Detect if the user is correcting or redirecting a previous AI misunderstanding */
export function detectCorrection(message: string): CorrectionAnalysis {
  const isMatch = CORRECTION_PATTERNS.some((p) => p.test(message));
  if (!isMatch) {
    return { isCorrection: false };
  }

  const lower = message.toLowerCase();
  let type: CorrectionAnalysis['correctionType'] = 'general';

  if (
    lower.includes('budget') ||
    lower.includes('price') ||
    lower.includes('cost') ||
    lower.includes('lakh') ||
    lower.includes('k') ||
    lower.includes('expensive') ||
    lower.includes('cheap') ||
    lower.includes('affordable') ||
    /(?:under|below|above|around|less than|more than|\₹)\s*\d+/.test(lower)
  ) {
    type = 'budget';
  } else if (
    lower.includes('brand') ||
    lower.includes('asus') ||
    lower.includes('msi') ||
    lower.includes('nvidia') ||
    lower.includes('amd') ||
    lower.includes('intel') ||
    lower.includes('samsung') ||
    lower.includes('apple')
  ) {
    type = 'brand';
  } else if (
    lower.includes('category') ||
    lower.includes('mobile') ||
    lower.includes('laptop') ||
    lower.includes('gaming')
  ) {
    type = 'category';
  } else if (
    lower.includes('gpu') ||
    lower.includes('cpu') ||
    lower.includes('ram') ||
    lower.includes('storage') ||
    lower.includes('cooler') ||
    lower.includes('motherboard') ||
    lower.includes('case')
  ) {
    type = 'component';
  }

  return {
    isCorrection: true,
    correctionType: type,
    explanation: `User corrected AI on ${type}`,
  };
}

/** Formats an empathetic self-correcting response prefix */
export function formatSelfCorrectionPrefix(analysis: CorrectionAnalysis): string {
  if (!analysis.isCorrection) return '';

  switch (analysis.correctionType) {
    case 'budget':
      return `💡 **Got it! Thanks for clarifying your budget.** I've updated your preferences and recalculated:\n\n`;
    case 'brand':
      return `💡 **Understood! My apologies for the brand mixup.** I've updated the brand filter for you:\n\n`;
    case 'category':
      return `💡 **Got it! Switched to the correct category.** Here are the exact options you asked for:\n\n`;
    case 'component':
      return `💡 **Understood! Customizing the component based on your feedback:**\n\n`;
    default:
      return `💡 **Got it! Thanks for clarifying.** Let me get the exact right options for you:\n\n`;
  }
}
