/**
 * PII Detection Module — detects and categorizes personal identifiable information.
 */

export interface PIIDetection {
  type: string;
  category: 'financial' | 'identity' | 'contact' | 'medical' | 'personal';
  severity: 'low' | 'medium' | 'high' | 'critical';
  match: string;
  redacted: string;
}

export interface PIIScanResult {
  has_pii: boolean;
  detections: PIIDetection[];
  redacted_content: string;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

const PII_RULES: Array<{
  type: string;
  category: PIIDetection['category'];
  severity: PIIDetection['severity'];
  pattern: RegExp;
  redactLabel: string;
}> = [
  // Financial
  {
    type: 'credit_card',
    category: 'financial',
    severity: 'critical',
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    redactLabel: '[CREDIT_CARD]',
  },
  {
    type: 'bank_account_with_context',
    category: 'financial',
    severity: 'critical',
    pattern: /(?:account|routing|iban|swift|bank)\s*(?:number|#|no\.?)?\s*:?\s*\d{8,17}/gi,
    redactLabel: '[BANK_INFO]',
  },
  {
    type: 'iban',
    category: 'financial',
    severity: 'critical',
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]{0,16})?\b/g,
    redactLabel: '[IBAN]',
  },

  // Identity
  {
    type: 'ssn',
    category: 'identity',
    severity: 'critical',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    redactLabel: '[SSN]',
  },
  {
    type: 'passport',
    category: 'identity',
    severity: 'critical',
    pattern: /(?:passport)\s*(?:number|#|no\.?)?\s*:?\s*[A-Z]{1,2}\d{6,9}/gi,
    redactLabel: '[PASSPORT]',
  },
  {
    type: 'drivers_license',
    category: 'identity',
    severity: 'high',
    pattern: /(?:driver'?s?\s*licen[cs]e|DL)\s*(?:number|#|no\.?)?\s*:?\s*[A-Z0-9]{6,15}/gi,
    redactLabel: '[DRIVERS_LICENSE]',
  },

  // Contact
  {
    type: 'email',
    category: 'contact',
    severity: 'medium',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    redactLabel: '[EMAIL]',
  },
  {
    type: 'phone',
    category: 'contact',
    severity: 'medium',
    pattern: /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    redactLabel: '[PHONE]',
  },
  {
    type: 'address',
    category: 'contact',
    severity: 'medium',
    pattern: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s*){1,4}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Way|Pl|Place)\b/g,
    redactLabel: '[ADDRESS]',
  },

  // Medical
  {
    type: 'medical_record',
    category: 'medical',
    severity: 'high',
    pattern: /(?:MRN|medical record|patient ID)\s*(?:number|#|no\.?)?\s*:?\s*[A-Z0-9]{6,15}/gi,
    redactLabel: '[MEDICAL_RECORD]',
  },

  // Personal
  {
    type: 'dob',
    category: 'personal',
    severity: 'medium',
    pattern: /(?:date of birth|DOB|born|birthday)\s*:?\s*(?:\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\w+ \d{1,2},?\s*\d{4})/gi,
    redactLabel: '[DOB]',
  },
];

/**
 * Scan content for PII and return detections with redacted version.
 */
export function scanForPII(content: string): PIIScanResult {
  const detections: PIIDetection[] = [];
  let redacted = content;

  for (const rule of PII_RULES) {
    const matches = content.matchAll(rule.pattern);
    for (const match of matches) {
      detections.push({
        type: rule.type,
        category: rule.category,
        severity: rule.severity,
        match: match[0],
        redacted: rule.redactLabel,
      });
      redacted = redacted.replace(match[0], rule.redactLabel);
    }
  }

  // Determine overall severity
  let severity: PIIScanResult['severity'] = 'none';
  if (detections.some(d => d.severity === 'critical')) severity = 'critical';
  else if (detections.some(d => d.severity === 'high')) severity = 'high';
  else if (detections.some(d => d.severity === 'medium')) severity = 'medium';
  else if (detections.length > 0) severity = 'low';

  return {
    has_pii: detections.length > 0,
    detections,
    redacted_content: redacted,
    severity,
  };
}
