import { useState, useEffect, useCallback } from 'react';
import { Cloud, Wifi, WifiOff, Send, Activity, Settings, Key, Link } from 'lucide-react';

interface HealthStatus {
  ok: boolean;
  latency_ms?: number;
  status?: string;
  error?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface StreamEvent {
  type: string;
  source?: string;
  filtered?: boolean;
  securityBlocked?: boolean;
  sentToCloud?: boolean;
  filterReason?: string;
  timestamp?: number;
}

export function CloudStatus() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [testEvent, setTestEvent] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [liveEvents, setLiveEvents] = useState<StreamEvent[]>([]);

  // Config state
  const [configUrl, setConfigUrl] = useState('');
  const [configApiKey, setConfigApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/cloud/status');
      if (res.ok) setHealth(await res.json());
      else setHealth({ ok: false, status: `HTTP ${res.status}` });
    } catch {
      setHealth({ ok: false, status: 'Server unreachable' });
    }
    setChecking(false);
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/cloud/config');
      if (res.ok) {
        const data = await res.json() as { url: string; has_api_key: boolean };
        setConfigUrl(data.url || '');
        setHasApiKey(data.has_api_key);
      }
    } catch { /* ignore */ }
  }, []);

  async function saveConfig() {
    setSavingConfig(true);
    setConfigSaved(null);
    try {
      const res = await fetch('/api/cloud/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: configUrl, api_key: configApiKey }),
      });
      const text = await res.text();
      let data: { saved?: boolean; health?: HealthStatus; error?: string };
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        setConfigSaved(`Server error (${res.status}): ${text.slice(0, 120)}`);
        setSavingConfig(false);
        return;
      }
      if (data.saved) {
        setConfigSaved('Saved');
        if (configApiKey) { setConfigApiKey(''); setHasApiKey(true); }
        if (data.health) setHealth(data.health);
        setTimeout(() => setConfigSaved(null), 3000);
      } else {
        setConfigSaved(data.error || 'Save failed');
      }
    } catch (err) {
      setConfigSaved((err as Error).message);
    }
    setSavingConfig(false);
  }

  useEffect(() => {
    checkHealth();
    loadConfig();

    // Subscribe to SSE pipeline events
    const sse = new EventSource('/api/stream');
    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as StreamEvent;
        setLiveEvents((prev) => [data, ...prev].slice(0, 50));
      } catch { /* skip malformed */ }
    };
    return () => sse.close();
  }, [checkHealth, loadConfig]);

  async function sendTestEvent() {
    if (!testEvent.trim()) return;
    setSending(true);
    setTestResult(null);
    try {
      // Route through local pipeline (security check → permissions → cloud)
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'manual',
          conversation_id: 'test-ui',
          sender_id: 'zeroclaw-ui',
          sender_name: 'ZeroClaw Test',
          content: testEvent,
          timestamp: Date.now(),
        }),
      });
      const data = await res.json() as { stored?: boolean; sent_to_cloud?: boolean; event_id?: string; blocked?: boolean; reason?: string; error?: string };
      if (data.blocked) setTestResult(`Blocked: ${data.reason}`);
      else if (data.stored) setTestResult(`Stored · Cloud: ${data.sent_to_cloud ? 'sent' : 'skipped'} · ID: ${data.event_id}`);
      else setTestResult(data.error || 'Unknown result');
    } catch (err) {
      setTestResult((err as Error).message);
    }
    setSending(false);
  }

  async function sendChat() {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content: chatInput };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch('/api/cloud/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      if (data.reply) {
        setChatMessages([...updated, { role: 'assistant', content: data.reply }]);
      } else {
        setChatMessages([...updated, { role: 'assistant', content: `Error: ${data.error || 'no reply'}` }]);
      }
    } catch (err) {
      setChatMessages([...updated, { role: 'assistant', content: `Error: ${(err as Error).message}` }]);
    }
    setChatLoading(false);
  }

  const statusColor = health?.ok ? 'text-green-500' : 'text-gray-400';
  const StatusIcon = health?.ok ? Wifi : WifiOff;

  return (
    <div className="space-y-6">
      {/* Connection card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${health?.ok ? 'bg-green-100 dark:bg-green-500/20' : 'bg-gray-100 dark:bg-gray-700'}`}>
              <StatusIcon size={24} className={statusColor} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0">Cloud OpenClaw</h3>
              <p className="text-sm text-gray-500 m-0">
                {health === null ? 'Checking...' : health.ok ? `Connected · ${health.latency_ms ?? '?'}ms` : health.status || 'Not connected'}
              </p>
            </div>
          </div>
          <button
            onClick={checkHealth}
            disabled={checking}
            className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
          >
            {checking ? 'Checking...' : 'Refresh'}
          </button>
        </div>

        {!health?.ok && !configUrl && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-lg text-sm text-yellow-800 dark:text-yellow-300">
            Configure your Cloud OpenClaw URL below to connect.
          </div>
        )}
      </div>

      {/* Cloud URL configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={18} className="text-indigo-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0">Cloud Configuration</h3>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              <Link size={11} className="inline mr-1" />Cloud OpenClaw URL
            </label>
            <input
              value={configUrl}
              onChange={(e) => setConfigUrl(e.target.value)}
              placeholder="https://your-openclaw-instance.example.com"
              className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              <Key size={11} className="inline mr-1" />API Key {hasApiKey && <span className="text-green-500">(saved)</span>}
            </label>
            <input
              value={configApiKey}
              onChange={(e) => setConfigApiKey(e.target.value)}
              type="password"
              placeholder={hasApiKey ? '••••••••  (leave blank to keep existing)' : 'Optional — enter if your instance requires auth'}
              className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={saveConfig}
              disabled={savingConfig || !configUrl.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
            >
              {savingConfig ? 'Saving...' : 'Save & Test Connection'}
            </button>
            {configSaved && (
              <span className={`text-sm ${configSaved === 'Saved' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {configSaved}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Test event sender */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Send size={18} className="text-purple-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0">Send Test Event</h3>
        </div>
        <div className="flex gap-2 mb-3">
          <input
            value={testEvent}
            onChange={(e) => setTestEvent(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendTestEvent()}
            placeholder="Type a test message to send through the pipeline..."
            className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
          />
          <button
            onClick={sendTestEvent}
            disabled={sending}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
        {testResult && (
          <p className="text-sm text-gray-600 dark:text-gray-400 m-0">Result: <span className="font-mono">{testResult}</span></p>
        )}
      </div>

      {/* Chat with cloud twin */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Cloud size={18} className="text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0">Chat with Cloud Twin</h3>
        </div>

        <div className="h-48 overflow-y-auto space-y-3 mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          {chatMessages.length === 0 ? (
            <p className="text-sm text-gray-400 text-center mt-16">Send a message to chat with your Cloud OpenClaw instance.</p>
          ) : (
            chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                  m.role === 'user'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'
                }`}>
                  {m.content}
                </div>
              </div>
            ))
          )}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400">
                Thinking...
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendChat()}
            placeholder="Message Cloud OpenClaw..."
            className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
          />
          <button
            onClick={sendChat}
            disabled={chatLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            Send
          </button>
        </div>
      </div>

      {/* Live pipeline events */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={18} className="text-green-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0">Live Pipeline Events</h3>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
            Live
          </span>
        </div>

        {liveEvents.length === 0 ? (
          <p className="text-sm text-gray-400">Waiting for events... Activity from Discord, Gmail, and Slack will appear here in real-time.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {liveEvents.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  e.securityBlocked ? 'bg-red-500'
                  : e.filtered ? 'bg-yellow-500'
                  : e.sentToCloud ? 'bg-green-500'
                  : 'bg-gray-400'
                }`} />
                <span className="font-mono text-gray-500">{e.source || 'unknown'}</span>
                <span className="flex-1">
                  {e.securityBlocked ? 'Security blocked'
                  : e.filtered ? `Filtered: ${e.filterReason || ''}`
                  : e.sentToCloud ? 'Sent to cloud'
                  : 'Processed'}
                </span>
                {e.timestamp && (
                  <span className="text-gray-400">{new Date(e.timestamp).toLocaleTimeString()}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
