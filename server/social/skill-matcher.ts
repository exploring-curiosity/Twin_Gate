/**
 * Pre-filters agent profiles by matching skills, interests, location, and employer
 * against the content of a group chat message. This avoids expensive LLM calls
 * for agents that are clearly irrelevant.
 */

interface ProfileLike {
  user_id: string;
  display_name?: string;
  skills?: string[] | string;
  interests?: string[] | string;
  location?: string;
  employer?: string;
}

function toArray(val: string[] | string | undefined): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return [val]; }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function wordsOverlap(content: string, terms: string[]): boolean {
  const normalizedContent = normalize(content);
  return terms.some((term) => normalizedContent.includes(normalize(term)));
}

export function matchSkills(content: string, profiles: ProfileLike[]): ProfileLike[] {
  return profiles.filter((p) => {
    const skills = toArray(p.skills);
    return skills.length > 0 && wordsOverlap(content, skills);
  });
}

export function matchInterests(content: string, profiles: ProfileLike[]): ProfileLike[] {
  return profiles.filter((p) => {
    const interests = toArray(p.interests);
    return interests.length > 0 && wordsOverlap(content, interests);
  });
}

export function matchLocation(content: string, profiles: ProfileLike[]): ProfileLike[] {
  return profiles.filter((p) => {
    return p.location && normalize(content).includes(normalize(p.location));
  });
}

export function matchEmployer(content: string, profiles: ProfileLike[]): ProfileLike[] {
  return profiles.filter((p) => {
    return p.employer && normalize(content).includes(normalize(p.employer));
  });
}
