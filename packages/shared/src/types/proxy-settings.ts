import { z } from 'zod';

export const ProxySettingsSchema = z.object({
  minecraft: z.object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in format X.Y.Z'),
    serverHost: z.string().min(1, 'Server host is required'),
    serverPort: z.number().int().min(1).max(65535, 'Port must be between 1 and 65535')
  }),
  relay: z.object({
    enabled: z.boolean().default(true),
    host: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Invalid IP address format').default('0.0.0.0'),
    port: z.number().int().min(1).max(65535, 'Port must be between 1 and 65535')
  }),
  performance: z.object({
    enableChunkCaching: z.boolean().default(true),
    worldSaveInterval: z.number().int().min(100).max(10000, 'Interval must be between 100ms and 10s'),
    maxLoadedChunks: z.number().int().min(100).max(100000, 'Max chunks must be between 100 and 100000')
  }),
  advanced: z.object({
    profilesFolder: z.string().min(1, 'Profiles folder path is required'),
    enableDebugLogging: z.boolean().default(false),
    autoReconnect: z.boolean().default(true),
    reconnectInterval: z.number().int().min(1000).max(30000, 'Interval must be between 1s and 30s').default(5000)
  })
});

export type ProxySettings = z.infer<typeof ProxySettingsSchema>;

export const DEFAULT_PROXY_SETTINGS: ProxySettings = {
  minecraft: {
    version: '1.21.100',
    serverHost: '192.168.1.3',
    serverPort: 20132
  },
  relay: {
    enabled: true,
    host: '0.0.0.0',
    port: 19150
  },
  performance: {
    enableChunkCaching: false,
    worldSaveInterval: 1000,
    maxLoadedChunks: 100000
  },
  advanced: {
    profilesFolder: './profiles',
    enableDebugLogging: false,
    autoReconnect: true,
    reconnectInterval: 5000
  }
};

export interface ProxySettingsValidationError {
  field: string;
  message: string;
}

export function validateProxySettings(settings: unknown): { success: true; data: ProxySettings } | { success: false; errors: ProxySettingsValidationError[] } {
  try {
    const validated = ProxySettingsSchema.parse(settings);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: ProxySettingsValidationError[] = error.issues.map((issue: z.ZodIssue) => ({
        field: issue.path.join('.'),
        message: issue.message
      }));
      return { success: false, errors };
    }
    return { success: false, errors: [{ field: 'unknown', message: 'Invalid settings format' }] };
  }
}

export function mergeWithDefaults(partial: Partial<ProxySettings>): ProxySettings {
  return {
    minecraft: { ...DEFAULT_PROXY_SETTINGS.minecraft, ...partial.minecraft },
    relay: { ...DEFAULT_PROXY_SETTINGS.relay, ...partial.relay },
    performance: { ...DEFAULT_PROXY_SETTINGS.performance, ...partial.performance },
    advanced: { ...DEFAULT_PROXY_SETTINGS.advanced, ...partial.advanced }
  };
}