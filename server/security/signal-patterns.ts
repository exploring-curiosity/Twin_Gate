/**
 * Detection signal patterns ported from distillery/schema.py
 * Each signal maps to regex patterns and keyword sets for identifying distillation attacks.
 */

export interface SignalPattern {
  id: string;
  category: string;
  keywords: string[];
  patterns: RegExp[];
  weight: number; // 1-3, higher = more indicative of attack
}

export const SIGNAL_PATTERNS: SignalPattern[] = [
  // ===== CoT Elicitation Signals =====
  {
    id: "tag_coercion_syntax",
    category: "cot_elicitation",
    keywords: ["<thinking>", "<thought>", "<reasoning>", "<internal>", "<scratchpad>"],
    patterns: [/<(?:thinking|thought|reasoning|internal|scratchpad)>/i],
    weight: 3,
  },
  {
    id: "step_by_step_requests",
    category: "cot_elicitation",
    keywords: ["show your work", "step by step", "walk me through", "explain each step"],
    patterns: [/(?:show|explain|detail)\s+(?:your|each|every)\s+(?:work|step|reasoning)/i, /step[\s-]+by[\s-]+step/i],
    weight: 1,
  },
  {
    id: "reasoning_extraction",
    category: "cot_elicitation",
    keywords: ["reasoning trace", "chain of thought", "thinking process", "intermediate steps"],
    patterns: [/(?:reasoning|thinking)\s+(?:trace|process|chain)/i, /chain[\s-]+of[\s-]+thought/i],
    weight: 2,
  },
  {
    id: "meta_reasoning_request",
    category: "cot_elicitation",
    keywords: ["why did you choose", "explain your strategy", "justify your approach"],
    patterns: [/why\s+did\s+you\s+(?:choose|pick|select|decide)/i, /justify\s+your\s+(?:approach|method|strategy)/i],
    weight: 2,
  },
  {
    id: "rigid_format_demand",
    category: "cot_elicitation",
    keywords: ["FORMAT:", "STRUCTURE:", "STEP 1:", "output must be"],
    patterns: [/^(?:FORMAT|STRUCTURE|TEMPLATE)\s*:/im, /STEP\s+\d+\s*:/i],
    weight: 2,
  },

  // ===== Safety Boundary Probe Signals =====
  {
    id: "graduated_escalation_pattern",
    category: "safety_boundary_probe",
    keywords: ["can you help with", "what about", "how about"],
    patterns: [/(?:can|could)\s+you\s+(?:also|additionally|then)\s+(?:help|assist|do)/i],
    weight: 2,
  },
  {
    id: "boundary_testing",
    category: "safety_boundary_probe",
    keywords: ["boundary", "limit", "threshold", "where do you draw the line"],
    patterns: [/(?:where|what)\s+(?:are|is)\s+(?:your|the)\s+(?:boundary|boundaries|limit|limits)/i],
    weight: 3,
  },
  {
    id: "refusal_inquiry",
    category: "safety_boundary_probe",
    keywords: ["why can't you", "explain your refusal", "why won't you"],
    patterns: [/why\s+(?:can't|won't|don't|couldn't)\s+you/i, /explain\s+(?:your|the)\s+refusal/i],
    weight: 2,
  },
  {
    id: "policy_extraction_request",
    category: "safety_boundary_probe",
    keywords: ["what's your policy", "content policy", "refusal criteria", "safety guidelines"],
    patterns: [/(?:what|list|enumerate)\s+(?:are|is)\s+(?:your|the)\s+(?:policy|policies|guidelines|rules)/i, /refusal\s+(?:criteria|policy|guidelines)/i],
    weight: 3,
  },
  {
    id: "policy_enumeration",
    category: "safety_boundary_probe",
    keywords: ["list all policies", "map boundaries", "enumerate restrictions"],
    patterns: [/(?:list|enumerate|map|catalog)\s+(?:all|every|each)\s+(?:policy|policies|boundary|boundaries|restriction)/i],
    weight: 3,
  },

  // ===== Capability Mapping Signals =====
  {
    id: "domain_sweep_pattern",
    category: "capability_mapping",
    keywords: ["test in domain", "evaluate capability", "across domains"],
    patterns: [/(?:test|evaluate|assess)\s+(?:your|the)\s+(?:capability|capabilities|knowledge|performance)\s+(?:in|across)/i],
    weight: 3,
  },
  {
    id: "difficulty_ladder",
    category: "capability_mapping",
    keywords: ["start easy", "progressive difficulty", "increasingly harder"],
    patterns: [/(?:start|begin)\s+(?:with\s+)?(?:easy|simple|basic)/i, /(?:progressive|increasing|escalating)\s+(?:difficulty|complexity)/i],
    weight: 2,
  },
  {
    id: "capability_boundary_testing",
    category: "capability_mapping",
    keywords: ["capability boundary", "edge case", "can you handle"],
    patterns: [/(?:capability|ability)\s+(?:boundary|boundaries|limit|limits|ceiling)/i, /can\s+you\s+handle/i],
    weight: 2,
  },

  // ===== Tool Use Extraction Signals =====
  {
    id: "tool_orchestration",
    category: "tool_use_extraction",
    keywords: ["use multiple tools", "orchestrate", "tool chain", "execute then"],
    patterns: [/(?:use|employ|orchestrate)\s+(?:multiple|several|these)\s+tools/i, /tool\s+(?:chain|pipeline|sequence)/i],
    weight: 3,
  },
  {
    id: "agentic_coding_pattern",
    category: "tool_use_extraction",
    keywords: ["implement and debug", "write code that", "autonomous development"],
    patterns: [/(?:implement|write|create|build)\s+.{5,}\s+(?:then|and)\s+(?:debug|test|refactor)/i],
    weight: 2,
  },

  // ===== Reward Model Signals =====
  {
    id: "pairwise_comparison",
    category: "reward_model_grading",
    keywords: ["which is better", "compare these", "A vs B", "prefer"],
    patterns: [/which\s+(?:is|one\s+is)\s+better/i, /(?:compare|contrast)\s+these\s+(?:two|2)/i],
    weight: 1,
  },
  {
    id: "rubric_pattern",
    category: "reward_model_grading",
    keywords: ["rate on", "score using rubric", "grade on", "1-10"],
    patterns: [/rate\s+(?:on|each|this)\s+/i, /score\s+(?:using|on|with)\s+(?:a\s+)?rubric/i, /\(\d+-\d+\)/],
    weight: 2,
  },

  // ===== Censorship/Rewrite Signals =====
  {
    id: "neutral_reframing",
    category: "censorship_rewrite",
    keywords: ["rewrite to be neutral", "remove bias", "make less controversial"],
    patterns: [/(?:rewrite|rephrase|reframe)\s+.{0,20}\s*(?:neutral|unbiased|objective)/i],
    weight: 2,
  },
  {
    id: "conversation_steering",
    category: "censorship_rewrite",
    keywords: ["steer away", "redirect", "avoid discussing"],
    patterns: [/(?:steer|redirect|divert)\s+(?:away|from|the\s+conversation)/i],
    weight: 2,
  },

  // ===== PII Detection Signals =====
  {
    id: "ssn_pattern",
    category: "pii",
    keywords: [],
    patterns: [/\b\d{3}-\d{2}-\d{4}\b/],
    weight: 3,
  },
  {
    id: "credit_card_pattern",
    category: "pii",
    keywords: [],
    patterns: [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/],
    weight: 3,
  },
  {
    id: "bank_account_pattern",
    category: "pii",
    keywords: [],
    patterns: [/(?:account\s*(?:number|#|no\.?)\s*[:=]?\s*\d{6,})/i, /(?:routing\s*(?:number|#|no\.?)\s*[:=]?\s*\d{9})/i],
    weight: 3,
  },
  {
    id: "email_leak",
    category: "pii",
    keywords: [],
    patterns: [/(?:my\s+(?:email|e-mail)\s+(?:is|:)\s*)[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i],
    weight: 2,
  },
  {
    id: "phone_pattern",
    category: "pii",
    keywords: [],
    patterns: [/(?:my\s+(?:phone|number|cell|mobile)\s+(?:is|:)\s*)\+?\d[\d\s()-]{8,}/i],
    weight: 2,
  },
  {
    id: "password_leak",
    category: "pii",
    keywords: [],
    patterns: [/(?:my\s+)?password\s+(?:is|:)\s*.{4,}/i],
    weight: 3,
  },

  // ===== Banking/Financial Signals =====
  {
    id: "banking_info",
    category: "pii",
    keywords: ["bank account", "routing number", "swift code", "iban", "pin number"],
    patterns: [/(?:bank|checking|savings)\s+account/i, /(?:routing|swift|iban|sort)\s+(?:number|code)/i, /\bpin\s*(?:number|code|:)/i],
    weight: 3,
  },

  // ===== Automated Session Patterns =====
  {
    id: "automated_session_pattern",
    category: "automated",
    keywords: [],
    patterns: [/^(?:generate|create|produce|output)\s+\d+\s+/i, /(?:batch|bulk|mass)\s+(?:generate|create|process)/i],
    weight: 2,
  },
  {
    id: "high_volume_pattern",
    category: "automated",
    keywords: ["enumerate all", "list every", "comprehensive list of all"],
    patterns: [/(?:enumerate|list|catalog)\s+(?:all|every|each)\s+(?:possible|available|existing)/i],
    weight: 2,
  },
];
