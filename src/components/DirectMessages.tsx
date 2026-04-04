import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MessageCircle, Bot } from 'lucide-react';
import { AVATAR_COLORS, type Account } from './AccountManager';

interface DirectMessage {
  id: number;
  from_id: string;
  to_id: string;
  content: string;
  is_twin_response: number;
  created_at: string;
}

interface Thread {
  other_id: string;
  last_message: string;
  last_at: string;
  other: Account;
  has_twin: boolean;
}

interface DirectMessagesProps {
  currentAccountId: string | null;
  accounts: Account[];
}

export function DirectMessages({ currentAccountId, accounts }: DirectMessagesProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [twinTyping, setTwinTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentAccount = accounts.find(a => a.id === currentAccountId);

  const loadThreads = useCallback(async () => {
    if (!currentAccountId) return;
    try {
      const res = await fetch(`/api/messages/threads/${currentAccountId}`);
      if (res.ok) setThreads(await res.json() as Thread[]);
    } catch { /* ignore */ }
  }, [currentAccountId]);

  const loadMessages = useCallback(async (otherId: string) => {
    if (!currentAccountId) return;
    try {
      const res = await fetch(`/api/messages?me=${currentAccountId}&other=${otherId}`);
      if (res.ok) setMessages(await res.json() as DirectMessage[]);
    } catch { /* ignore */ }
  }, [currentAccountId]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (activeThread) loadMessages(activeThread);
  }, [activeThread, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, twinTyping]);

  useEffect(() => {
    if (activeThread) inputRef.current?.focus();
  }, [activeThread]);

  async function sendMessage() {
    if (!input.trim() || !currentAccountId || !activeThread || sending) return;
    const content = input.trim();
    setInput('');
    setSending(true);

    // Optimistic: add user message immediately
    const optimistic: DirectMessage = {
      id: Date.now(),
      from_id: currentAccountId,
      to_id: activeThread,
      content,
      is_twin_response: 0,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setTwinTyping(true);

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_id: currentAccountId, to_id: activeThread, content }),
      });
      const data = await res.json() as { sent?: boolean; twin_reply?: string; twin_name?: string; reason?: string; error?: string };
      setTwinTyping(false);

      // Reload full thread to get real DB messages
      await loadMessages(activeThread);
      await loadThreads();

      if (!data.twin_reply && data.reason) {
        // Show a system note
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          from_id: 'system',
          to_id: currentAccountId,
          content: `ℹ️ ${data.reason}`,
          is_twin_response: 0,
          created_at: new Date().toISOString(),
        }]);
      }
    } catch (err) {
      setTwinTyping(false);
      console.error(err);
    }
    setSending(false);
  }

  function openNewThread(accountId: string) {
    setActiveThread(accountId);
    loadMessages(accountId);
  }

  const otherAccounts = accounts.filter(a => a.id !== currentAccountId);
  const activeAccount = accounts.find(a => a.id === activeThread);

  function getColor(id: string) {
    const idx = accounts.findIndex(a => a.id === id);
    return AVATAR_COLORS[Math.max(0, idx) % AVATAR_COLORS.length];
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString();
  }

  if (!currentAccountId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Select an account to use messaging.
      </div>
    );
  }

  // Merge threads with people who have no thread yet
  const threadedIds = new Set(threads.map(t => t.other_id));
  const noThreadPeople = otherAccounts.filter(a => !threadedIds.has(a.id));

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Left: contact list */}
      <div className="w-64 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col">
        <div className="p-3 border-b border-gray-100 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Messages</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Active threads */}
          {threads.map(thread => (
            <button
              key={thread.other_id}
              onClick={() => setActiveThread(thread.other_id)}
              className={`w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left ${activeThread === thread.other_id ? 'bg-purple-50 dark:bg-purple-500/10' : ''}`}
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: getColor(thread.other_id) }}>
                {(thread.other?.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{thread.other?.name || 'Unknown'}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-1">{formatTime(thread.last_at)}</span>
                </div>
                <p className="text-xs text-gray-400 truncate mt-0.5">{thread.last_message}</p>
              </div>
            </button>
          ))}

          {/* People with no thread yet */}
          {noThreadPeople.length > 0 && (
            <>
              {threads.length > 0 && <div className="mx-3 border-t border-gray-100 dark:border-gray-700 my-2" />}
              <p className="px-3 py-1.5 text-xs text-gray-400 font-medium">New message</p>
              {noThreadPeople.map(person => (
                <button
                  key={person.id}
                  onClick={() => openNewThread(person.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left ${activeThread === person.id ? 'bg-purple-50 dark:bg-purple-500/10' : ''}`}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: getColor(person.id) }}>
                    {person.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{person.name}</span>
                </button>
              ))}
            </>
          )}

          {otherAccounts.length === 0 && (
            <p className="px-3 py-4 text-xs text-gray-400 text-center">Add more people in the People tab to start messaging.</p>
          )}
        </div>
      </div>

      {/* Right: conversation */}
      {activeThread && activeAccount ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
              style={{ backgroundColor: getColor(activeThread) }}>
              {activeAccount.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white m-0">{activeAccount.name}</p>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Bot size={10} />
                <span>Digital Twin active</span>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <MessageCircle size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-sm text-gray-400">Start a conversation with {activeAccount.name}'s twin</p>
                </div>
              </div>
            )}
            {messages.map((msg) => {
              const isMe = msg.from_id === currentAccountId;
              const isSystem = msg.from_id === 'system';
              if (isSystem) return (
                <div key={msg.id} className="flex justify-center">
                  <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">{msg.content}</span>
                </div>
              );
              return (
                <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  {!isMe && (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 self-end"
                      style={{ backgroundColor: getColor(msg.from_id) }}>
                      {activeAccount.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className={`max-w-[70%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isMe
                        ? 'bg-purple-600 text-white rounded-br-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-sm'
                    }`}>
                      {msg.content}
                    </div>
                    <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                      {msg.is_twin_response === 1 && !isMe && (
                        <span className="text-xs text-gray-400 flex items-center gap-0.5"><Bot size={9} /> twin</span>
                      )}
                      <span className="text-xs text-gray-300 dark:text-gray-600">{formatTime(msg.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Twin typing indicator */}
            {twinTyping && (
              <div className="flex gap-2 items-end">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: getColor(activeThread) }}>
                  {activeAccount.name.charAt(0).toUpperCase()}
                </div>
                <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder={`Message ${activeAccount.name}...`}
                className="flex-1 px-4 py-2.5 rounded-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm focus:outline-none focus:border-purple-400 dark:focus:border-purple-500"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || sending || twinTyping}
                className="w-10 h-10 flex items-center justify-center bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:opacity-40 flex-shrink-0 transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 text-center">
              {activeAccount.name}'s digital twin will respond automatically
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <MessageCircle size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm">Select a person to start messaging</p>
            <p className="text-xs mt-1 text-gray-300 dark:text-gray-600">Their digital twin will respond on their behalf</p>
          </div>
        </div>
      )}
    </div>
  );
}
