import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, RefreshCw, User, Mail, Calendar, Brain, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react';

interface Account {
  id: string;
  name: string;
  email?: string;
  avatar_color?: string;
  created_at: string;
}

interface AccountStatus extends Account {
  google_connected: boolean;
  has_twin: boolean;
  twin_skills: string[];
  twin_name: string;
}

interface AccountManagerProps {
  onSelectForChat?: (account: Account) => void;
}

export function AccountManager({ onSelectForChat }: AccountManagerProps) {
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [buildingTwin, setBuildingTwin] = useState<string | null>(null);
  const [buildResult, setBuildResult] = useState<Record<string, string>>({});

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts');
      if (!res.ok) return;
      const list = await res.json() as Account[];
      // Load status for each account in parallel
      const statuses = await Promise.all(
        list.map(async (a) => {
          try {
            const sr = await fetch(`/api/accounts/${a.id}/status`);
            return sr.ok ? (await sr.json() as AccountStatus) : { ...a, google_connected: false, has_twin: false, twin_skills: [], twin_name: a.name };
          } catch {
            return { ...a, google_connected: false, has_twin: false, twin_skills: [], twin_name: a.name };
          }
        })
      );
      setAccounts(statuses);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  async function createAccount() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), email: newEmail.trim() || undefined }),
      });
      if (res.ok) {
        setNewName('');
        setNewEmail('');
        setShowNewForm(false);
        await loadAccounts();
      }
    } catch { /* ignore */ }
    setCreating(false);
  }

  async function deleteAccount(id: string) {
    if (!confirm('Delete this account and its digital twin?')) return;
    await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    await loadAccounts();
  }

  async function buildTwin(id: string) {
    setBuildingTwin(id);
    setBuildResult(prev => ({ ...prev, [id]: '' }));
    try {
      const res = await fetch(`/api/accounts/${id}/twin/rebuild`, { method: 'POST' });
      const data = await res.json() as { success?: boolean; reason?: string; items_used?: number; profile?: { skills?: string[]; interests?: string[] }; error?: string };
      if (data.success) {
        setBuildResult(prev => ({ ...prev, [id]: `Twin built from ${data.items_used} items` }));
        await loadAccounts();
      } else {
        setBuildResult(prev => ({ ...prev, [id]: data.reason || data.error || 'Failed' }));
      }
    } catch (err) {
      setBuildResult(prev => ({ ...prev, [id]: (err as Error).message }));
    }
    setBuildingTwin(null);
  }

  function connectGoogle(id: string) {
    window.open(`/api/accounts/${id}/connect/google`, '_blank', 'width=600,height=700');
    // Poll for connection after a delay
    setTimeout(() => loadAccounts(), 8000);
    setTimeout(() => loadAccounts(), 15000);
  }

  async function disconnectGoogle(id: string) {
    await fetch(`/api/accounts/${id}/disconnect/google`, { method: 'POST' });
    await loadAccounts();
  }

  const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white m-0">Accounts</h2>
          <p className="text-sm text-gray-500 mt-0.5">Each account connects its own Google identity and builds its own digital twin.</p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
        >
          <Plus size={16} /> Add Account
        </button>
      </div>

      {/* New account form */}
      {showNewForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-purple-200 dark:border-purple-500/30 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white m-0">New Account</h3>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Account name  (e.g. Personal, Work)"
            autoFocus
            className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
          />
          <input
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="Email (optional, for reference)"
            className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={createAccount}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => { setShowNewForm(false); setNewName(''); setNewEmail(''); }}
              className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Account list */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading accounts...</div>
      ) : accounts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center">
          <User size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 text-sm">No accounts yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((account, idx) => (
            <div key={account.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                >
                  {account.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white m-0">{account.name}</h3>
                    {account.email && (
                      <span className="text-xs text-gray-400">{account.email}</span>
                    )}
                  </div>

                  {/* Status row */}
                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs">
                      {account.google_connected ? (
                        <><CheckCircle size={12} className="text-green-500" /><span className="text-green-600 dark:text-green-400">Google Connected</span></>
                      ) : (
                        <><AlertCircle size={12} className="text-gray-400" /><span className="text-gray-400">Google Not Connected</span></>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      {account.has_twin ? (
                        <><Brain size={12} className="text-purple-500" /><span className="text-purple-600 dark:text-purple-400">Twin Built</span></>
                      ) : (
                        <><Brain size={12} className="text-gray-400" /><span className="text-gray-400">No Twin Yet</span></>
                      )}
                    </div>
                  </div>

                  {/* Skills preview */}
                  {account.twin_skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {account.twin_skills.slice(0, 5).map(s => (
                        <span key={s} className="px-2 py-0.5 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 rounded text-xs">
                          {s}
                        </span>
                      ))}
                      {account.twin_skills.length > 5 && (
                        <span className="text-xs text-gray-400">+{account.twin_skills.length - 5} more</span>
                      )}
                    </div>
                  )}

                  {/* Build result */}
                  {buildResult[account.id] && (
                    <p className="text-xs mt-2 text-gray-500 dark:text-gray-400">{buildResult[account.id]}</p>
                  )}
                </div>

                {/* Delete */}
                <button
                  onClick={() => deleteAccount(account.id)}
                  className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1 flex-shrink-0"
                  title="Delete account"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Actions row */}
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                {!account.google_connected ? (
                  <button
                    onClick={() => connectGoogle(account.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                  >
                    <Mail size={14} className="text-red-500" />
                    Connect Google
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => disconnectGoogle(account.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                    >
                      Disconnect Google
                    </button>
                    <button
                      onClick={() => buildTwin(account.id)}
                      disabled={buildingTwin === account.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                      {buildingTwin === account.id ? (
                        <><RefreshCw size={14} className="animate-spin" /> Building Twin...</>
                      ) : (
                        <><Brain size={14} /> {account.has_twin ? 'Rebuild Twin' : 'Build Twin'}</>
                      )}
                    </button>
                  </>
                )}

                {account.has_twin && onSelectForChat && (
                  <button
                    onClick={() => onSelectForChat(account)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-400 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-500/10 ml-auto"
                  >
                    Select for Chat <ChevronRight size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
