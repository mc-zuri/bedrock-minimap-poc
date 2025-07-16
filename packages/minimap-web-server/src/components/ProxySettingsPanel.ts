import type { ProxySettings, ProxySettingsValidationError } from "@minecraft-bedrock-minimap/shared";
import { DEFAULT_PROXY_SETTINGS, validateProxySettings, mergeWithDefaults, ProxySettingsSchema } from "@minecraft-bedrock-minimap/shared";

export class ProxySettingsPanel {
  private container: HTMLDivElement | null = null;
  private isOpen = false;
  private settings: ProxySettings;
  private activeTab: 'general' | 'connection' | 'performance' | 'advanced' = 'general';
  private onSave?: (settings: ProxySettings) => void;
  private validationErrors: ProxySettingsValidationError[] = [];

  constructor() {
    this.settings = this.loadSettings();
    this.createContainer();
    this.injectStyles();
    this.bindEvents();
  }

  public setOnSaveCallback(callback: (settings: ProxySettings) => void): void {
    this.onSave = callback;
  }

  private createContainer(): void {
    const container = document.createElement('div');
    container.id = 'proxy-settings-panel';
    container.className = 'proxy-settings-panel hidden';
    
    container.innerHTML = `
      <div class="settings-header">
        <h3>⚙️ Proxy Server Settings</h3>
        <button class="close-btn" title="Close Settings">&times;</button>
      </div>
      
      <div class="settings-tabs">
        <button class="tab-btn active" data-tab="general">General</button>
        <button class="tab-btn" data-tab="connection">Connection</button>
        <button class="tab-btn" data-tab="performance">Performance</button>
        <button class="tab-btn" data-tab="advanced">Advanced</button>
      </div>
      
      <div class="settings-content">
        <div id="validation-errors" class="validation-errors hidden"></div>
        
        <div class="tab-content active" data-tab="general">
          <div class="settings-section">
            <h4>Minecraft Settings</h4>
            <div class="form-group">
              <label for="minecraft-version">Minecraft Version</label>
              <input type="text" id="minecraft-version" value="${this.settings.minecraft.version}" 
                     placeholder="1.21.93" pattern="^\\d+\\.\\d+\\.\\d+$"
                     title="Version format: X.Y.Z">
              <small>Bedrock protocol version (e.g., 1.21.93)</small>
            </div>
          </div>
          
          <div class="settings-section">
            <h4>Server Information</h4>
            <div class="server-status">
              <div class="status-item">
                <span class="status-label">Proxy Status:</span>
                <span id="proxy-status" class="status-value">Not Connected</span>
              </div>
              <div class="status-item">
                <span class="status-label">Minecraft Server:</span>
                <span id="minecraft-status" class="status-value">Not Connected</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="tab-content" data-tab="connection">
          <div class="settings-section">
            <h4>Minecraft Server Connection</h4>
            <div class="form-group">
              <label for="server-host">Server Host</label>
              <input type="text" id="server-host" value="${this.settings.minecraft.serverHost}" 
                     placeholder="localhost or server address">
              <small>Minecraft Bedrock server address</small>
            </div>
            <div class="form-group">
              <label for="server-port">Server Port</label>
              <input type="number" id="server-port" value="${this.settings.minecraft.serverPort}" 
                     min="1" max="65535" placeholder="19132">
              <small>Default Bedrock port is 19132</small>
            </div>
          </div>
          
          <div class="settings-section">
            <h4>Relay Settings</h4>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="relay-enabled" ${this.settings.relay.enabled ? 'checked' : ''}>
                <span>Enable Relay Mode</span>
              </label>
              <small>Allow external connections through the proxy</small>
            </div>
            <div class="form-group ${!this.settings.relay.enabled ? 'disabled' : ''}">
              <label for="relay-host">Relay Host</label>
              <input type="text" id="relay-host" value="${this.settings.relay.host}" 
                     placeholder="0.0.0.0" ${!this.settings.relay.enabled ? 'disabled' : ''}>
              <small>IP address to bind relay server</small>
            </div>
            <div class="form-group ${!this.settings.relay.enabled ? 'disabled' : ''}">
              <label for="relay-port">Relay Port</label>
              <input type="number" id="relay-port" value="${this.settings.relay.port}" 
                     min="1" max="65535" placeholder="19150" ${!this.settings.relay.enabled ? 'disabled' : ''}>
              <small>Port for clients to connect through</small>
            </div>
          </div>
        </div>
        
        <div class="tab-content" data-tab="performance">
          <div class="settings-section">
            <h4>Chunk Management</h4>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="chunk-caching" ${this.settings.performance.enableChunkCaching ? 'checked' : ''}>
                <span>Enable Chunk Caching</span>
              </label>
              <small>Cache chunks to improve performance</small>
            </div>
            <div class="form-group">
              <label for="max-chunks">Maximum Loaded Chunks</label>
              <input type="number" id="max-chunks" value="${this.settings.performance.maxLoadedChunks}" 
                     min="100" max="100000" step="100">
              <small>Maximum number of chunks to keep in memory</small>
            </div>
          </div>
          
          <div class="settings-section">
            <h4>Update Intervals</h4>
            <div class="form-group">
              <label for="world-save-interval">World Save Interval (ms)</label>
              <input type="number" id="world-save-interval" value="${this.settings.performance.worldSaveInterval}" 
                     min="100" max="10000" step="100">
              <small>How often to save world data (100-10000ms)</small>
            </div>
          </div>
        </div>
        
        <div class="tab-content" data-tab="advanced">
          <div class="settings-section">
            <h4>Storage</h4>
            <div class="form-group">
              <label for="profiles-folder">Profiles Folder</label>
              <input type="text" id="profiles-folder" value="${this.settings.advanced.profilesFolder}" 
                     placeholder="./profiles">
              <small>Path to store player profiles and world data</small>
            </div>
          </div>
          
          <div class="settings-section">
            <h4>Connection Recovery</h4>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="auto-reconnect" ${this.settings.advanced.autoReconnect ? 'checked' : ''}>
                <span>Auto Reconnect</span>
              </label>
              <small>Automatically reconnect on connection loss</small>
            </div>
            <div class="form-group ${!this.settings.advanced.autoReconnect ? 'disabled' : ''}">
              <label for="reconnect-interval">Reconnect Interval (ms)</label>
              <input type="number" id="reconnect-interval" value="${this.settings.advanced.reconnectInterval}" 
                     min="1000" max="30000" step="1000" ${!this.settings.advanced.autoReconnect ? 'disabled' : ''}>
              <small>Time between reconnection attempts (1-30s)</small>
            </div>
          </div>
          
          <div class="settings-section">
            <h4>Debug Options</h4>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="debug-logging" ${this.settings.advanced.enableDebugLogging ? 'checked' : ''}>
                <span>Enable Debug Logging</span>
              </label>
              <small>Log detailed proxy operations to console</small>
            </div>
          </div>
        </div>
      </div>
      
      <div class="settings-actions">
        <button id="reset-defaults" class="secondary-btn">Reset to Defaults</button>
        <button id="apply-settings" class="primary-btn">Apply Settings</button>
      </div>
    `;
    
    document.body.appendChild(container);
    this.container = container;
  }

  private injectStyles(): void {
    if (document.getElementById('proxy-settings-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'proxy-settings-styles';
    style.textContent = `
      .proxy-settings-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(20, 20, 20, 0.98);
        border: 2px solid #555;
        border-radius: 8px;
        padding: 20px;
        z-index: 1000;
        width: 500px;
        max-height: 80vh;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      }

      .proxy-settings-panel.hidden {
        display: none;
      }

      .settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        border-bottom: 1px solid #555;
        padding-bottom: 15px;
      }

      .settings-header h3 {
        margin: 0;
        font-size: 18px;
        color: #ff6b35;
      }

      .close-btn {
        background: none;
        border: none;
        color: #ccc;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
      }

      .settings-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 20px;
        border-bottom: 1px solid #444;
      }

      .tab-btn {
        background: none;
        border: none;
        color: #999;
        padding: 10px 16px;
        cursor: pointer;
        font-size: 14px;
        border-bottom: 2px solid transparent;
        transition: all 0.2s;
      }

      .tab-btn:hover {
        color: #ccc;
      }

      .tab-btn.active {
        color: #ff6b35;
        border-bottom-color: #ff6b35;
      }

      .settings-content {
        max-height: 50vh;
        overflow-y: auto;
        padding-right: 10px;
      }

      .tab-content {
        display: none;
      }

      .tab-content.active {
        display: block;
      }

      .validation-errors {
        background: rgba(255, 0, 0, 0.1);
        border: 1px solid rgba(255, 0, 0, 0.3);
        border-radius: 4px;
        padding: 12px;
        margin-bottom: 20px;
      }

      .validation-errors.hidden {
        display: none;
      }

      .validation-error {
        color: #ff6666;
        font-size: 13px;
        margin-bottom: 4px;
      }

      .validation-error:last-child {
        margin-bottom: 0;
      }

      .settings-section {
        margin-bottom: 25px;
      }

      .settings-section h4 {
        margin: 0 0 12px 0;
        font-size: 14px;
        color: #ccc;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .form-group {
        margin-bottom: 16px;
        transition: opacity 0.2s;
      }

      .form-group.disabled {
        opacity: 0.5;
      }

      .form-group label {
        display: block;
        margin-bottom: 6px;
        font-size: 13px;
        color: #ccc;
        font-weight: 500;
      }

      .form-group input[type="text"],
      .form-group input[type="number"] {
        width: 100%;
        padding: 8px 12px;
        background: #333;
        border: 1px solid #555;
        color: white;
        border-radius: 4px;
        font-size: 14px;
        transition: border-color 0.2s;
      }

      .form-group input:focus {
        outline: none;
        border-color: #ff6b35;
      }

      .form-group input:invalid {
        border-color: #ff4444;
      }

      .form-group input:disabled {
        background: #2a2a2a;
        color: #666;
        cursor: not-allowed;
      }

      .form-group small {
        display: block;
        margin-top: 4px;
        font-size: 12px;
        color: #999;
      }

      .checkbox-label {
        display: flex;
        align-items: center;
        cursor: pointer;
      }

      .checkbox-label input[type="checkbox"] {
        margin-right: 8px;
        width: 16px;
        height: 16px;
        cursor: pointer;
      }

      .server-status {
        background: #2a2a2a;
        border-radius: 4px;
        padding: 12px;
      }

      .status-item {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .status-item:last-child {
        margin-bottom: 0;
      }

      .status-label {
        font-size: 13px;
        color: #999;
      }

      .status-value {
        font-size: 13px;
        font-weight: 500;
      }

      .status-value.connected {
        color: #66ff66;
      }

      .status-value.disconnected {
        color: #ff6666;
      }

      .settings-actions {
        display: flex;
        justify-content: space-between;
        margin-top: 25px;
        padding-top: 20px;
        border-top: 1px solid #555;
        gap: 12px;
      }

      .secondary-btn {
        padding: 10px 20px;
        background: #444;
        border: 1px solid #666;
        color: white;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s;
      }

      .secondary-btn:hover {
        background: #555;
      }

      .primary-btn {
        padding: 10px 20px;
        background: #ff6b35;
        border: 1px solid #ff8c5a;
        color: white;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background-color 0.2s;
      }

      .primary-btn:hover {
        background: #ff8c5a;
      }

      /* Scrollbar styling */
      .settings-content::-webkit-scrollbar {
        width: 6px;
      }

      .settings-content::-webkit-scrollbar-track {
        background: #333;
        border-radius: 3px;
      }

      .settings-content::-webkit-scrollbar-thumb {
        background: #666;
        border-radius: 3px;
      }

      .settings-content::-webkit-scrollbar-thumb:hover {
        background: #777;
      }

      /* Overlay mode adjustments */
      body.overlay-mode .proxy-settings-panel {
        width: 420px;
        font-size: 12px;
      }
    `;
    
    document.head.appendChild(style);
  }

  private bindEvents(): void {
    if (!this.container) return;

    // Close button
    const closeBtn = this.container.querySelector('.close-btn');
    closeBtn?.addEventListener('click', () => this.close());

    // Tab switching
    const tabBtns = this.container.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') as 'general' | 'connection' | 'performance' | 'advanced';
        this.switchTab(tab);
      });
    });

    // Relay enabled checkbox
    const relayEnabled = this.container.querySelector('#relay-enabled') as HTMLInputElement;
    relayEnabled?.addEventListener('change', () => {
      const relayHost = this.container!.querySelector('#relay-host') as HTMLInputElement;
      const relayPort = this.container!.querySelector('#relay-port') as HTMLInputElement;
      const relayGroups = this.container!.querySelectorAll('[id^="relay-"]:not(#relay-enabled)');
      
      relayGroups.forEach(element => {
        const formGroup = element.closest('.form-group');
        if (formGroup) {
          formGroup.classList.toggle('disabled', !relayEnabled.checked);
        }
      });
      
      if (relayHost) relayHost.disabled = !relayEnabled.checked;
      if (relayPort) relayPort.disabled = !relayEnabled.checked;
    });

    // Auto reconnect checkbox
    const autoReconnect = this.container.querySelector('#auto-reconnect') as HTMLInputElement;
    autoReconnect?.addEventListener('change', () => {
      const reconnectInterval = this.container!.querySelector('#reconnect-interval') as HTMLInputElement;
      const formGroup = reconnectInterval?.closest('.form-group');
      
      if (formGroup) {
        formGroup.classList.toggle('disabled', !autoReconnect.checked);
      }
      if (reconnectInterval) {
        reconnectInterval.disabled = !autoReconnect.checked;
      }
    });

    // Action buttons
    this.container.querySelector('#reset-defaults')?.addEventListener('click', () => this.resetToDefaults());
    this.container.querySelector('#apply-settings')?.addEventListener('click', async () => await this.validateAndSave());

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // Close on background click
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });
  }

  private switchTab(tab: 'general' | 'connection' | 'performance' | 'advanced'): void {
    if (!this.container) return;

    this.activeTab = tab;

    // Update tab buttons
    const tabBtns = this.container.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });

    // Update tab content
    const tabContents = this.container.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
      content.classList.toggle('active', content.getAttribute('data-tab') === tab);
    });
  }

  private getFormData(): ProxySettings {
    if (!this.container) return this.settings;

    return {
      minecraft: {
        version: (this.container.querySelector('#minecraft-version') as HTMLInputElement).value,
        serverHost: (this.container.querySelector('#server-host') as HTMLInputElement).value,
        serverPort: parseInt((this.container.querySelector('#server-port') as HTMLInputElement).value)
      },
      relay: {
        enabled: (this.container.querySelector('#relay-enabled') as HTMLInputElement).checked,
        host: (this.container.querySelector('#relay-host') as HTMLInputElement).value,
        port: parseInt((this.container.querySelector('#relay-port') as HTMLInputElement).value)
      },
      performance: {
        enableChunkCaching: (this.container.querySelector('#chunk-caching') as HTMLInputElement).checked,
        worldSaveInterval: parseInt((this.container.querySelector('#world-save-interval') as HTMLInputElement).value),
        maxLoadedChunks: parseInt((this.container.querySelector('#max-chunks') as HTMLInputElement).value)
      },
      advanced: {
        profilesFolder: (this.container.querySelector('#profiles-folder') as HTMLInputElement).value,
        enableDebugLogging: (this.container.querySelector('#debug-logging') as HTMLInputElement).checked,
        autoReconnect: (this.container.querySelector('#auto-reconnect') as HTMLInputElement).checked,
        reconnectInterval: parseInt((this.container.querySelector('#reconnect-interval') as HTMLInputElement).value)
      }
    };
  }

  private async validateBeforeSubmit(settings: ProxySettings): Promise<{ success: boolean; errors: ProxySettingsValidationError[] }> {
    const errors: ProxySettingsValidationError[] = [];
    
    // Validate profiles path if available
    if (settings.advanced.profilesFolder) {
      const isValidPath = await this.validateProfilesPath(settings.advanced.profilesFolder);
      if (!isValidPath) {
        errors.push({
          field: 'advanced.profilesFolder',
          message: 'Profiles folder path does not exist or is not writable'
        });
      }
    }
    
    // Add any other pre-validations here
    
    return {
      success: errors.length === 0,
      errors
    };
  }

  private async validateProfilesPath(path: string): Promise<boolean> {
    // Skip validation if not in Electron context
    if (typeof window === 'undefined' || !window.electronAPI) {
      return true;
    }
    
    // For now, we'll assume the path is valid since we don't have a file system API exposed
    // In a real implementation, you would add an IPC handler to check path validity
    // TODO: Add IPC handler for path validation
    console.log('Path validation skipped - would validate:', path);
    return true;
  }

  private showValidationErrors(errors: ProxySettingsValidationError[]): void {
    if (!this.container) return;

    const errorContainer = this.container.querySelector('#validation-errors');
    if (!errorContainer) return;

    if (errors.length === 0) {
      errorContainer.classList.add('hidden');
      return;
    }

    errorContainer.innerHTML = errors.map(error => 
      `<div class="validation-error">❌ ${error.field}: ${error.message}</div>`
    ).join('');
    
    errorContainer.classList.remove('hidden');
  }

  private showNotification(message: string, type: 'success' | 'error' = 'success'): void {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: ${type === 'success' ? '#4CAF50' : '#f44336'};
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      z-index: 10000;
      font-size: 14px;
      max-width: 400px;
      animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    
    // Add animation keyframes if not already present
    if (!document.getElementById('notification-animations')) {
      const style = document.createElement('style');
      style.id = 'notification-animations';
      style.textContent = `
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 4000);
  }

  private async validateAndSave(): Promise<void> {
    try {
      const formData = this.getFormData();
      
      // Pre-validate before schema validation
      const preValidation = await this.validateBeforeSubmit(formData);
      if (!preValidation.success) {
        this.showValidationErrors(preValidation.errors);
        return;
      }
      
      const validation = validateProxySettings(formData);
      
      if (validation.success) {
        this.settings = validation.data;
        this.saveSettings();
        this.showValidationErrors([]);
        
        if (this.onSave) {
          this.onSave(this.settings);
        }
        
        // If in Electron context, offer to restart proxy server
        if (typeof window !== 'undefined' && window.electronAPI?.proxySettings?.restartProxy) {
          const shouldRestart = confirm('Settings saved! Would you like to restart the proxy server now to apply the changes?');
          
          if (shouldRestart) {
            try {
              const result = await window.electronAPI.proxySettings.restartProxy();
              if (result.success) {
                this.showNotification('Proxy server restarted successfully', 'success');
              } else {
                this.showNotification(`Failed to restart proxy: ${result.error}`, 'error');
              }
            } catch (error) {
              this.showNotification('Failed to restart proxy server', 'error');
              console.error('Proxy restart error:', error);
            }
          }
        }
        
        this.close();
        console.log('✅ Proxy settings saved:', this.settings);
      } else {
        this.showValidationErrors(validation.errors);
        
        // Switch to tab containing first error
        const firstError = validation.errors[0];
        if (firstError) {
          const fieldPath = firstError.field.split('.');
          const section = fieldPath[0];
          
          const tabMap: Record<string, typeof this.activeTab> = {
            'minecraft': 'connection',
            'relay': 'connection',
            'performance': 'performance',
            'advanced': 'advanced'
          };
          
          const targetTab = tabMap[section] || 'general';
          if (targetTab !== this.activeTab) {
            this.switchTab(targetTab);
          }
        }
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showValidationErrors([{ field: 'unknown', message: 'Failed to save settings' }]);
    }
  }

  private resetToDefaults(): void {
    this.settings = { ...DEFAULT_PROXY_SETTINGS };
    this.updateFormFromSettings();
    this.showValidationErrors([]);
    console.log('🔄 Reset to default settings');
  }

  private updateFormFromSettings(): void {
    if (!this.container) return;

    // General tab
    (this.container.querySelector('#minecraft-version') as HTMLInputElement).value = this.settings.minecraft.version;

    // Connection tab
    (this.container.querySelector('#server-host') as HTMLInputElement).value = this.settings.minecraft.serverHost;
    (this.container.querySelector('#server-port') as HTMLInputElement).value = this.settings.minecraft.serverPort.toString();
    (this.container.querySelector('#relay-enabled') as HTMLInputElement).checked = this.settings.relay.enabled;
    (this.container.querySelector('#relay-host') as HTMLInputElement).value = this.settings.relay.host;
    (this.container.querySelector('#relay-port') as HTMLInputElement).value = this.settings.relay.port.toString();

    // Performance tab
    (this.container.querySelector('#chunk-caching') as HTMLInputElement).checked = this.settings.performance.enableChunkCaching;
    (this.container.querySelector('#world-save-interval') as HTMLInputElement).value = this.settings.performance.worldSaveInterval.toString();
    (this.container.querySelector('#max-chunks') as HTMLInputElement).value = this.settings.performance.maxLoadedChunks.toString();

    // Advanced tab
    (this.container.querySelector('#profiles-folder') as HTMLInputElement).value = this.settings.advanced.profilesFolder;
    (this.container.querySelector('#debug-logging') as HTMLInputElement).checked = this.settings.advanced.enableDebugLogging;
    (this.container.querySelector('#auto-reconnect') as HTMLInputElement).checked = this.settings.advanced.autoReconnect;
    (this.container.querySelector('#reconnect-interval') as HTMLInputElement).value = this.settings.advanced.reconnectInterval.toString();

    // Update disabled states
    const relayEnabled = this.settings.relay.enabled;
    (this.container.querySelector('#relay-host') as HTMLInputElement).disabled = !relayEnabled;
    (this.container.querySelector('#relay-port') as HTMLInputElement).disabled = !relayEnabled;
    
    const autoReconnect = this.settings.advanced.autoReconnect;
    (this.container.querySelector('#reconnect-interval') as HTMLInputElement).disabled = !autoReconnect;
  }

  private loadSettings(): ProxySettings {
    if (typeof window !== 'undefined' && window.electronAPI?.proxySettings?.getAll) {
      // Electron context - load from electron-store via IPC
      try {
        const settings = window.electronAPI.proxySettings.getAll();
        return mergeWithDefaults(settings);
      } catch (error) {
        console.warn('Failed to load settings from electron-store:', error);
      }
    }
    
    // Web context - load from localStorage
    const saved = localStorage.getItem('proxySettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return mergeWithDefaults(parsed);
      } catch (error) {
        console.warn('Failed to parse saved settings:', error);
      }
    }
    
    return { ...DEFAULT_PROXY_SETTINGS };
  }

  private saveSettings(): void {
    if (typeof window !== 'undefined' && window.electronAPI?.proxySettings?.setAll) {
      // Electron context - save to electron-store via IPC
      try {
        window.electronAPI.proxySettings.setAll(this.settings);
      } catch (error) {
        console.error('Failed to save settings to electron-store:', error);
      }
    } else {
      // Web context - save to localStorage
      try {
        localStorage.setItem('proxySettings', JSON.stringify(this.settings));
      } catch (error) {
        console.error('Failed to save settings to localStorage:', error);
      }
    }
  }

  public updateStatus(proxyConnected: boolean, minecraftConnected: boolean): void {
    if (!this.container) return;

    const proxyStatus = this.container.querySelector('#proxy-status');
    const minecraftStatus = this.container.querySelector('#minecraft-status');

    if (proxyStatus) {
      proxyStatus.textContent = proxyConnected ? 'Connected' : 'Not Connected';
      proxyStatus.className = `status-value ${proxyConnected ? 'connected' : 'disconnected'}`;
    }

    if (minecraftStatus) {
      minecraftStatus.textContent = minecraftConnected ? 'Connected' : 'Not Connected';
      minecraftStatus.className = `status-value ${minecraftConnected ? 'connected' : 'disconnected'}`;
    }
  }

  public open(): void {
    if (!this.container) return;
    
    this.isOpen = true;
    this.container.classList.remove('hidden');
    this.updateFormFromSettings();
    this.showValidationErrors([]);
  }

  public close(): void {
    if (!this.container) return;
    
    this.isOpen = false;
    this.container.classList.add('hidden');
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public isOpened(): boolean {
    return this.isOpen;
  }

  public getSettings(): ProxySettings {
    return { ...this.settings };
  }

  public destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    
    const styleElement = document.getElementById('proxy-settings-styles');
    if (styleElement) {
      styleElement.remove();
    }
    
    this.isOpen = false;
  }
}

// Extend window interface for Electron API
declare global {
  interface Window {
    electronAPI?: {
      proxySettings?: {
        getAll: () => ProxySettings;
        setAll: (settings: ProxySettings) => void;
        onChange: (callback: (settings: ProxySettings) => void) => () => void;
        restartProxy: () => Promise<{ success: boolean; error?: string }>;
      };
    };
  }
}