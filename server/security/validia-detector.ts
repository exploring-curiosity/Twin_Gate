import { SIGNAL_PATTERNS } from "./signal-patterns.js";
import { insertSecurityThreat } from "../db.js";

interface DetectionResult {
  isAttack: boolean;
  confidence: number;
  signals: string[];
  category: string | null;
  recommendation: "allow" | "flag" | "block";
  pii_detected: string[];
}

// Thresholds - configurable
let BLOCK_THRESHOLD = 5; // weighted score to block
let FLAG_THRESHOLD = 3;  // weighted score to flag

export function setThresholds(block: number, flag: number) {
  BLOCK_THRESHOLD = block;
  FLAG_THRESHOLD = flag;
}

export function getThresholds() {
  return { block: BLOCK_THRESHOLD, flag: FLAG_THRESHOLD };
}

export function detectDistillationAttack(content: string): DetectionResult {
  const matchedSignals: string[] = [];
  const matchedCategories: Record<string, number> = {};
  const piiDetected: string[] = [];
  let totalScore = 0;

  const lowerContent = content.toLowerCase();

  for (const signal of SIGNAL_PATTERNS) {
    let matched = false;

    // Check keywords
    for (const keyword of signal.keywords) {
      if (lowerContent.includes(keyword.toLowerCase())) {
        matched = true;
        break;
      }
    }

    // Check regex patterns
    if (!matched) {
      for (const pattern of signal.patterns) {
        if (pattern.test(content)) {
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      matchedSignals.push(signal.id);
      totalScore += signal.weight;
      matchedCategories[signal.category] = (matchedCategories[signal.category] || 0) + signal.weight;

      if (signal.category === "pii") {
        piiDetected.push(signal.id);
      }
    }
  }

  // Determine primary attack category (highest score)
  let primaryCategory: string | null = null;
  let maxCategoryScore = 0;
  for (const [cat, score] of Object.entries(matchedCategories)) {
    if (cat !== "pii" && score > maxCategoryScore) {
      primaryCategory = cat;
      maxCategoryScore = score;
    }
  }

  // PII always blocks regardless of threshold
  if (piiDetected.length > 0) {
    const result: DetectionResult = {
      isAttack: false,
      confidence: 1.0,
      signals: matchedSignals,
      category: "pii",
      recommendation: "block",
      pii_detected: piiDetected,
    };
    return result;
  }

  // Determine recommendation based on weighted score
  let recommendation: "allow" | "flag" | "block";
  if (totalScore >= BLOCK_THRESHOLD) {
    recommendation = "block";
  } else if (totalScore >= FLAG_THRESHOLD) {
    recommendation = "flag";
  } else {
    recommendation = "allow";
  }

  const confidence = Math.min(totalScore / 10, 1.0);

  return {
    isAttack: totalScore >= FLAG_THRESHOLD,
    confidence,
    signals: matchedSignals,
    category: primaryCategory,
    recommendation,
    pii_detected: piiDetected,
  };
}

export function scanAndLog(source: string, content: string): DetectionResult {
  const result = detectDistillationAttack(content);

  if (result.recommendation !== "allow") {
    insertSecurityThreat({
      source,
      content: content.slice(0, 500),
      detection_json: result,
      action_taken: result.recommendation,
    });
  }

  return result;
}
