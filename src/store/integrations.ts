import { create } from 'zustand';
import type { PermissionConfig, IntegrationSource } from '../types/schema';

interface IntegrationState {
  configs: Record<string, PermissionConfig>;
  loaded: boolean;
  loadConfigs: () => Promise<void>;
  updateConfig: (source: IntegrationSource, config: Partial<PermissionConfig>) => Promise<void>;
  toggleCapability: (source: IntegrationSource, capability: keyof PermissionConfig['capabilities']) => Promise<void>;
}

const DEFAULT_CONFIG = (source: IntegrationSource): PermissionConfig => ({
  source,
  conversations: { allow: [], deny: [] },
  people: { allow: [], deny: [] },
  content: { blocked_topics: [], blocked_patterns: [] },
  capabilities: { read: false, suggest: false, auto_reply: false },
});

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  configs: {},
  loaded: false,

  loadConfigs: async () => {
    try {
      const res = await fetch('/api/permissions');
      const data = await res.json();
      set({ configs: data, loaded: true });
    } catch (err) {
      console.error('Failed to load configs:', err);
      // Fallback to defaults if server is down
      const sources: IntegrationSource[] = ['discord', 'gmail', 'google_calendar', 'slack'];
      const configs: Record<string, PermissionConfig> = {};
      for (const s of sources) configs[s] = DEFAULT_CONFIG(s);
      set({ configs, loaded: true });
    }
  },

  updateConfig: async (source, newConfig) => {
    const current = get().configs[source] || DEFAULT_CONFIG(source);
    const updated = { ...current, ...newConfig, source };
    set((state) => ({
      configs: { ...state.configs, [source]: updated },
    }));
    try {
      await fetch(`/api/permissions/${source}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  },

  toggleCapability: async (source, capability) => {
    const current = get().configs[source] || DEFAULT_CONFIG(source);
    const updated: PermissionConfig = {
      ...current,
      capabilities: {
        ...current.capabilities,
        [capability]: !current.capabilities[capability],
      },
    };
    set((state) => ({
      configs: { ...state.configs, [source]: updated },
    }));
    try {
      await fetch(`/api/permissions/${source}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capability }),
      });
    } catch (err) {
      console.error('Failed to toggle capability:', err);
    }
  },
}));
