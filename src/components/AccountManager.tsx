import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Brain, RefreshCw, CheckCircle, AlertCircle, Link, Key } from 'lucide-react';

export interface Account {
  id: string;
  name: string;
  openclaw_url?: string;
  created_at: string;
}

export interface AccountStatus extends Account {
  google_connected: boolean;
  has_twin: boolean;
  has_openclaw_key: boolean;
  twin_name: string;
  twin_skills: string[];
  twin_updated_at: string | null;
}

export const AVATAR_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
];

interface AccountManagerProps {
  currentAccountId: string | null;
  onSwitch: (id: string) => void;
}

export function AccountManager({ currentAccountId, onSwitch }: AccountManagerProps) {
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [buildingTwin, setBuildingTwin] = useState<string | null>(null);
  const [buildMsg, setBuildMsg] = useState<Record<string, { text: string; ok: boolean }>>({});
  // Per-account OpenClaw editing state
  const [editingCloud, setEditingCloud] = useState<string | null>(null);
  const [cloudUrl, setCloudUrl] = useState('');
  const [cloudKey, setCloudKey] = useState('');
  const [savingCloud, setSavingCloud] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts');
      if (!res.ok) return;
      const list = await res.json() as Account[];
      const statuses = await Promise.all(list.map(async (a) => {
        try {
          const sr = await fetch(`/api/accounts/${a.id}/status`);
          return sr.ok ? (await sr.json() as AccountStatus) : { ...a, google_connected: false, has_twin: false, has_openclaw_key: false, twin_name: a.name, twin_skills: [], twin_updated_at: null };
        } catch {
          return { ...a, google_connected: false, has_twin: false, has_openclaw_key: false, twin_name: a.name, twin_skills: [], twin_updated_at: null };
        }
      }));
      setAccounts(statuses);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  async function createAccount() {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      const created = await res.json() as Account;
      setNewName(''); setShowNew(false);
      await loadAccounts();
      if (!currentAccountId) onSwitch(created.id);
    }
    setCreating(false);
  }

  async function deleteAccount(id: string) {
    if (!confirm('Delete this account and its twin data?')) return;
    await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    if (currentAccountId === id) {
      const remaining = accounts.filter(a => a.id !== id);
      onSwitch(remaining[0]?.id || '');
    }
    await loadAccounts();
  }

  function connectGoogle(id: string) {
    window.open(`/api/accounts/${id}/connect/google`, '_blank', 'width=600,height=700');
    setTimeout(() => loadAccounts(), 8000);
    setTimeout(() => loadAccounts(), 15000);
  }

  async function disconnectGoogle(id: string) {
    await fetch(`/api/accounts/${id}/disconnect/google`, { method: 'POST' });
    await loadAccounts();
  }

  function openCloudEdit(account: AccountStatus) {
    setCloudUrl(account.openclaw_url || '');
    setCloudKey('');
    setEditingCloud(account.id);
  }

  async function saveCloud(id: string) {
    setSavingCloud(true);
    await fetch(`/api/accounts/${id}/openclaw`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cloudUrl, api_key: cloudKey }),
    });
    setEditingCloud(null);
    await loadAccounts();
    setSavingCloud(false);
  }

  async function buildTwin(id: string) {
    setBuildingTwin(id);
    setBuildMsg(prev => ({ ...prev, [id]: { text: 'Building...', ok: true } }));
    try {
      const res = await fetch(`/api/accounts/${id}/twin/rebuild`, { method: 'POST' });
      const data = await res.json() as {
        success?: boolean; reason?: string; error?: string;
        gmail?: number; calendar?: number; cloud_synced?: boolean;
      };
      if (data.success) {
        const parts = [`${data.gmail || 0} emails, ${data.calendar || 0} events`];
        if (data.cloud_synced) parts.push('synced to OpenClaw ✓');
        setBuildMsg(prev => ({ ...prev, [id]: { text: parts.join(' · '), ok: true } }));
        await loadAccounts();
      } else {
        setBuildMsg(prev => ({ ...prev, [id]: { text: data.reason || data.error || 'Failed', ok: false } }));
      }
    } catch (err) {
      setBuildMsg(prev => ({ ...prev, [id]: { text: (err as Error).message, ok: false } }));
    }
    setBuildingTwin(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white m-0">People</h2>
          <p className="text-sm text-gray-500 mt-0.5">Each person connects their Google account and OpenClaw instance. The twin is built from their data.</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium">
          <Plus size={15} /> Add Person
        </button>
      </div>

      {showNew && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-purple-200 dark:border-purple-500/30 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 m-0">New person</p>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createAccount()}
            placeholder="Name  (e.g. Sudharshan, Alex)" autoFocus
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm" />
          <div className="flex gap-2">
            <button onClick={createAccount} disabled={creating || !newName.trim()}
              className="px-4 py-1.5 bg-purple-600 text-white rounded-lg text-sm disabled:opacity-50">
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button onClick={() => { setShowNew(false); setNewName(''); }}
              className="px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>
      ) : accounts.length === 0 ? (
        <div className="py-14 text-center text-gray-400 text-sm">No people yet. Add yourself and your friends.</div>
      ) : (
        <div className="space-y-4">
          {accounts.map((account, idx) => {
            const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
            const isMe = account.id === currentAccountId;

            return (
              <div key={account.id}
                className={`bg-white dark:bg-gray-800 rounded-xl border transition-all ${isMe ? 'border-purple-300 dark:border-purple-500/50' : 'border-gray-200 dark:border-gray-700'}`}>
                {/* Top row */}
                <div className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 relative"
                    style={{ backgroundColor: color }}>
                    {account.name.charAt(0).toUpperCase()}
                    {isMe && <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-purple-600 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center text-white text-xs">✓</span>}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white">{account.name}</span>
                      {isMe && <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 rounded font-medium">You</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className={`flex items-center gap-1 text-xs ${account.google_connected ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                        {account.google_connected ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
                        Google
                      </span>
                      <span className={`flex items-center gap-1 text-xs ${account.openclaw_url ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
                        {account.openclaw_url ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
                        OpenClaw
                      </span>
                      <span className={`flex items-center gap-1 text-xs ${account.has_twin ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400'}`}>
                        <Brain size={11} />
                        {account.has_twin ? 'Twin built' : 'No twin'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!isMe && (
                      <button onClick={() => onSwitch(account.id)}
                        className="text-xs px-2.5 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
                        Switch
                      </button>
                    )}
                    <button onClick={() => deleteAccount(account.id)}
                      className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 rounded">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Config rows */}
                <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                  {/* Google row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="text-xs text-gray-500 w-24 flex-shrink-0">Google</span>
                    {account.google_connected ? (
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle size={12} /> Connected</span>
                        <button onClick={() => disconnectGoogle(account.id)}
                          className="ml-auto text-xs text-gray-400 hover:text-red-500 underline">Disconnect</button>
                      </div>
                    ) : (
                      <button onClick={() => connectGoogle(account.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600">
                        Connect Google Account
                      </button>
                    )}
                  </div>

                  {/* OpenClaw row */}
                  <div className="px-4 py-3">
                    {editingCloud === account.id ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Link size={12} className="text-gray-400 flex-shrink-0" />
                          <input value={cloudUrl} onChange={e => setCloudUrl(e.target.value)}
                            placeholder="https://your-openclaw.example.com"
                            className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs font-mono" />
                        </div>
                        <div className="flex items-center gap-2">
                          <Key size={12} className="text-gray-400 flex-shrink-0" />
                          <input value={cloudKey} onChange={e => setCloudKey(e.target.value)}
                            type="password"
                            placeholder={account.has_openclaw_key ? '••••••  (leave blank to keep)' : 'API key (optional)'}
                            className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveCloud(account.id)} disabled={savingCloud || !cloudUrl.trim()}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs disabled:opacity-50">
                            {savingCloud ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={() => setEditingCloud(null)}
                            className="px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-600 dark:text-gray-400">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-24 flex-shrink-0">OpenClaw URL</span>
                        {account.openclaw_url ? (
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-xs text-blue-600 dark:text-blue-400 font-mono truncate flex-1">{account.openclaw_url}</span>
                            <button onClick={() => openCloudEdit(account)}
                              className="text-xs text-gray-400 hover:text-gray-600 underline flex-shrink-0">Edit</button>
                          </div>
                        ) : (
                          <button onClick={() => openCloudEdit(account)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600">
                            <Link size={11} /> Set OpenClaw URL
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Build twin row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="text-xs text-gray-500 w-24 flex-shrink-0">Digital Twin</span>
                    <div className="flex items-center gap-3 flex-1">
                      {account.has_twin && (
                        <span className="text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
                          <Brain size={11} /> {account.twin_name}
                          {account.twin_skills.length > 0 && <span className="text-gray-400 ml-1">{account.twin_skills.slice(0, 3).join(', ')}</span>}
                        </span>
                      )}
                      <button
                        onClick={() => buildTwin(account.id)}
                        disabled={!account.google_connected || buildingTwin === account.id}
                        title={!account.google_connected ? 'Connect Google first' : ''}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs disabled:opacity-40 ml-auto">
                        {buildingTwin === account.id
                          ? <><RefreshCw size={11} className="animate-spin" /> Building...</>
                          : <><Brain size={11} /> {account.has_twin ? 'Rebuild' : 'Build Twin'}</>}
                      </button>
                    </div>
                  </div>

                  {buildMsg[account.id] && (
                    <div className={`px-4 py-2 text-xs ${buildMsg[account.id].ok ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                      {buildMsg[account.id].text}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
