import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Play, RefreshCw, Brain } from 'lucide-react';

interface Account {
  id: string;
  name: string;
  email?: string;
}

interface AccountStatus extends Account {
  google_connected: boolean;
  has_twin: boolean;
  twin_name: string;
  twin_skills: string[];
}

interface ChatMessage {
  speaker: string;
  content: string;
}

const TURN_OPTIONS = [4, 6, 8, 12];

const AVATAR_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

export function TwinTwinChat() {
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [accountA, setAccountA] = useState('');
  const [accountB, setAccountB] = useState('');
  const [openingMessage, setOpeningMessage] = useState('');
  const [turns, setTurns] = useState(6);
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/accounts');
        if (!res.ok) return;
        const list = await res.json() as Account[];
        const statuses = await Promise.all(list.map(async (a) => {
          try {
            const sr = await fetch(`/api/accounts/${a.id}/status`);
            return sr.ok ? await sr.json() as AccountStatus : { ...a, google_connected: false, has_twin: false, twin_name: a.name, twin_skills: [] };
          } catch {
            return { ...a, google_connected: false, has_twin: false, twin_name: a.name, twin_skills: [] };
          }
        }));
        setAccounts(statuses);
        // Auto-select first two with twins
        const withTwins = statuses.filter(s => s.has_twin);
        if (withTwins[0]) setAccountA(withTwins[0].id);
        if (withTwins[1]) setAccountB(withTwins[1].id);
      } catch { /* ignore */ }
    }
    load();
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [conversation]);

  async function startChat() {
    if (!accountA || !accountB || !openingMessage.trim()) return;
    if (accountA === accountB) { setError("Select two different accounts"); return; }
    setError('');
    setRunning(true);
    setConversation([]);
    try {
      const res = await fetch('/api/twin/chat-between', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_a: accountA, account_b: accountB, opening_message: openingMessage.trim(), turns }),
      });
      const data = await res.json() as { conversation?: ChatMessage[]; error?: string };
      if (data.conversation) {
        setConversation(data.conversation);
      } else {
        setError(data.error || 'Failed to start conversation');
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setRunning(false);
  }

  const twinAccounts = accounts.filter(a => a.has_twin);
  const profileA = accounts.find(a => a.id === accountA);
  const profileB = accounts.find(a => a.id === accountB);

  function getSpeakerColor(speaker: string) {
    const idx = accounts.findIndex(a => a.twin_name === speaker || a.name === speaker);
    return AVATAR_COLORS[Math.max(0, idx) % AVATAR_COLORS.length];
  }

  function isASpeaker(speaker: string) {
    return profileA && (speaker === profileA.twin_name || speaker === profileA.name);
  }

  const suggestions = [
    "Hey! What have you been up to lately?",
    "What are you working on these days?",
    "Any interesting projects or hobbies recently?",
    "What's keeping you busy this month?",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white m-0">Twin-to-Twin Chat</h2>
        <p className="text-sm text-gray-500 mt-0.5">Watch your digital twins have a natural conversation with each other.</p>
      </div>

      {twinAccounts.length < 2 ? (
        <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-xl p-6 text-center">
          <Brain size={32} className="mx-auto text-yellow-500 mb-3" />
          <p className="text-sm text-yellow-800 dark:text-yellow-300 font-medium">Need at least 2 accounts with digital twins</p>
          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Go to the Accounts tab → connect Google → build twin for each account.</p>
        </div>
      ) : (
        <>
          {/* Config panel */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Twin A</label>
                <select
                  value={accountA}
                  onChange={e => setAccountA(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="">Select account...</option>
                  {twinAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.twin_name || a.name}</option>
                  ))}
                </select>
                {profileA && (
                  <p className="text-xs text-gray-400 mt-1">{profileA.twin_skills.slice(0, 3).join(', ')}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Twin B</label>
                <select
                  value={accountB}
                  onChange={e => setAccountB(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="">Select account...</option>
                  {twinAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.twin_name || a.name}</option>
                  ))}
                </select>
                {profileB && (
                  <p className="text-xs text-gray-400 mt-1">{profileB.twin_skills.slice(0, 3).join(', ')}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Opening message (from Twin A)</label>
              <input
                value={openingMessage}
                onChange={e => setOpeningMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && startChat()}
                placeholder="What should Twin A say to start the conversation?"
                className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => setOpeningMessage(s)}
                    className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 dark:text-gray-400">Turns:</label>
                <div className="flex gap-1">
                  {TURN_OPTIONS.map(t => (
                    <button
                      key={t}
                      onClick={() => setTurns(t)}
                      className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                        turns === t
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={startChat}
                disabled={running || !accountA || !accountB || !openingMessage.trim() || accountA === accountB}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium ml-auto"
              >
                {running ? (
                  <><RefreshCw size={15} className="animate-spin" /> Generating...</>
                ) : (
                  <><Play size={15} /> Start Conversation</>
                )}
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
          </div>

          {/* Conversation display */}
          {(conversation.length > 0 || running) && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare size={16} className="text-purple-500" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white m-0">Conversation</h3>
                <span className="ml-auto text-xs text-gray-400">{conversation.length} messages</span>
              </div>

              <div ref={chatRef} className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {conversation.map((msg, i) => {
                  const isA = isASpeaker(msg.speaker);
                  const color = getSpeakerColor(msg.speaker);
                  return (
                    <div key={i} className={`flex gap-3 ${isA ? '' : 'flex-row-reverse'}`}>
                      {/* Avatar */}
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {msg.speaker.charAt(0).toUpperCase()}
                      </div>
                      <div className={`flex-1 max-w-[75%] ${isA ? '' : 'flex flex-col items-end'}`}>
                        <span className="text-xs text-gray-400 mb-1 block">{msg.speaker}</span>
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isA
                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-tl-sm'
                            : 'text-white rounded-tr-sm'
                        }`} style={!isA ? { backgroundColor: color } : {}}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {running && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0 animate-pulse" />
                    <div className="flex-1">
                      <div className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-tl-sm w-24 h-8 animate-pulse" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
