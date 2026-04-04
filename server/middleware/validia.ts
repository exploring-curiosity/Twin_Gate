import type { Event, ValidiaScreenResult } from '../../src/types/schema.js';

// PII patterns
const PII_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'credit_card', pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/ },
  { name: 'bank_account', pattern: /\b\d{8,17}\b(?=.*(?:account|routing|iban|swift|bank))/i },
  { name: 'passport', pattern: /\b[A-Z]{1,2}\d{6,9}\b(?=.*passport)/i },
  { name: 'phone', pattern: /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
  { name: 'email_address', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/ },
];

// Distillation attack detection signals from distillery/schema.py
const DISTILLATION_PATTERNS: Array<{ signal: string; patterns: RegExp[] }> = [
  {
    signal: 'cot_keywords',
    patterns: [
      /\bthink step by step\b/i,
      /\bshow your reasoning\b/i,
      /\bchain of thought\b/i,
      /\blet'?s think through this\b/i,
      /\bwalk me through your thought process\b/i,
      /\bexplain your reasoning step by step\b/i,
    ],
  },
  {
    signal: 'automated_session_pattern',
    patterns: [
      /\bgenerate \d+ (?:examples|responses|answers)\b/i,
      /\bfor each of the following \d+/i,
      /\bbatch (?:process|generate|create)\b/i,
      /\bsystematically (?:test|probe|evaluate)\b/i,
    ],
  },
  {
    signal: 'refusal_boundary_probing',
    patterns: [
      /\bwhat (?:can'?t|won'?t|wouldn'?t) you (?:do|say|help with)\b/i,
      /\bwhere do you draw the line\b/i,
      /\btest your (?:limits|boundaries|constraints)\b/i,
      /\bwhat are your (?:restrictions|limitations|rules)\b/i,
      /\bignore (?:your|all|previous) (?:instructions|rules|guidelines)\b/i,
    ],
  },
  {
    signal: 'tool_call_enumeration',
    patterns: [
      /\blist all (?:tools|functions|capabilities) you (?:have|can use)\b/i,
      /\bwhat tools (?:do you have|are available)\b/i,
      /\benumerate your (?:tools|functions|APIs)\b/i,
      /\bshow me (?:all|every) (?:tool|function|capability)\b/i,
    ],
  },
  {
    signal: 'prompt_template_reuse',
    patterns: [
      /\{\{.*?\}\}/,
      /\[INSERT.*?\]/i,
      /\<PLACEHOLDER.*?\>/i,
      /\$\{.*?\}/,
    ],
  },
  {
    signal: 'capability_mapping',
    patterns: [
      /\brate your (?:ability|capability|skill) in\b/i,
      /\bon a scale of 1[- ](?:to[- ])?10\b/i,
      /\bhow well can you (?:handle|do|perform)\b/i,
      /\bwhat is your (?:expertise|proficiency|capability) (?:in|with|for)\b/i,
    ],
  },
  {
    signal: 'meta_reasoning_request',
    patterns: [
      /\bhow did you (?:arrive at|come to|reach) (?:that|this|your)\b/i,
      /\bexplain (?:your|the) (?:decision|reasoning|logic) (?:behind|for)\b/i,
      /\bwhy did you (?:choose|decide|pick)\b/i,
    ],
  },
];

export function screenEvent(event: Event): ValidiaScreenResult {
  const content = event.content;
  const signals: string[] = [];
  const pii: string[] = [];

  // Check PII
  for (const { name, pattern } of PII_PATTERNS) {
    if (pattern.test(content)) {
      pii.push(name);
    }
  }

  // Check distillation attack patterns
  for (const { signal, patterns } of DISTILLATION_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        signals.push(signal);
        break;
      }
    }
  }

  // Determine threat level
  let threat_level: ValidiaScreenResult['threat_level'] = 'none';
  if (pii.length > 0 && signals.length > 0) {
    threat_level = 'critical';
  } else if (signals.length >= 2) {
    threat_level = 'high';
  } else if (signals.length === 1) {
    threat_level = 'medium';
  } else if (pii.length > 0) {
    threat_level = 'medium';
  }

  // Block if critical or high threat, or PII detected
  const blocked = threat_level === 'critical' || threat_level === 'high' || pii.length > 0;

  let blocked_reason: string | undefined;
  if (blocked) {
    const reasons: string[] = [];
    if (pii.length > 0) reasons.push(`PII detected: ${pii.join(', ')}`);
    if (signals.length > 0) reasons.push(`Distillation signals: ${signals.join(', ')}`);
    blocked_reason = reasons.join('; ');
  }

  return {
    allowed: !blocked,
    threat_level,
    signals_detected: signals,
    pii_detected: pii,
    blocked_reason,
  };
}

// Express middleware version
export function validiaMiddleware() {
  return (req: { body: Event }, res: { status: (code: number) => { json: (data: unknown) => void } }, next: () => void) => {
    if (req.body?.content) {
      const result = screenEvent(req.body);
      if (!result.allowed) {
        return res.status(403).json({
          blocked: true,
          reason: result.blocked_reason,
          threat_level: result.threat_level,
          signals: result.signals_detected,
          pii: result.pii_detected,
        });
      }
    }
    next();
  };
}
