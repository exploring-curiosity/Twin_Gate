/**
 * Interest matching engine for social agent layer.
 * Matches incoming messages against user interest profiles.
 */

// Common interest categories and their keywords
const INTEREST_KEYWORDS: Record<string, string[]> = {
  sports: ['badminton', 'tennis', 'basketball', 'soccer', 'football', 'cricket', 'volleyball', 'gym', 'workout', 'running', 'hiking', 'swimming', 'yoga', 'pickleball', 'golf'],
  tech: ['ai', 'agentic', 'machine learning', 'coding', 'programming', 'startup', 'hackathon', 'open source', 'development', 'software', 'cloud', 'devops', 'llm', 'rag'],
  social: ['dinner', 'lunch', 'brunch', 'coffee', 'drinks', 'party', 'gathering', 'meetup', 'hangout', 'karaoke'],
  career: ['referral', 'job', 'hiring', 'interview', 'resume', 'linkedin', 'networking', 'career', 'opportunity', 'position'],
  music: ['concert', 'music', 'band', 'festival', 'spotify', 'playlist', 'dj', 'live music'],
  travel: ['travel', 'trip', 'vacation', 'flight', 'hotel', 'airbnb', 'road trip'],
  food: ['restaurant', 'food', 'cooking', 'recipe', 'cuisine', 'foodie', 'baking'],
  gaming: ['game', 'gaming', 'steam', 'console', 'esports', 'board game', 'tabletop'],
};

export interface MatchResult {
  score: number;
  matched_interests: string[];
  matched_categories: string[];
}

/**
 * Score how well a message matches a user's interests.
 * Returns a score from 0 to 1 and the matched interests.
 */
export function matchInterests(
  messageContent: string,
  userInterests: string[]
): MatchResult {
  const lowerContent = messageContent.toLowerCase();
  const matchedInterests: string[] = [];
  const matchedCategories: Set<string> = new Set();

  // Direct interest matching
  for (const interest of userInterests) {
    if (lowerContent.includes(interest.toLowerCase())) {
      matchedInterests.push(interest);
    }
  }

  // Category-based matching
  for (const [category, keywords] of Object.entries(INTEREST_KEYWORDS)) {
    // Check if user has interests in this category
    const userHasCategory = userInterests.some(interest =>
      keywords.some(kw => interest.toLowerCase().includes(kw) || kw.includes(interest.toLowerCase()))
    );

    if (userHasCategory) {
      // Check if message is about this category
      const messageMatchesCategory = keywords.some(kw => lowerContent.includes(kw));
      if (messageMatchesCategory) {
        matchedCategories.add(category);
      }
    }
  }

  // Calculate score
  let score = 0;
  if (matchedInterests.length > 0) {
    score += 0.5 + (matchedInterests.length * 0.1);
  }
  if (matchedCategories.size > 0) {
    score += 0.3 + (matchedCategories.size * 0.1);
  }

  // Cap at 1.0
  score = Math.min(1.0, score);

  return {
    score,
    matched_interests: matchedInterests,
    matched_categories: Array.from(matchedCategories),
  };
}

/**
 * Detect if a message is asking about availability or plans.
 */
export function isAvailabilityQuery(content: string): boolean {
  const patterns = [
    /\b(?:anyone|who'?s|anybody) (?:free|available|down|interested)\b/i,
    /\bwho (?:wants|can|would like) to\b/i,
    /\blooking for (?:someone|people|anyone)\b/i,
    /\bthis weekend\b/i,
    /\btonight\b/i,
    /\btomorrow\b/i,
    /\bneed (?:help|someone|a hand)\b/i,
  ];
  return patterns.some(p => p.test(content));
}

/**
 * Detect if a message is a referral request.
 */
export function isReferralRequest(content: string): boolean {
  const patterns = [
    /\b(?:looking for|need|want) (?:a )?referral/i,
    /\breferral (?:for|to|at)\b/i,
    /\bcan anyone refer\b/i,
    /\b(?:hiring|openings?) at\b/i,
  ];
  return patterns.some(p => p.test(content));
}

/**
 * Detect if a message is asking about skills/expertise.
 */
export function isSkillRequest(content: string): boolean {
  const patterns = [
    /\bneed help with\b/i,
    /\blooking for (?:someone|an expert|help)\b/i,
    /\banyone (?:know|experienced|skilled) (?:in|with|about)\b/i,
    /\bwho (?:knows|can help|is good at)\b/i,
  ];
  return patterns.some(p => p.test(content));
}
