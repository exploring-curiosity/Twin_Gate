import { useState, useEffect } from 'react';
import { Shield, MessageSquare, Eye, Bot, Zap, ExternalLink } from 'lucide-react';
import { useIntegrationStore } from '../store/integrations';
import type { IntegrationSource } from '../types/schema';
import { ListEditor } from './ListEditor';

interface IntegrationPanelProps {
  source: IntegrationSource;
}

const CONNECT_HELP: Record<string, { label: string; href?: string; instructions: string }> = {
  discord: {
    label: 'Fix in Discord Portal',
    href: 'https://discord.com/developers/applications',
    instructions: 'Bot login failed — enable Message Content Intent under Bot → Privileged Gateway Intents in the Discord Developer Portal, then restart the server.',
  },
  gmail: {
    label: 'Connect Google',
    href: '/api/auth/google',
    instructions: 'Click to complete Google OAuth and grant Gmail + Calendar access.',
  },
  google_calendar: {
    label: 'Connect Google',
    href: '/api/auth/google',
    instructions: 'Click to complete Google OAuth and grant Gmail + Calendar access.',
  },
};

export function IntegrationPanel({ source }: IntegrationPanelProps) {
  const { configs, updateConfig, toggleCapability } = useIntegrationStore();
  const config = configs[source];
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkStatus() {
      try {
        if (source === 'discord') {
          const res = await fetch('/api/discord/status');
          const data = await res.json() as { connected: boolean };
          setIsConnected(data.connected);
        } else if (source === 'gmail' || source === 'google_calendar') {
          const res = await fetch('/api/auth/status');
          const data = await res.json() as { google?: { connected: boolean } };
          setIsConnected(data.google?.connected ?? false);
        } else {
          setIsConnected(false);
        }
      } catch {
        setIsConnected(false);
      }
    }
    checkStatus();
  }, [source]);

  if (!config) return null;

  const help = CONNECT_HELP[source];
  const iconColor = source === 'discord' ? 'bg-[#5865F2]/10 text-[#5865F2]' : 'bg-red-500/10 text-red-500';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-full text-left">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${iconColor}`}>
            <MessageSquare size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white capitalize m-0">
              {source === 'google_calendar' ? 'Google Calendar' : source}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 m-0">Fine-grained privacy controls</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isConnected === null ? (
            <span className="text-xs text-gray-400">Checking...</span>
          ) : isConnected ? (
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>
              <span className="text-sm font-medium text-green-600 dark:text-green-400">Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-gray-400 dark:bg-gray-600 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Not connected</span>
              {help && (
                <a
                  href={help.href}
                  target={help.href?.startsWith('http') ? '_blank' : '_self'}
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:underline ml-1"
                >
                  {help.label} <ExternalLink size={11} />
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Connection instructions banner */}
      {isConnected === false && help && (
        <div className="px-6 py-3 bg-yellow-50 dark:bg-yellow-500/10 border-b border-yellow-200 dark:border-yellow-500/30 text-xs text-yellow-800 dark:text-yellow-300">
          {help.instructions}
        </div>
      )}


      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Capabilities Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="text-purple-500" size={20} />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0">Capabilities</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="relative flex items-start p-4 cursor-pointer rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <div className="flex items-center h-5">
                <input
                  type="checkbox"
                  checked={config.capabilities.read}
                  onChange={() => toggleCapability(source, 'read')}
                  className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div className="ml-3 text-sm">
                <span className="font-medium text-gray-900 dark:text-white flex items-center gap-1"><Eye size={14}/> Read Access</span>
                <p className="text-gray-500 dark:text-gray-400 mt-1">Allow OpenClaw to read messages in allowed channels.</p>
              </div>
            </label>

            <label className="relative flex items-start p-4 cursor-pointer rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <div className="flex items-center h-5">
                <input
                  type="checkbox"
                  checked={config.capabilities.suggest}
                  onChange={() => toggleCapability(source, 'suggest')}
                  className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div className="ml-3 text-sm">
                <span className="font-medium text-gray-900 dark:text-white flex items-center gap-1"><Bot size={14}/> Suggest Replies</span>
                <p className="text-gray-500 dark:text-gray-400 mt-1">Generate suggested responses for you to review.</p>
              </div>
            </label>

            <label className="relative flex items-start p-4 cursor-not-allowed opacity-60 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center h-5">
                <input
                  type="checkbox"
                  disabled
                  checked={config.capabilities.auto_reply}
                  className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div className="ml-3 text-sm">
                <span className="font-medium text-gray-900 dark:text-white flex items-center gap-1">
                  <Zap size={14}/> Auto-Reply 
                  <span className="bg-orange-100 text-orange-800 text-[10px] px-1.5 py-0.5 rounded ml-1 font-bold">LOCKED</span>
                </span>
                <p className="text-gray-500 dark:text-gray-400 mt-1">Currently disabled for safety. Requires Phase 8.</p>
              </div>
            </label>
          </div>
        </section>

        <hr className="border-gray-200 dark:border-gray-700" />

        {/* Privacy Rules Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="text-purple-500" size={20} />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0">Privacy Rules Engine</h3>
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 font-normal">Executed locally before data hits the cloud.</span>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <ListEditor
                title="Deny Conversations"
                description="Never read or process messages from these Channel IDs or Group Chats."
                placeholder="e.g. 123456789012345678"
                items={config.conversations.deny}
                onAdd={(item) => updateConfig(source, { conversations: { ...config.conversations, deny: [...config.conversations.deny, item] } })}
                onRemove={(item) => updateConfig(source, { conversations: { ...config.conversations, deny: config.conversations.deny.filter(i => i !== item) } })}
              />
              
              <ListEditor
                title="Deny People"
                description="Never process messages from these specific User IDs."
                placeholder="e.g. user_987654321"
                items={config.people.deny}
                onAdd={(item) => updateConfig(source, { people: { ...config.people, deny: [...config.people.deny, item] } })}
                onRemove={(item) => updateConfig(source, { people: { ...config.people, deny: config.people.deny.filter(i => i !== item) } })}
              />
            </div>
            
            <div className="space-y-6">
               <ListEditor
                title="Allow Conversations"
                description="Only process messages from these specific Channel IDs. Leave empty to allow all (except denied)."
                placeholder="e.g. 876543210987654321"
                items={config.conversations.allow}
                onAdd={(item) => updateConfig(source, { conversations: { ...config.conversations, allow: [...config.conversations.allow, item] } })}
                onRemove={(item) => updateConfig(source, { conversations: { ...config.conversations, allow: config.conversations.allow.filter(i => i !== item) } })}
              />

              <ListEditor
                title="Blocked Topics"
                description="Drop any message containing these keywords or phrases."
                placeholder="e.g. password, bank, ssn"
                items={config.content.blocked_topics}
                onAdd={(item) => updateConfig(source, { content: { blocked_topics: [...config.content.blocked_topics, item], blocked_patterns: config.content.blocked_patterns } })}
                onRemove={(item) => updateConfig(source, { content: { blocked_topics: config.content.blocked_topics.filter(i => i !== item), blocked_patterns: config.content.blocked_patterns } })}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
