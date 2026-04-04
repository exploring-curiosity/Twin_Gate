import { Router } from "express";
import {
  insertDirectMessage, getDirectMessages, getMessageThreads,
  getAgentProfile, getAccount, getAccounts,
} from "../db.js";
import { generateContextualReply } from "../twin/digital-twin.js";

const router = Router();

router.get("/threads/:accountId", (req, res) => {
  const threads = getMessageThreads(req.params.accountId);
  const accounts = getAccounts();
  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]));
  res.json(threads.map(t => ({
    ...t,
    other: accountMap[t.other_id] || { id: t.other_id, name: "Unknown" },
    has_twin: Boolean(getAgentProfile(t.other_id)),
  })));
});

router.get("/", (req, res) => {
  const { me, other } = req.query as { me?: string; other?: string };
  if (!me || !other) { res.status(400).json({ error: "me and other required" }); return; }
  res.json(getDirectMessages(me, other));
});

router.post("/", async (req, res) => {
  const { from_id, to_id, content } = req.body as { from_id?: string; to_id?: string; content?: string };
  if (!from_id || !to_id || !content?.trim()) {
    res.status(400).json({ error: "from_id, to_id, and content required" });
    return;
  }

  const sender = getAccount(from_id);
  const recipient = getAccount(to_id);
  if (!sender) { res.status(404).json({ error: "Sender not found" }); return; }
  if (!recipient) { res.status(404).json({ error: "Recipient not found" }); return; }

  // Save user's message
  insertDirectMessage({ from_id, to_id, content: content.trim(), is_twin_response: false });

  // Get conversation history for context
  const history = getDirectMessages(from_id, to_id, 20).map(m => ({
    sender_name: m.from_id === to_id ? recipient.name : sender.name,
    content: m.content,
    is_twin: m.is_twin_response === 1,
  }));

  // Try recipient's OpenClaw first
  if (recipient.openclaw_url) {
    try {
      const openclawMessages = history.map(h => ({
        role: h.sender_name === recipient.name ? "assistant" : "user",
        content: h.content,
      }));
      // Append the new message
      openclawMessages.push({ role: "user", content: content.trim() });

      const cloudRes = await fetch(`${recipient.openclaw_url}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(recipient.openclaw_api_key ? { Authorization: `Bearer ${recipient.openclaw_api_key}` } : {}),
        },
        body: JSON.stringify({ messages: openclawMessages }),
        signal: AbortSignal.timeout(30_000),
      });

      if (cloudRes.ok) {
        const data = await cloudRes.json() as { reply?: string; message?: string; error?: string };
        const reply = data.reply || data.message || '';
        if (reply) {
          insertDirectMessage({ from_id: to_id, to_id: from_id, content: reply, is_twin_response: true });
          res.json({ sent: true, twin_reply: reply, twin_name: recipient.name, source: "openclaw" });
          return;
        }
      }
    } catch (err) {
      console.error(`[messages] OpenClaw reply failed for ${to_id}:`, (err as Error).message);
      // Fall through to local
    }
  }

  // Fall back: use local Claude profile
  const profile = getAgentProfile(to_id) as {
    display_name?: string; skills?: string[]; interests?: string[]; communication_style?: string;
  } | null;

  if (!profile) {
    res.json({ sent: true, twin_reply: null, reason: `${recipient.name} hasn't built a digital twin yet` });
    return;
  }

  try {
    const reply = await generateContextualReply(profile, content.trim(), sender.name, history);
    insertDirectMessage({ from_id: to_id, to_id: from_id, content: reply, is_twin_response: true });
    res.json({ sent: true, twin_reply: reply, twin_name: profile.display_name || recipient.name, source: "local" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
