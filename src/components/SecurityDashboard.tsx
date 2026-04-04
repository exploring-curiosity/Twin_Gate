import { useState, useEffect, useCallback } from 'react';
import { Shield, AlertTriangle, Ban, CheckCircle, Search, Settings } from 'lucide-react';
import type { DetectionResult } from '../types/schema';

interface Threat {
  id: number;
  source: string;
  content: string;
  detection_json: string;
  action_taken: 'flag' | 'block';
  created_at: number;
}

interface Stats {
  total: number;
  blocked: number;
  flagged: number;
  by_category: Record<string, number>;
}

interface Thresholds {
  block: number;
  flag: number;
}

export function SecurityDashboard() {
  const [threats, setThreats] = useState<Threat[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, blocked: 0, flagged: 0, by_category: {} });
  const [thresholds, setThresholds] = useState<Thresholds>({ block: 5, flag: 3 });
  const [editThresholds, setEditThresholds] = useState<Thresholds | null>(null);
  const [scanInput, setScanInput] = useState('');
  const [scanResult, setScanResult] = useState<DetectionResult | null>(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    const [threatsRes, statsRes, configRes] = await Promise.all([
      fetch('/api/security/threats?limit=20'),
      fetch('/api/security/stats'),
      fetch('/api/security/config'),
    ]);
    if (threatsRes.ok) setThreats(await threatsRes.json());
    if (statsRes.ok) setStats(await statsRes.json());
    if (configRes.ok) setThresholds(await configRes.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function scan() {
    if (!scanInput.trim()) return;
    setScanning(true);
    const res = await fetch('/api/security/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: scanInput }),
    });
    setScanResult(await res.json());
    setScanning(false);
  }

  async function saveThresholds() {
    if (!editThresholds) return;
    const res = await fetch('/api/security/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editThresholds),
    });
    if (res.ok) {
      setThresholds(await res.json());
      setEditThresholds(null);
    }
  }

  const badgeColor = (rec: string) =>
    rec === 'block' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
    : rec === 'flag' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
    : 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400';

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Threats', value: stats.total, icon: Shield, color: 'text-purple-500' },
          { label: 'Blocked', value: stats.blocked, icon: Ban, color: 'text-red-500' },
          { label: 'Flagged', value: stats.flagged, icon: AlertTriangle, color: 'text-yellow-500' },
          { label: 'Categories', value: Object.keys(stats.by_category).length, icon: CheckCircle, color: 'text-blue-500' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon size={16} className={s.color} />
              <span className="text-xs text-gray-500">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white m-0">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Category breakdown */}
      {Object.keys(stats.by_category).length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white m-0 mb-3">By Category</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.by_category).map(([cat, count]) => (
              <span key={cat} className="px-2.5 py-1 text-xs font-medium rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400">
                {cat}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Live scanner */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Search size={18} className="text-purple-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0">Live Scanner</h3>
        </div>
        <div className="flex gap-2 mb-4">
          <input
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && scan()}
            placeholder='Paste a message to check for distillation attacks...'
            className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
          />
          <button
            onClick={scan}
            disabled={scanning}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
          >
            {scanning ? 'Scanning...' : 'Scan'}
          </button>
        </div>

        {scanResult && (
          <div className={`p-4 rounded-lg border ${
            scanResult.recommendation === 'block' ? 'border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10'
            : scanResult.recommendation === 'flag' ? 'border-yellow-200 dark:border-yellow-500/30 bg-yellow-50 dark:bg-yellow-500/10'
            : 'border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 text-xs font-bold rounded uppercase ${badgeColor(scanResult.recommendation)}`}>
                {scanResult.recommendation}
              </span>
              <span className="text-xs text-gray-500">
                Confidence: {(scanResult.confidence * 100).toFixed(0)}%
              </span>
              {scanResult.category && (
                <span className="text-xs text-gray-500">Category: {scanResult.category}</span>
              )}
            </div>
            {scanResult.signals.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {scanResult.signals.map((s) => (
                  <span key={s} className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">{s}</span>
                ))}
              </div>
            )}
            {scanResult.pii_detected.length > 0 && (
              <p className="text-xs text-red-600 dark:text-red-400 m-0">PII detected: {scanResult.pii_detected.join(', ')}</p>
            )}
          </div>
        )}
      </div>

      {/* Threshold config */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-gray-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0">Detection Thresholds</h3>
          </div>
          {editThresholds ? (
            <div className="flex gap-2">
              <button onClick={() => setEditThresholds(null)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                Cancel
              </button>
              <button onClick={saveThresholds} className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                Save
              </button>
            </div>
          ) : (
            <button onClick={() => setEditThresholds({ ...thresholds })} className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700">
              Edit
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Block threshold (score)</label>
            {editThresholds ? (
              <input
                type="number" min={1} step={1}
                value={editThresholds.block}
                onChange={(e) => setEditThresholds({ ...editThresholds, block: Number(e.target.value) })}
                className="w-full px-3 py-1.5 rounded border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
              />
            ) : (
              <p className="text-sm font-semibold text-red-600 dark:text-red-400 m-0">{thresholds.block}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Flag threshold (score)</label>
            {editThresholds ? (
              <input
                type="number" min={1} step={1}
                value={editThresholds.flag}
                onChange={(e) => setEditThresholds({ ...editThresholds, flag: Number(e.target.value) })}
                className="w-full px-3 py-1.5 rounded border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
              />
            ) : (
              <p className="text-sm font-semibold text-yellow-600 dark:text-yellow-400 m-0">{thresholds.flag}</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent threats */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0 mb-4">Recent Threats</h3>
        {threats.length === 0 ? (
          <p className="text-sm text-gray-400">No threats detected yet. That's good!</p>
        ) : (
          <div className="space-y-3">
            {threats.map((t) => {
              let detection: DetectionResult | null = null;
              try { detection = JSON.parse(t.detection_json); } catch { /* skip */ }
              return (
                <div key={t.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded uppercase ${badgeColor(t.action_taken)}`}>
                      {t.action_taken}
                    </span>
                    <span className="text-xs text-gray-500">{t.source}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {new Date(t.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 m-0 mb-1 truncate">
                    {t.content}
                  </p>
                  {detection && detection.signals.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {detection.signals.map((s) => (
                        <span key={s} className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
