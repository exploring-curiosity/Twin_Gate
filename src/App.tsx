import { useState, useEffect } from 'react';
import { AppWindow, Shield, MessageSquare, Brain, Users, Cloud, UserCircle2 } from 'lucide-react';
import { IntegrationPanel } from './components/IntegrationPanel';
import { GroupChat } from './components/GroupChat';
import { TwinDashboard } from './components/TwinDashboard';
import { SecurityDashboard } from './components/SecurityDashboard';
import { CloudStatus } from './components/CloudStatus';
import { AccountManager } from './components/AccountManager';
import { TwinTwinChat } from './components/TwinTwinChat';
import { useIntegrationStore } from './store/integrations';
import type { IntegrationSource } from './types/schema';

type Section = 'integrations' | 'twin' | 'twin-chat' | 'social' | 'security' | 'cloud' | 'accounts';

interface IntegrationConnected {
  discord: boolean;
  gmail: boolean;
  google_calendar: boolean;
  slack: boolean;
}

function App() {
  const [activeSection, setActiveSection] = useState<Section>('integrations');
  const [activeTab, setActiveTab] = useState<IntegrationSource>('discord');
  const [connected, setConnected] = useState<IntegrationConnected>({ discord: false, gmail: false, google_calendar: false, slack: false });
  const { loadConfigs, loaded } = useIntegrationStore();

  useEffect(() => {
    if (!loaded) loadConfigs();
  }, [loaded, loadConfigs]);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const [discordRes, authRes] = await Promise.all([
          fetch('/api/discord/status'),
          fetch('/api/auth/status'),
        ]);
        const discord = discordRes.ok ? await discordRes.json() as { connected: boolean } : { connected: false };
        const auth = authRes.ok ? await authRes.json() as { google?: { connected: boolean } } : {};
        const googleConnected = auth.google?.connected ?? false;
        setConnected({
          discord: discord.connected,
          gmail: googleConnected,
          google_calendar: googleConnected,
          slack: false,
        });
      } catch { /* server may be starting */ }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000);
    return () => clearInterval(interval);
  }, []);

  const integrationTabs: { id: IntegrationSource; label: string; color: string }[] = [
    { id: 'discord', label: 'Discord', color: 'bg-[#5865F2]' },
    { id: 'gmail', label: 'Gmail', color: 'bg-red-500' },
    { id: 'google_calendar', label: 'Calendar', color: 'bg-blue-500' },
  ];

  const sections: { id: Section; label: string; icon: typeof Shield; sub?: { id: Section; label: string }[] }[] = [
    { id: 'accounts', label: 'Accounts', icon: UserCircle2 },
    { id: 'integrations', label: 'Integrations', icon: MessageSquare },
    {
      id: 'twin', label: 'Digital Twin', icon: Brain,
      sub: [
        { id: 'twin', label: 'My Twin' },
        { id: 'twin-chat', label: 'Twin Chat' },
      ],
    },
    { id: 'social', label: 'Agent Chat', icon: Users },
    { id: 'security', label: 'Validia', icon: Shield },
    { id: 'cloud', label: 'Cloud', icon: Cloud },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col md:flex-row w-full max-w-full m-0 border-0 p-0 text-left items-stretch">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
            <AppWindow size={24} />
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white m-0">ZeroClaw</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1">Personal AI Identity Layer</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {sections.map((s) => {
            const isActive = activeSection === s.id || s.sub?.some(sub => sub.id === activeSection);
            return (
              <div key={s.id}>
                <button
                  onClick={() => setActiveSection(s.sub ? s.sub[0].id : s.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <s.icon size={18} />
                  {s.label}
                </button>

                {/* Sub-tabs for Digital Twin */}
                {s.sub && isActive && (
                  <div className="ml-6 mt-1 space-y-0.5">
                    {s.sub.map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => setActiveSection(sub.id)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          activeSection === sub.id
                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Integration sub-tabs */}
                {s.id === 'integrations' && activeSection === 'integrations' && (
                  <div className="ml-6 mt-1 space-y-0.5">
                    {integrationTabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => { setActiveSection('integrations'); setActiveTab(tab.id); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          activeTab === tab.id
                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${connected[tab.id as keyof IntegrationConnected] ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-600'}`} />
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Connection Status */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <ConnectionIndicator />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-8 flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white m-0">
            {activeSection === 'twin-chat' ? 'Twin Chat' : sections.find((s) => s.id === activeSection || s.sub?.some(sub => sub.id === activeSection))?.label}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {activeSection === 'accounts' && 'Manage multiple Google accounts and build a digital twin for each.'}
            {activeSection === 'integrations' && 'Configure what OpenClaw can see and do.'}
            {activeSection === 'twin' && 'Your Digital Twin learns from your conversations.'}
            {activeSection === 'twin-chat' && 'Watch two digital twins have a natural conversation with each other.'}
            {activeSection === 'social' && 'Agents interact on your behalf in group chats.'}
            {activeSection === 'security' && 'Validia protects against distillation attacks and PII leaks.'}
            {activeSection === 'cloud' && 'Connection to your Cloud OpenClaw instance.'}
          </p>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeSection === 'accounts' && <AccountManager onSelectForChat={() => setActiveSection('twin-chat')} />}
          {activeSection === 'integrations' && <IntegrationPanel source={activeTab} />}
          {activeSection === 'twin' && <TwinDashboard />}
          {activeSection === 'twin-chat' && <TwinTwinChat />}
          {activeSection === 'social' && <GroupChat />}
          {activeSection === 'security' && <SecurityDashboard />}
          {activeSection === 'cloud' && <CloudStatus />}
        </div>
      </main>
    </div>
  );
}

function ConnectionIndicator() {
  const [status, setStatus] = useState<{ cloud: boolean; discord: boolean; google: boolean }>({
    cloud: false, discord: false, google: false,
  });

  useEffect(() => {
    async function check() {
      try {
        const [healthRes, discordRes, authRes] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/discord/status'),
          fetch('/api/auth/status'),
        ]);
        const health = healthRes.ok ? await healthRes.json() : {};
        const discord = discordRes.ok ? await discordRes.json() as { connected: boolean } : { connected: false };
        const auth = authRes.ok ? await authRes.json() as { google?: { connected: boolean } } : {};
        setStatus({
          cloud: health.cloud?.ok || false,
          discord: discord.connected,
          google: auth.google?.connected || false,
        });
      } catch { /* server starting */ }
    }
    check();
    const interval = setInterval(check, 15_000);
    return () => clearInterval(interval);
  }, []);

  const items = [
    { label: 'Cloud OpenClaw', ok: status.cloud },
    { label: 'Discord Bot', ok: status.discord },
    { label: 'Google (Gmail + Calendar)', ok: status.google },
  ];

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-xs">
          <div className={`w-2 h-2 rounded-full ${item.ok ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-600'}`} />
          <span className="text-gray-500 dark:text-gray-400">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default App;
