import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Brain, Edit3, Check, X, Mail, RefreshCw } from 'lucide-react';

export interface Account {
  id: string;
  name: string;
  email?: string;
  bio?: string;
  avatar_color?: string;
  created_at: string;
}

export interface AccountStatus extends Account {
  google_connected: boolean;
  has_twin: boolean;
  twin_skills: string[];
  twin_name: string;
}

export const AVATAR_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
];

export function getAvatarColor(id: string, accounts: Account[]) {
  const idx = accounts.findIndex(a => a.id === id);
  return AVATAR_COLORS[Math.max(0, idx) % AVATAR_COLORS.length];
}

interface AccountManagerProps {
  currentAccountId: string | null;
  onSwitch: (id: string) => void;
}

interface ProfileFormState {
  display_name: string;
  bio: string;
  skills: string;
  interests: string;
  communication_style: string;
}

export function AccountManager({ currentAccountId, onSwitch }: AccountManagerProps) {
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({ display_name: '', bio: '', skills: '', interests: '', communication_style: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [buildingTwin, setBuildingTwin] = useState<string | null>(null);
  const [buildMsg, setBuildMsg] = useState<Record<string, string>>({});

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts');
      if (!res.ok) return;
      const list = await res.json() as Account[];
      const statuses = await Promise.all(list.map(async (a) => {
        try {
          const sr = await fetch(`/api/accounts/${a.id}/status`);
          return sr.ok ? (await sr.json() as AccountStatus) : { ...a, google_connected: false, has_twin: false, twin_skills: [], twin_name: a.name };
        } catch {
          return { ...a, google_connected: false, has_twin: false, twin_skills: [], twin_name: a.name };
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
      setNewName('');
      setShowNewForm(false);
      await loadAccounts();
      // Auto-switch to first account if none selected
      if (!currentAccountId) onSwitch(created.id);
    }
    setCreating(false);
  }

  async function deleteAccount(id: string) {
    if (!confirm('Delete this person and all their data?')) return;
    await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    if (currentAccountId === id) {
      const remaining = accounts.filter(a => a.id !== id);
      onSwitch(remaining[0]?.id || '');
    }
    await loadAccounts();
  }

  function openProfileEdit(account: AccountStatus) {
    setProfileForm({
      display_name: account.twin_name || account.name,
      bio: account.bio || '',
      skills: account.twin_skills.join(', '),
      interests: '',
      communication_style: '',
    });
    setEditingProfile(account.id);
  }

  async function saveProfile(accountId: string) {
    setSavingProfile(true);
    const skills = profileForm.skills.split(',').map(s => s.trim()).filter(Boolean);
    const interests = profileForm.interests.split(',').map(s => s.trim()).filter(Boolean);
    await fetch(`/api/accounts/${accountId}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: profileForm.display_name || undefined,
        bio: profileForm.bio || undefined,
        skills,
        interests,
        communication_style: profileForm.communication_style || undefined,
      }),
    });
    setEditingProfile(null);
    await loadAccounts();
    setSavingProfile(false);
  }

  async function buildTwinFromGoogle(id: string) {
    setBuildingTwin(id);
    const res = await fetch(`/api/accounts/${id}/twin/rebuild`, { method: 'POST' });
    const data = await res.json() as { success?: boolean; reason?: string; items_used?: number; error?: string };
    setBuildMsg(prev => ({ ...prev, [id]: data.success ? `Built from ${data.items_used} items` : (data.reason || data.error || 'Failed') }));
    setBuildingTwin(null);
    await loadAccounts();
  }

  function connectGoogle(id: string) {
    window.open(`/api/accounts/${id}/connect/google`, '_blank', 'width=600,height=700');
    setTimeout(() => loadAccounts(), 8000);
    setTimeout(() => loadAccounts(), 15000);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white m-0">People</h2>
          <p className="text-sm text-gray-500 mt-0.5">Each person has a digital twin. Set their profile manually or import from Google.</p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
        >
          <Plus size={15} /> Add Person
        </button>
      </div>

      {showNewForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-purple-200 dark:border-purple-500/30 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">New person</p>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createAccount()}
            placeholder="Name  (e.g. Alex, Priya, Work Me)"
            autoFocus
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
          />
          <div className="flex gap-2">
            <button onClick={createAccount} disabled={creating || !newName.trim()}
              className="px-4 py-1.5 bg-purple-600 text-white rounded-lg text-sm disabled:opacity-50">
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button onClick={() => { setShowNewForm(false); setNewName(''); }}
              className="px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-6 text-center">Loading...</p>
      ) : accounts.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">No people yet. Add yourself and your friends.</div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account, idx) => {
            const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
            const isMe = account.id === currentAccountId;

            return (
              <div key={account.id}
                className={`bg-white dark:bg-gray-800 rounded-xl border p-4 transition-all ${isMe ? 'border-purple-300 dark:border-purple-500/50 ring-1 ring-purple-200 dark:ring-purple-500/20' : 'border-gray-200 dark:border-gray-700'}`}>

                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 relative"
                    style={{ backgroundColor: color }}>
                    {account.name.charAt(0).toUpperCase()}
                    {isMe && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-purple-600 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center text-white" style={{ fontSize: 7 }}>✓</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white text-sm">{account.name}</span>
                      {isMe && <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 rounded font-medium">You</span>}
                      {account.has_twin && <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 rounded">Twin ✓</span>}
                    </div>
                    {account.bio && <p className="text-xs text-gray-500 mt-0.5">{account.bio}</p>}
                    {account.twin_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {account.twin_skills.slice(0, 4).map(s => (
                          <span key={s} className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">{s}</span>
                        ))}
                        {account.twin_skills.length > 4 && <span className="text-xs text-gray-400">+{account.twin_skills.length - 4}</span>}
                      </div>
                    )}
                    {buildMsg[account.id] && <p className="text-xs text-gray-400 mt-1">{buildMsg[account.id]}</p>}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!isMe && (
                      <button onClick={() => onSwitch(account.id)}
                        className="text-xs px-2.5 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
                        Switch
                      </button>
                    )}
                    <button onClick={() => openProfileEdit(account)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded">
                      <Edit3 size={14} />
                    </button>
                    <button onClick={() => deleteAccount(account.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Profile edit form */}
                {editingProfile === account.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Display name</label>
                        <input value={profileForm.display_name} onChange={e => setProfileForm(p => ({ ...p, display_name: e.target.value }))}
                          className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Communication style</label>
                        <input value={profileForm.communication_style} onChange={e => setProfileForm(p => ({ ...p, communication_style: e.target.value }))}
                          placeholder="e.g. casual, direct, funny"
                          className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Bio (helps the twin respond authentically)</label>
                      <textarea value={profileForm.bio} onChange={e => setProfileForm(p => ({ ...p, bio: e.target.value }))}
                        placeholder="E.g. Software engineer, loves hackathons and badminton, based in SF..."
                        rows={2}
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs resize-none" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Skills <span className="text-gray-400">(comma separated)</span></label>
                      <input value={profileForm.skills} onChange={e => setProfileForm(p => ({ ...p, skills: e.target.value }))}
                        placeholder="React, Python, Machine Learning..."
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Interests <span className="text-gray-400">(comma separated)</span></label>
                      <input value={profileForm.interests} onChange={e => setProfileForm(p => ({ ...p, interests: e.target.value }))}
                        placeholder="Hackathons, badminton, open source, travel..."
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs" />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={() => saveProfile(account.id)} disabled={savingProfile}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs disabled:opacity-50">
                        <Check size={12} /> {savingProfile ? 'Saving...' : 'Save Profile'}
                      </button>
                      <button onClick={() => setEditingProfile(null)}
                        className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-600 dark:text-gray-400">
                        <X size={12} /> Cancel
                      </button>
                      <div className="ml-auto flex gap-2">
                        {!account.google_connected ? (
                          <button onClick={() => connectGoogle(account.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <Mail size={11} className="text-red-500" /> Connect Google
                          </button>
                        ) : (
                          <button onClick={() => buildTwinFromGoogle(account.id)} disabled={buildingTwin === account.id}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs disabled:opacity-50">
                            {buildingTwin === account.id ? <><RefreshCw size={11} className="animate-spin" /> Building...</> : <><Brain size={11} /> Import from Google</>}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
