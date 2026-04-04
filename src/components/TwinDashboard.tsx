import { useState, useEffect } from 'react';
import { Brain, Send, Check, X, User, RefreshCw, Sparkles } from 'lucide-react';

interface Suggestion {
  id: number; source: string; conversation_id: string;
  original_message: string; suggested_reply: string; confidence: number;
  status: string; created_at: string;
}

interface Profile {
  user_id: string; display_name: string; skills: string[];
  interests: string[]; employer?: string; location?: string;
  communication_style?: string;
}

export function TwinDashboard() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [profile, setProfile] = useState<Profile>({ user_id: 'self', display_name: '', skills: [], interests: [] });
  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<{ success: boolean; reason?: string; events_used?: number; sources?: string[] } | null>(null);
  const [distilling, setDistilling] = useState(false);
  const [distillResult, setDistillResult] = useState<{
    success: boolean; clean_items: number; cloud_synced: boolean;
    stats: { collected: number; skipped_critical_pii: number; redacted: number; skipped_attack: number; sent_to_cloud: number; sources: string[] };
  } | null>(null);
  const [skillInput, setSkillInput] = useState('');
  const [interestInput, setInterestInput] = useState('');

  useEffect(() => { loadSuggestions(); loadProfile(); }, []);

  async function loadSuggestions() {
    const res = await fetch('/api/twin/suggestions');
    setSuggestions(await res.json());
  }

  async function loadProfile() {
    const res = await fetch('/api/twin/profile');
    setProfile(await res.json());
  }

  async function testTwin() {
    if (!testMessage.trim()) return;
    setTesting(true);
    const res = await fetch('/api/twin/evaluate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: testMessage, source: 'test', sender_name: 'Test User' }),
    });
    setTestResult(await res.json());
    setTesting(false);
  }

  async function handleSuggestion(id: number, action: 'approve' | 'reject') {
    await fetch(`/api/twin/suggestions/${id}/${action}`, { method: 'POST' });
    loadSuggestions();
  }

  async function saveProfile() {
    await fetch('/api/twin/profile', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    setEditMode(false);
  }

  async function distillToCloud() {
    setDistilling(true);
    setDistillResult(null);
    const res = await fetch('/api/twin/distill', { method: 'POST' });
    const data = await res.json();
    setDistillResult(data);
    if (data.success) loadProfile();
    setDistilling(false);
  }

  async function rebuildFromData() {
    setRebuilding(true);
    setRebuildResult(null);
    const res = await fetch('/api/twin/rebuild', { method: 'POST' });
    const data = await res.json();
    setRebuildResult(data);
    if (data.success) loadProfile();
    setRebuilding(false);
  }

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-500/20 rounded-lg">
              <User size={24} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0">Agent Profile</h3>
              <p className="text-sm text-gray-500 m-0">This defines how your Digital Twin behaves</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={distillToCloud}
              disabled={distilling}
              title="Collect all accessible data, scrub PII, and build your Digital Twin in the cloud"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              <Sparkles size={13} className={distilling ? 'animate-pulse' : ''} />
              {distilling ? 'Distilling...' : 'Distill & Sync'}
            </button>
            <button
              onClick={rebuildFromData}
              disabled={rebuilding}
              title="Rebuild local profile from DB events only"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              <RefreshCw size={13} className={rebuilding ? 'animate-spin' : ''} />
              {rebuilding ? 'Building...' : 'Local Rebuild'}
            </button>
            <button onClick={() => editMode ? saveProfile() : setEditMode(true)}
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              {editMode ? 'Save' : 'Edit'}
            </button>
          </div>
        </div>

        {distillResult && (
          <div className="mb-4 p-4 rounded-lg border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 text-sm">
            <div className="flex items-center gap-2 mb-2 font-semibold text-purple-800 dark:text-purple-300">
              <Sparkles size={14} />
              Distillation complete · {distillResult.cloud_synced ? 'Synced to Cloud ✓' : 'Cloud sync failed'}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-purple-700 dark:text-purple-400">
              <div><span className="font-medium">{distillResult.stats.collected}</span> collected</div>
              <div><span className="font-medium text-green-600 dark:text-green-400">{distillResult.clean_items}</span> clean items sent</div>
              <div><span className="font-medium text-yellow-600 dark:text-yellow-400">{distillResult.stats.redacted}</span> PII redacted</div>
              <div><span className="font-medium text-red-600 dark:text-red-400">{distillResult.stats.skipped_critical_pii}</span> critical PII blocked</div>
            </div>
            {distillResult.stats.sources.length > 0 && (
              <p className="text-xs text-purple-600 dark:text-purple-500 mt-2">Sources: {distillResult.stats.sources.join(', ')}</p>
            )}
          </div>
        )}

        {rebuildResult && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${rebuildResult.success ? 'bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 text-green-800 dark:text-green-300' : 'bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 text-yellow-800 dark:text-yellow-300'}`}>
            {rebuildResult.success
              ? `Twin rebuilt from ${rebuildResult.events_used} messages across ${rebuildResult.sources?.join(', ')}. Profile updated.`
              : rebuildResult.reason}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Display Name</label>
            {editMode ? (
              <input value={profile.display_name} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                className="w-full px-3 py-1.5 rounded border dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm" />
            ) : (
              <p className="text-sm text-gray-900 dark:text-white m-0">{profile.display_name || '—'}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Employer</label>
            {editMode ? (
              <input value={profile.employer || ''} onChange={(e) => setProfile({ ...profile, employer: e.target.value })}
                className="w-full px-3 py-1.5 rounded border dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm" />
            ) : (
              <p className="text-sm text-gray-900 dark:text-white m-0">{profile.employer || '—'}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
            {editMode ? (
              <input value={profile.location || ''} onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                className="w-full px-3 py-1.5 rounded border dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm" />
            ) : (
              <p className="text-sm text-gray-900 dark:text-white m-0">{profile.location || '—'}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Communication Style</label>
            {editMode ? (
              <input value={profile.communication_style || ''} onChange={(e) => setProfile({ ...profile, communication_style: e.target.value })}
                placeholder="e.g. Friendly, concise, uses humor"
                className="w-full px-3 py-1.5 rounded border dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm" />
            ) : (
              <p className="text-sm text-gray-900 dark:text-white m-0">{profile.communication_style || '—'}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Skills</label>
            <div className="flex flex-wrap gap-1">
              {profile.skills.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 rounded text-xs">
                  {s}
                  {editMode && <button onClick={() => setProfile({ ...profile, skills: profile.skills.filter((_, j) => j !== i) })} className="hover:text-red-500">&times;</button>}
                </span>
              ))}
              {editMode && (
                <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && skillInput.trim()) { setProfile({ ...profile, skills: [...profile.skills, skillInput.trim()] }); setSkillInput(''); } }}
                  placeholder="+ Add skill" className="px-2 py-0.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white w-24" />
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Interests</label>
            <div className="flex flex-wrap gap-1">
              {profile.interests.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 rounded text-xs">
                  {s}
                  {editMode && <button onClick={() => setProfile({ ...profile, interests: profile.interests.filter((_, j) => j !== i) })} className="hover:text-red-500">&times;</button>}
                </span>
              ))}
              {editMode && (
                <input value={interestInput} onChange={(e) => setInterestInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && interestInput.trim()) { setProfile({ ...profile, interests: [...profile.interests, interestInput.trim()] }); setInterestInput(''); } }}
                  placeholder="+ Add interest" className="px-2 py-0.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white w-24" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Test the Twin */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Brain size={20} className="text-purple-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0">Test Your Twin</h3>
        </div>
        <div className="flex gap-2 mb-4">
          <input value={testMessage} onChange={(e) => setTestMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && testTwin()}
            placeholder='Try: "Anyone free for badminton this weekend?"'
            className="flex-1 px-4 py-2 rounded-lg border dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm" />
          <button onClick={testTwin} disabled={testing}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
            <Send size={14} /> {testing ? 'Thinking...' : 'Evaluate'}
          </button>
        </div>
        {testResult && (
          <div className={`p-4 rounded-lg border ${
            testResult.action === 'ignore' ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'
            : testResult.action === 'suggest' ? 'border-yellow-200 dark:border-yellow-500/30 bg-yellow-50 dark:bg-yellow-500/10'
            : 'border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                testResult.action === 'ignore' ? 'bg-gray-200 text-gray-700' : testResult.action === 'suggest' ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'
              }`}>{testResult.action.toUpperCase()}</span>
              <span className="text-xs text-gray-500">Confidence: {(testResult.confidence * 100).toFixed(0)}%</span>
            </div>
            {testResult.suggestedReply && (
              <p className="text-sm text-gray-800 dark:text-gray-200 m-0 mb-1">"{testResult.suggestedReply}"</p>
            )}
            {testResult.reasoning && (
              <p className="text-xs text-gray-500 m-0">{testResult.reasoning}</p>
            )}
          </div>
        )}
      </div>

      {/* Pending Suggestions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0 mb-4">Pending Suggestions</h3>
        {suggestions.length === 0 ? (
          <p className="text-sm text-gray-400">No pending suggestions. Connect integrations to start receiving them.</p>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => (
              <div key={s.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{s.source}</span>
                  <span className="text-xs text-gray-500">Confidence: {(s.confidence * 100).toFixed(0)}%</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 m-0 mb-1">"{s.original_message}"</p>
                <p className="text-sm text-gray-900 dark:text-white m-0 mb-2">Suggested: "{s.suggested_reply}"</p>
                <div className="flex gap-2">
                  <button onClick={() => handleSuggestion(s.id, 'approve')} className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">
                    <Check size={12} /> Approve
                  </button>
                  <button onClick={() => handleSuggestion(s.id, 'reject')} className="flex items-center gap-1 px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">
                    <X size={12} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
