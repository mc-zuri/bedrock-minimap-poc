import type { ProxySettings } from "@minecraft-bedrock-minimap/shared";
import { 
  DEFAULT_PROXY_SETTINGS, 
  validateProxySettings,
  mergeWithDefaults 
} from "@minecraft-bedrock-minimap/shared";

/**
 * Parses boolean values from environment variables
 * @param envVar - The environment variable value
 * @param defaultValue - The default value if envVar is undefined
 * @returns The parsed boolean value
 */
function parseBoolean(envVar: string | undefined, defaultValue: boolean): boolean {
  if (envVar === undefined) return defaultValue;
  return ['true', '1', 'yes', 'on'].includes(envVar.toLowerCase());
}

/**
 * Loads proxy settings from environment variables or defaults
 * Supports both Electron (with env vars) and standalone operation
 */
export class SettingsLoader {
  private settings: ProxySettings;

  constructor() {
    this.settings = this.loadSettings();
  }

  /**
   * Load settings from environment variables with fallback to defaults
   */
  private loadSettings(): ProxySettings {
    // Try to load from environment variables first (Electron mode)
    const envSettings = this.loadFromEnvironment();
    
    if (envSettings) {
      // Validate the settings
      const validation = validateProxySettings(envSettings);
      
      if (validation.success) {
        console.log("✅ Loaded settings from environment variables");
        return validation.data;
      } else {
        console.warn("⚠️  Invalid settings from environment variables, using defaults");
        console.warn("Validation errors:", validation.errors);
      }
    }

    // Fall back to defaults (standalone mode)
    console.log("📋 Using default settings (standalone mode)");
    return DEFAULT_PROXY_SETTINGS;
  }

  /**
   * Attempt to load settings from environment variables
   */
  private loadFromEnvironment(): Partial<ProxySettings> | null {
    // Check if we have any proxy-specific environment variables
    if (!process.env.MC_VERSION && !process.env.MC_SERVER_HOST) {
      return null;
    }

    try {
      const settings: Partial<ProxySettings> = {
        minecraft: {
          version: process.env.MC_VERSION || DEFAULT_PROXY_SETTINGS.minecraft.version,
          serverHost: process.env.MC_SERVER_HOST || DEFAULT_PROXY_SETTINGS.minecraft.serverHost,
          serverPort: parseInt(process.env.MC_SERVER_PORT || String(DEFAULT_PROXY_SETTINGS.minecraft.serverPort), 10)
        },
        relay: {
          enabled: parseBoolean(process.env.RELAY_ENABLED, DEFAULT_PROXY_SETTINGS.relay.enabled),
          host: process.env.RELAY_HOST || DEFAULT_PROXY_SETTINGS.relay.host,
          port: parseInt(process.env.RELAY_PORT || String(DEFAULT_PROXY_SETTINGS.relay.port), 10)
        },
        performance: {
          enableChunkCaching: parseBoolean(process.env.ENABLE_CHUNK_CACHING, DEFAULT_PROXY_SETTINGS.performance.enableChunkCaching),
          worldSaveInterval: parseInt(process.env.WORLD_SAVE_INTERVAL || String(DEFAULT_PROXY_SETTINGS.performance.worldSaveInterval), 10),
          maxLoadedChunks: parseInt(process.env.MAX_LOADED_CHUNKS || String(DEFAULT_PROXY_SETTINGS.performance.maxLoadedChunks), 10)
        },
        advanced: {
          profilesFolder: process.env.PROFILES_FOLDER || DEFAULT_PROXY_SETTINGS.advanced.profilesFolder,
          enableDebugLogging: parseBoolean(process.env.ENABLE_DEBUG_LOGGING, DEFAULT_PROXY_SETTINGS.advanced.enableDebugLogging),
          autoReconnect: parseBoolean(process.env.AUTO_RECONNECT, DEFAULT_PROXY_SETTINGS.advanced.autoReconnect),
          reconnectInterval: parseInt(process.env.RECONNECT_INTERVAL || String(DEFAULT_PROXY_SETTINGS.advanced.reconnectInterval), 10)
        }
      };

      return mergeWithDefaults(settings);
    } catch (error) {
      console.error("❌ Error parsing environment variables:", error);
      return null;
    }
  }

  /**
   * Get the current settings
   */
  getSettings(): ProxySettings {
    return this.settings;
  }

  /**
   * Get relay configuration for bedrock-protocol
   */
  getRelayConfig() {
    return {
      version: this.settings.minecraft.version,
      host: this.settings.relay.host,
      port: this.settings.relay.port,
      enableChunkCaching: this.settings.performance.enableChunkCaching,
      offline: false, // Always false for now
      destination: {
        host: this.settings.minecraft.serverHost,
        port: this.settings.minecraft.serverPort
      },
      profilesFolder: this.settings.advanced.profilesFolder
    };
  }

  /**
   * Check if relay is enabled
   */
  isRelayEnabled(): boolean {
    return this.settings.relay.enabled;
  }

  /**
   * Get debug logging status
   */
  isDebugEnabled(): boolean {
    return this.settings.advanced.enableDebugLogging;
  }

  /**
   * Log current settings (sanitized)
   */
  logSettings(): void {
    console.log("🔧 Proxy Server Settings:");
    console.log("  Minecraft:");
    console.log(`    - Version: ${this.settings.minecraft.version}`);
    console.log(`    - Server: ${this.settings.minecraft.serverHost}:${this.settings.minecraft.serverPort}`);
    console.log("  Relay:");
    console.log(`    - Enabled: ${this.settings.relay.enabled}`);
    console.log(`    - Listen: ${this.settings.relay.host}:${this.settings.relay.port}`);
    console.log("  Performance:");
    console.log(`    - Chunk Caching: ${this.settings.performance.enableChunkCaching}`);
    console.log(`    - Max Chunks: ${this.settings.performance.maxLoadedChunks}`);
    console.log("  Advanced:");
    console.log(`    - Debug Logging: ${this.settings.advanced.enableDebugLogging}`);
    console.log(`    - Auto Reconnect: ${this.settings.advanced.autoReconnect}`);
  }
}

// Export singleton instance
export const settingsLoader = new SettingsLoader();