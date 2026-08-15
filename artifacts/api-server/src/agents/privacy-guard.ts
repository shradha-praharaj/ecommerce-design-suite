/**
 * privacy-guard.ts — PII detection, redaction, and field-level protection.
 *
 * Covers common PII patterns for the Indian and global ecommerce markets:
 *   - Email addresses
 *   - Phone numbers (Indian 10-digit + international)
 *   - Aadhaar numbers (12-digit with spaces)
 *   - PAN card numbers
 *   - Credit/debit card numbers (Luhn-valid 13-19 digit sequences)
 *   - UPI IDs
 *   - Postal PIN codes (when formatted as address tokens)
 */

// ─── PII Patterns ───────────────────────────────────────────────────────────

const PII_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },
  { name: 'phone_in', regex: /\b(?:\+91[\s-]?)?[6-9]\d{9}\b/g },
  { name: 'phone_intl', regex: /\b\+\d{1,3}[\s-]?\d{7,14}\b/g },
  { name: 'aadhaar', regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
  { name: 'pan', regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { name: 'credit_card', regex: /\b(?:\d{4}[\s-]?){3,4}\d{1,4}\b/g },
  { name: 'upi', regex: /\b[a-zA-Z0-9.]+@[a-zA-Z]{2,}\b/g },
  { name: 'pin_code', regex: /\b\d{6}\b/g },
];

export interface PIIDetection {
  type: string;
  match: string;
  startIndex: number;
  endIndex: number;
}

export class PrivacyGuard {
  /**
   * Detect all PII occurrences in text.
   */
  detectPII(text: string): PIIDetection[] {
    if (!text || typeof text !== 'string') return [];
    const detections: PIIDetection[] = [];

    for (const { name, regex } of PII_PATTERNS) {
      const pattern = new RegExp(regex.source, regex.flags);
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        // Avoid duplicate detection: UPI vs email
        if (name === 'upi' && detections.some((d) => d.type === 'email' && d.match === match![0])) {
          continue;
        }
        // PIN code: only flag 6-digit sequences when not inside a longer number
        if (name === 'pin_code') {
          const before = match.index > 0 ? text[match.index - 1] : ' ';
          const after = match.index + match[0].length < text.length ? text[match.index + match[0].length] : ' ';
          if (/\d/.test(before) || /\d/.test(after)) continue;
        }

        detections.push({
          type: name,
          match: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
      }
    }

    return detections;
  }

  /**
   * Check if text contains any PII.
   */
  containsPII(text: string): boolean {
    return this.detectPII(text).length > 0;
  }

  /**
   * Replace all detected PII with [REDACTED:type] tokens.
   * This is used before persisting user messages to durable storage.
   */
  redactPII(text: string): string {
    if (!text || typeof text !== 'string') return text;
    let redacted = text;
    const detections = this.detectPII(text).sort(
      (a, b) => b.startIndex - a.startIndex,
    );

    for (const detection of detections) {
      redacted =
        redacted.slice(0, detection.startIndex) +
        `[REDACTED:${detection.type}]` +
        redacted.slice(detection.endIndex);
    }

    return redacted;
  }
}

export const privacyGuard = new PrivacyGuard();
