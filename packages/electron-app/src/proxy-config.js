import Store from 'electron-store';

// Note: Since this is a .js file in electron-app, we'll use the defaultProxyConfig directly
// instead of importing from shared to avoid ESM/CJS issues in Electron
const defaultProxyConfig = {
  minecraft: {
    version: '1.21.93',
    serverHost: 'localhost',
    serverPort: 19132
  },
  relay: {
    enabled: true,
    host: '0.0.0.0',
    port: 19150
  },
  performance: {
    enableChunkCaching: true,
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

// Simple validation function for proxy settings
function validateProxySettings(settings) {
  try {
    // Basic structure validation
    if (!settings || typeof settings !== 'object') {
      return { success: false, errors: [{ field: 'root', message: 'Settings must be an object' }] };
    }
    
    // Check required sections exist
    const requiredSections = ['minecraft', 'relay', 'performance', 'advanced'];
    for (const section of requiredSections) {
      if (!settings[section] || typeof settings[section] !== 'object') {
        return { success: false, errors: [{ field: section, message: `Missing ${section} section` }] };
      }
    }
    
    // Validate minecraft section
    if (!settings.minecraft.version || !/^\d+\.\d+\.\d+$/.test(settings.minecraft.version)) {
      return { success: false, errors: [{ field: 'minecraft.version', message: 'Invalid version format' }] };
    }
    if (!settings.minecraft.serverHost || typeof settings.minecraft.serverHost !== 'string') {
      return { success: false, errors: [{ field: 'minecraft.serverHost', message: 'Server host is required' }] };
    }
    if (!Number.isInteger(settings.minecraft.serverPort) || settings.minecraft.serverPort < 1 || settings.minecraft.serverPort > 65535) {
      return { success: false, errors: [{ field: 'minecraft.serverPort', message: 'Port must be between 1 and 65535' }] };
    }
    
    // Validate relay section
    if (typeof settings.relay.enabled !== 'boolean') {
      return { success: false, errors: [{ field: 'relay.enabled', message: 'Enabled must be boolean' }] };
    }
    if (!settings.relay.host || !/^(\d{1,3}\.){3}\d{1,3}$/.test(settings.relay.host)) {
      return { success: false, errors: [{ field: 'relay.host', message: 'Invalid IP address format' }] };
    }
    if (!Number.isInteger(settings.relay.port) || settings.relay.port < 1 || settings.relay.port > 65535) {
      return { success: false, errors: [{ field: 'relay.port', message: 'Port must be between 1 and 65535' }] };
    }
    
    return { success: true, data: settings };
  } catch (error) {
    return { success: false, errors: [{ field: 'unknown', message: error.message }] };
  }
}

export class ProxyConfig {
  constructor() {
    this.store = new Store({ 
      defaults: defaultProxyConfig,
      name: 'proxy-settings',
      schema: {
        minecraft: {
          type: 'object',
          properties: {
            version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
            serverHost: { type: 'string' },
            serverPort: { type: 'number', minimum: 1, maximum: 65535 }
          }
        },
        relay: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            host: { type: 'string' },
            port: { type: 'number', minimum: 1, maximum: 65535 }
          }
        },
        performance: {
          type: 'object',
          properties: {
            enableChunkCaching: { type: 'boolean' },
            worldSaveInterval: { type: 'number', minimum: 100, maximum: 10000 },
            maxLoadedChunks: { type: 'number', minimum: 100, maximum: 100000 }
          }
        },
        advanced: {
          type: 'object',
          properties: {
            profilesFolder: { type: 'string' },
            enableDebugLogging: { type: 'boolean' },
            autoReconnect: { type: 'boolean' },
            reconnectInterval: { type: 'number', minimum: 1000, maximum: 30000 }
          }
        }
      }
    });
  }

  get(key) {
    return this.store.get(key);
  }

  set(key, value) {
    this.store.set(key, value);
  }

  getAll() {
    try {
      const settings = this.store.store;
      
      // Validate retrieved settings
      const validation = validateProxySettings(settings);
      if (!validation.success) {
        console.error('Invalid settings in store, using defaults:', validation.errors);
        return defaultProxyConfig;
      }
      
      return settings;
    } catch (error) {
      console.error('Error reading settings:', error);
      return defaultProxyConfig;
    }
  }

  setAll(settings) {
    // Deep merge with existing settings to ensure all fields are preserved
    const current = this.getAll();
    const merged = {
      minecraft: { ...current.minecraft, ...settings.minecraft },
      relay: { ...current.relay, ...settings.relay },
      performance: { ...current.performance, ...settings.performance },
      advanced: { ...current.advanced, ...settings.advanced }
    };
    this.store.set(merged);
    return merged;
  }

  reset() {
    this.store.clear();
    return this.getAll(); // Returns defaults after clear
  }

  // Validation methods
  setMinecraftVersion(version) {
    if (/^\d+\.\d+\.\d+$/.test(version)) {
      this.set('minecraft.version', version);
      return version;
    }
    throw new Error('Invalid version format. Expected X.Y.Z');
  }

  setServerPort(port) {
    const validPort = Math.max(1, Math.min(65535, parseInt(port)));
    this.set('minecraft.serverPort', validPort);
    return validPort;
  }

  setRelayPort(port) {
    const validPort = Math.max(1, Math.min(65535, parseInt(port)));
    this.set('relay.port', validPort);
    return validPort;
  }

  setMaxLoadedChunks(chunks) {
    const validChunks = Math.max(100, Math.min(100000, parseInt(chunks)));
    this.set('performance.maxLoadedChunks', validChunks);
    return validChunks;
  }

  setWorldSaveInterval(interval) {
    const validInterval = Math.max(100, Math.min(10000, parseInt(interval)));
    this.set('performance.worldSaveInterval', validInterval);
    return validInterval;
  }

  setReconnectInterval(interval) {
    const validInterval = Math.max(1000, Math.min(30000, parseInt(interval)));
    this.set('advanced.reconnectInterval', validInterval);
    return validInterval;
  }

  // Get environment variables for proxy process
  getProxyEnvironment() {
    const config = this.getAll();
    return {
      MC_VERSION: config.minecraft.version,
      MC_SERVER_HOST: config.minecraft.serverHost,
      MC_SERVER_PORT: config.minecraft.serverPort.toString(),
      RELAY_ENABLED: config.relay.enabled.toString(),
      RELAY_HOST: config.relay.host,
      RELAY_PORT: config.relay.port.toString(),
      ENABLE_CHUNK_CACHING: config.performance.enableChunkCaching.toString(),
      WORLD_SAVE_INTERVAL: config.performance.worldSaveInterval.toString(),
      MAX_LOADED_CHUNKS: config.performance.maxLoadedChunks.toString(),
      PROFILES_FOLDER: config.advanced.profilesFolder,
      ENABLE_DEBUG_LOGGING: config.advanced.enableDebugLogging.toString(),
      AUTO_RECONNECT: config.advanced.autoReconnect.toString(),
      RECONNECT_INTERVAL: config.advanced.reconnectInterval.toString()
    };
  }
}