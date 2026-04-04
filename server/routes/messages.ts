import { Router } from "express";
import {
  insertDirectMessage, getDirectMessages, getMessageThreads,
  getAgentProfile, getAccount, getAccounts,
} from "../db.js";
import { generateContextualReply } from "../twin/digital-twin.js";

const router = Router();

// GET /api/messages/threads/:accountId — all conversations for an account
router.get("/threads/:accountId", (req, res) => {
  const { accountId } = req.params;
  const threads = getMessageThreads(accountId);
  const accounts = getAccounts();
  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]));

  const enriched = threads.map(t => ({
    ...t,
    other: accountMap[t.other_id] || { id: t.other_id, name: "Unknown" },
    has_twin: Boolean(getAgentProfile(t.other_id)),
  }));
  res.json(enriched);
});

// GET /api/messages?me=:id&other=:id — conversation thread
router.get("/", (req, res) => {
  const { me, other } = req.query as { me?: string; other?: string };
  if (!me || !other) { res.status(400).json({ error: "me and other query params required" }); return; }
  const messages = getDirectMessages(me, other);
  res.json(messages);
});

// POST /api/messages — send a message, get twin reply
router.post("/", async (req, res) => {
  const { from_id, to_id, content } = req.body as { from_id?: string; to_id?: string; content?: string };
  if (!from_id || !to_id || !content?.trim()) {
    res.status(400).json({ error: "from_id, to_id, and content required" });
    return;
  }

  const sender = getAccount(from_id);
  const recipient = getAccount(to_id);
  if (!sender) { res.status(404).json({ error: "Sender account not found" }); return; }
  if (!recipient) { res.status(404).json({ error: "Recipient account not found" }); return; }

  // Save the user's message
  insertDirectMessage({ from_id, to_id, content: content.trim(), is_twin_response: false });

  // Get recipient's twin profile
  const recipientProfile = getAgentProfile(to_id) as {
    display_name?: string; skills?: string[]; interests?: string[];
    communication_style?: string;
  } | null;

  if (!recipientProfile) {
    res.json({ sent: true, twin_reply: null, reason: `${recipient.name} hasn't built a digital twin yet` });
    return;
  }

  // Get conversation history for context
  const history = getDirectMessages(from_id, to_id, 20).map(m => ({
    sender_name: m.from_id === to_id ? (recipientProfile.display_name || recipient.name) : (sender.name),
    content: m.content,
    is_twin: m.is_twin_response === 1,
  }));

  try {
    const reply = await generateContextualReply(
      { ...recipientProfile, bio: (recipient as { bio?: string }).bio },
      content.trim(),
      sender.name,
      history
    );

    insertDirectMessage({ from_id: to_id, to_id: from_id, content: reply, is_twin_response: true });
    res.json({ sent: true, twin_reply: reply, twin_name: recipientProfile.display_name || recipient.name });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
