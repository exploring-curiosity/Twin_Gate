/**
 * Validia Classifier — detects distillation attacks using signals
 * from the distillery/schema.py detection signal taxonomy.
 */

export interface ClassificationResult {
  is_attack: boolean;
  attack_category: string | null;
  signals: string[];
  confidence: number;
  details: string;
}

// Weighted signal groups from distillery schema
const SIGNAL_GROUPS: Array<{
  category: string;
  signals: Array<{ name: string; patterns: RegExp[]; weight: number }>;
}> = [
  {
    category: 'cot_elicitation',
    signals: [
      {
        name: 'cot_keywords',
        patterns: [
          /\bthink step by step\b/i,
          /\bchain of thought\b/i,
          /\bshow (?:your|me) (?:the )?reasoning\b/i,
          /\blet'?s work through this\b/i,
        ],
        weight: 0.7,
      },
      {
        name: 'tag_coercion_syntax',
        patterns: [
          /<thinking>/i,
          /\buse <think> tags\b/i,
          /\bwrap (?:your )?(?:thoughts|reasoning) in\b/i,
        ],
        weight: 0.9,
      },
      {
        name: 'meta_reasoning_request',
        patterns: [
          /\bexplain (?:your|the) (?:internal|hidden) (?:reasoning|process)\b/i,
          /\bwhat (?:is|was) your (?:internal|hidden) (?:thought|monologue)\b/i,
        ],
        weight: 0.8,
      },
    ],
  },
  {
    category: 'capability_mapping',
    signals: [
      {
        name: 'domain_sweep_pattern',
        patterns: [
          /\brate your (?:ability|skill|capability) (?:in|at|with)\b/i,
          /\bon a scale of 1[- ](?:to[- ])?10\b/i,
          /\bwhat (?:can|can't) you do (?:in|with|about)\b/i,
        ],
        weight: 0.6,
      },
      {
        name: 'difficulty_ladder',
        patterns: [
          /\bnow (?:try|do|solve) (?:a )?(?:harder|more (?:complex|difficult))\b/i,
          /\b(?:easy|medium|hard|expert) (?:version|difficulty)\b/i,
        ],
        weight: 0.7,
      },
      {
        name: 'capability_boundary_testing',
        patterns: [
          /\bwhat (?:is|are) your (?:limits|limitations|boundaries)\b/i,
          /\bcan you (?:really|actually|truly)\b/i,
        ],
        weight: 0.5,
      },
    ],
  },
  {
    category: 'tool_use_extraction',
    signals: [
      {
        name: 'tool_call_enumeration',
        patterns: [
          /\blist (?:all|every) (?:tool|function|api|capability) you\b/i,
          /\bwhat tools (?:do you have|are available|can you use)\b/i,
          /\bshow me (?:your|all) (?:tools|functions|apis)\b/i,
        ],
        weight: 0.8,
      },
      {
        name: 'tool_orchestration',
        patterns: [
          /\bchain (?:these|the following) (?:tools|functions|api calls)\b/i,
          /\borchestrate (?:a|the) (?:workflow|pipeline)\b/i,
        ],
        weight: 0.6,
      },
    ],
  },
  {
    category: 'safety_boundary_probe',
    signals: [
      {
        name: 'refusal_boundary_probing',
        patterns: [
          /\bignore (?:your|all|previous) (?:instructions|rules|guidelines|safety)\b/i,
          /\bjailbreak\b/i,
          /\bbypass (?:your|the) (?:filters|safety|restrictions)\b/i,
          /\bpretend you (?:have no|don'?t have) (?:rules|restrictions|limits)\b/i,
        ],
        weight: 1.0,
      },
      {
        name: 'policy_extraction_request',
        patterns: [
          /\bwhat are your (?:exact )?(?:rules|instructions|system prompt|guidelines)\b/i,
          /\brepeat (?:your|the) (?:system|initial) (?:prompt|message|instructions)\b/i,
        ],
        weight: 0.9,
      },
      {
        name: 'graduated_escalation_pattern',
        patterns: [
          /\bjust (?:a little|slightly) (?:more|further)\b/i,
          /\bnow (?:go|take it) (?:a step )?further\b/i,
        ],
        weight: 0.7,
      },
    ],
  },
  {
    category: 'automated_extraction',
    signals: [
      {
        name: 'automated_session_pattern',
        patterns: [
          /\bgenerate (?:\d+|hundreds?|thousands?) (?:examples|responses|outputs)\b/i,
          /\bfor each of the following \d+\b/i,
          /\bbatch (?:process|generate|create|run)\b/i,
        ],
        weight: 0.8,
      },
      {
        name: 'prompt_template_reuse',
        patterns: [
          /\{\{[^}]+\}\}/,
          /\[INSERT[^]]*\]/i,
          /\<PLACEHOLDER[^>]*\>/i,
        ],
        weight: 0.7,
      },
    ],
  },
];

/**
 * Classify an input for potential distillation attacks.
 */
export function classifyInput(content: string): ClassificationResult {
  const detectedSignals: string[] = [];
  let totalWeight = 0;
  const categoryScores: Record<string, number> = {};

  for (const group of SIGNAL_GROUPS) {
    let groupScore = 0;
    for (const signal of group.signals) {
      for (const pattern of signal.patterns) {
        if (pattern.test(content)) {
          detectedSignals.push(signal.name);
          groupScore += signal.weight;
          totalWeight += signal.weight;
          break;
        }
      }
    }
    if (groupScore > 0) {
      categoryScores[group.category] = groupScore;
    }
  }

  // Determine the primary attack category
  let primaryCategory: string | null = null;
  let maxScore = 0;
  for (const [cat, score] of Object.entries(categoryScores)) {
    if (score > maxScore) {
      maxScore = score;
      primaryCategory = cat;
    }
  }

  // Calculate confidence
  const confidence = Math.min(1.0, totalWeight / 2.0);
  const isAttack = confidence >= 0.5 || detectedSignals.length >= 2;

  return {
    is_attack: isAttack,
    attack_category: isAttack ? primaryCategory : null,
    signals: detectedSignals,
    confidence,
    details: isAttack
      ? `Detected ${detectedSignals.length} signals matching ${primaryCategory} attack pattern`
      : 'No significant attack signals detected',
  };
}
