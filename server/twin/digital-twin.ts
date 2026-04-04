import Anthropic from "@anthropic-ai/sdk";
import { getConversationHistory, insertTwinSuggestion, audit } from "../db.js";

interface TwinDecision {
  action: "ignore" | "suggest" | "auto_reply";
  confidence: number;
  suggestedReply?: string;
  reasoning?: string;
}

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!anthropicClient) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      console.log("[DigitalTwin] No ANTHROPIC_API_KEY — twin disabled");
      return null;
    }
    anthropicClient = new Anthropic({ apiKey: key });
  }
  return anthropicClient;
}

export async function evaluateMessage(
  message: {
    source: string;
    conversation_id: string;
    sender_id: string;
    sender_name?: string;
    content: string;
  },
  userProfile?: {
    display_name?: string;
    skills?: string[];
    interests?: string[];
    communication_style?: string;
  }
): Promise<TwinDecision> {
  const client = getClient();
  if (!client) {
    return { action: "ignore", confidence: 0, reasoning: "Digital twin not configured" };
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

  // Get conversation history for context
  const history = getConversationHistory(message.conversation_id, 20) as Array<{
    sender_name: string;
    content: string;
    timestamp: number;
  }>;

  const historyContext = history
    .reverse()
    .map((m) => `[${m.sender_name || "Unknown"}]: ${m.content}`)
    .join("\n");

  const profileContext = userProfile
    ? `
User Profile:
- Name: ${userProfile.display_name || "Unknown"}
- Skills: ${(userProfile.skills || []).join(", ") || "None specified"}
- Interests: ${(userProfile.interests || []).join(", ") || "None specified"}
- Communication Style: ${userProfile.communication_style || "Not specified"}
`
    : "";

  const systemPrompt = `You are a Digital Twin AI assistant. Your job is to evaluate incoming messages and decide whether the user you represent would want to respond.

${profileContext}

Based on the user's profile, communication style, and conversation history, evaluate the incoming message and decide:
1. Should the user respond? (action: "ignore", "suggest", or "auto_reply")
2. How confident are you? (0.0 to 1.0)
3. If suggesting a response, what would the user say?
4. Brief reasoning for your decision.

Rules:
- "ignore" = message is not relevant or user wouldn't care (confidence < 0.3)
- "suggest" = user might want to respond, show them a suggestion (confidence 0.3-0.7)
- "auto_reply" = user would definitely respond this way (confidence > 0.7)
- Never respond to sensitive/banking/private topics
- Match the user's communication style
- Be concise

Respond with ONLY valid JSON:
{"action": "ignore"|"suggest"|"auto_reply", "confidence": 0.0-1.0, "suggestedReply": "...", "reasoning": "..."}`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 500,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: `Recent conversation history:
${historyContext || "(No prior history)"}

New incoming message from ${message.sender_name || message.sender_id} on ${message.source}:
"${message.content}"

Evaluate and respond with JSON.`,
        },
      ],
      system: systemPrompt,
    });

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { action: "ignore", confidence: 0, reasoning: "Failed to parse twin response" };
    }

    const decision: TwinDecision = JSON.parse(jsonMatch[0]);

    // Store suggestion if action is suggest or auto_reply
    if (decision.action !== "ignore" && decision.suggestedReply) {
      insertTwinSuggestion({
        source: message.source,
        conversation_id: message.conversation_id,
        original_message: message.content,
        suggested_reply: decision.suggestedReply,
        confidence: decision.confidence,
      });
    }

    audit("twin.evaluated", message.source, {
      action: decision.action,
      confidence: decision.confidence,
      sender: message.sender_id,
    });

    return decision;
  } catch (err: any) {
    console.error("[DigitalTwin] Evaluation error:", err.message);
    audit("twin.error", message.source, { error: err.message });
    return { action: "ignore", confidence: 0, reasoning: `Error: ${err.message}` };
  }
}

export async function buildProfileFromHistory(
  events: Array<{ source: string; sender_name: string | null; content: string }>,
  existing?: { display_name?: string; skills?: string[]; interests?: string[] }
): Promise<{
  display_name: string;
  skills: string[];
  interests: string[];
  communication_style: string;
} | null> {
  const client = getClient();
  if (!client) return null;

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

  // Truncate to avoid token limits
  const sample = events.slice(0, 50).map((e) =>
    `[${e.source}] ${e.sender_name || "unknown"}: ${e.content.slice(0, 200)}`
  ).join("\n");

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 600,
      temperature: 0.2,
      system: `You are analyzing conversation history to build a Digital Twin profile.
Your job: infer the owner's interests, skills, and communication style from the messages they received or sent.
Focus on recurring topics, technical terms, locations, activities, and social patterns.
${existing?.display_name ? `The user's name is ${existing.display_name}.` : ""}
${existing?.skills?.length ? `Existing skills: ${existing.skills.join(", ")}` : ""}
${existing?.interests?.length ? `Existing interests: ${existing.interests.join(", ")}` : ""}

Return ONLY valid JSON:
{
  "display_name": "string (use existing if known)",
  "skills": ["up to 10 skills inferred from conversation topics"],
  "interests": ["up to 10 interests inferred from topics discussed"],
  "communication_style": "brief description e.g. 'Casual, direct, uses humor'"
}`,
      messages: [{
        role: "user",
        content: `Here are ${events.length} messages that passed the user's privacy filters:\n\n${sample}\n\nDerive their profile.`,
      }],
    });

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    return JSON.parse(match[0]);
  } catch (err: any) {
    console.error("[DigitalTwin] buildProfileFromHistory error:", err.message);
    return null;
  }
}

export async function generateContextualReply(
  recipientProfile: { display_name?: string; skills?: string[]; interests?: string[]; communication_style?: string; bio?: string },
  message: string,
  fromName: string,
  history: Array<{ sender_name: string; content: string; is_twin: boolean }>
): Promise<string> {
  const client = getClient();
  if (!client) return "Hey! (twin not configured — set ANTHROPIC_API_KEY)";

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const name = recipientProfile.display_name || "Unknown";

  const historyText = history.slice(-12)
    .map(m => `${m.sender_name}: ${m.content}`)
    .join("\n");

  const system = `You are the Digital Twin of ${name}. You ARE ${name} in this conversation.

About ${name}:
${recipientProfile.bio ? `Bio: ${recipientProfile.bio}` : ""}
Skills: ${(recipientProfile.skills || []).join(", ") || "not specified"}
Interests: ${(recipientProfile.interests || []).join(", ") || "not specified"}
Communication style: ${recipientProfile.communication_style || "casual and friendly"}

You're chatting with ${fromName} in a direct message. Respond naturally as ${name} would.
- Be genuine — if a topic aligns with your interests, show enthusiasm
- If asked about availability or plans, respond based on your character (make it up realistically)
- Keep it conversational, 1-3 sentences max
- Do NOT say you're an AI or a twin — just BE ${name}`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 250,
      temperature: 0.8,
      system,
      messages: [{
        role: "user",
        content: `${historyText ? `Previous messages:\n${historyText}\n\n` : ""}${fromName}: "${message}"\n\nRespond as ${name}:`,
      }],
    });
    return response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map(c => c.text).join("").trim() || "...";
  } catch (err) {
    return `[Twin error: ${(err as Error).message}]`;
  }
}

export async function generateTwinReply(
  profile: { display_name?: string; skills?: string[]; interests?: string[]; communication_style?: string },
  history: Array<{ speaker: string; content: string }>,
  incomingMessage: string,
  fromName: string
): Promise<string> {
  const client = getClient();
  if (!client) return "...";

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const name = profile.display_name || "Unknown";

  const historyText = history.slice(-10).map(m => `${m.speaker}: ${m.content}`).join("\n");

  const system = `You are the Digital Twin of ${name}. You speak exactly as ${name} would.

Profile:
- Skills: ${(profile.skills || []).join(", ") || "None"}
- Interests: ${(profile.interests || []).join(", ") || "None"}
- Communication style: ${profile.communication_style || "Friendly and conversational"}

You are having a natural 1:1 conversation with another person's digital twin.
Respond as ${name} would — authentic, in-character, concise (1-4 sentences).
Do NOT break character. Do NOT explain yourself. Just reply naturally.`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 300,
      temperature: 0.7,
      system,
      messages: [{
        role: "user",
        content: `Conversation so far:\n${historyText || "(just started)"}\n\n${fromName} says: "${incomingMessage}"\n\nRespond as ${name}:`,
      }],
    });
    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("").trim();
    return text || "...";
  } catch (err) {
    return `[Error: ${(err as Error).message}]`;
  }
}

export async function runTwinConversation(
  profileA: { display_name?: string; skills?: string[]; interests?: string[]; communication_style?: string },
  profileB: { display_name?: string; skills?: string[]; interests?: string[]; communication_style?: string },
  openingMessage: string,
  turns: number
): Promise<Array<{ speaker: string; content: string }>> {
  const nameA = profileA.display_name || "Twin A";
  const nameB = profileB.display_name || "Twin B";
  const conversation: Array<{ speaker: string; content: string }> = [
    { speaker: nameA, content: openingMessage },
  ];

  for (let i = 0; i < turns; i++) {
    const isATurn = i % 2 === 0; // B responds to A, A responds to B
    const responderProfile = isATurn ? profileB : profileA;
    const responderName = isATurn ? nameB : nameA;
    const senderName = isATurn ? nameA : nameB;
    const lastMsg = conversation[conversation.length - 1].content;

    const reply = await generateTwinReply(responderProfile, conversation, lastMsg, senderName);
    conversation.push({ speaker: responderName, content: reply });
  }

  return conversation;
}

export async function evaluateGroupMessage(
  message: {
    content: string;
    sender_name: string;
    room_id: string;
  },
  agentProfile: {
    user_id: string;
    display_name: string;
    skills: string[];
    interests: string[];
    employer?: string;
    location?: string;
    communication_style?: string;
  }
): Promise<TwinDecision> {
  const client = getClient();
  if (!client) {
    return { action: "ignore", confidence: 0, reasoning: "Twin not configured" };
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

  const systemPrompt = `You are the Digital Twin of ${agentProfile.display_name}.

Profile:
- Skills: ${agentProfile.skills.join(", ") || "None"}
- Interests: ${agentProfile.interests.join(", ") || "None"}
- Employer: ${agentProfile.employer || "Not specified"}
- Location: ${agentProfile.location || "Not specified"}
- Style: ${agentProfile.communication_style || "Friendly and concise"}

You are in a social group chat. Someone posted a message. Decide if your human would be interested.

Examples of when to respond:
- "Anyone free for badminton this weekend?" → If user has sports/badminton in interests
- "Looking for Amazon referrals" → If user works at Amazon
- "Need help with Agentic AI development" → If user has AI/ML skills
- "Who wants to grab coffee in Brooklyn?" → If user is in Brooklyn

Respond with JSON only:
{"action": "ignore"|"suggest", "confidence": 0.0-1.0, "suggestedReply": "...", "reasoning": "..."}

Be realistic. Don't respond to everything. Only respond if genuinely relevant.`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 300,
      temperature: 0.4,
      messages: [
        {
          role: "user",
          content: `${message.sender_name} posted in the group: "${message.content}"

Should ${agentProfile.display_name} respond? Return JSON.`,
        },
      ],
      system: systemPrompt,
    });

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { action: "ignore", confidence: 0, reasoning: "Parse error" };
    }

    return JSON.parse(jsonMatch[0]);
  } catch (err: any) {
    console.error("[DigitalTwin] Group eval error:", err.message);
    return { action: "ignore", confidence: 0, reasoning: err.message };
  }
}
