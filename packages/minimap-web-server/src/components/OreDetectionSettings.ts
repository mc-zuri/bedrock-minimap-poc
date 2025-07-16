/**
 * Ore Detection Settings Component
 * Provides configuration UI for ore detection mode including ore type filtering,
 * highlight styles, and background dimming controls.
 */

import type { OreDetectionConfig } from "@minecraft-bedrock-minimap/shared";
import { OreType, DEFAULT_ORE_DETECTION_CONFIG, getOreHighlightColor, ORE_Y_RANGES, formatYRange, canOreSpawnAtY } from "@minecraft-bedrock-minimap/shared";

export class OreDetectionSettings {
  private settingsPanel: HTMLElement | null = null;
  private isOpen = false;
  private currentConfig: OreDetectionConfig;
  private onConfigChange: ((config: OreDetectionConfig) => void) | null = null;

  constructor() {
    this.currentConfig = this.loadSettings();
    this.createSettingsPanel();
    this.bindEvents();
  }

  /**
   * Check if an ore type is within the current scan range
   */
  private isOreInCurrentScanRange(oreType: OreType): boolean {
    // This will be updated dynamically based on player Y and offsets
    // For now, return true to show all ores
    return true;
  }

  /**
   * Set callback for when configuration changes
   */
  public setConfigChangeCallback(callback: (config: OreDetectionConfig) => void): void {
    this.onConfigChange = callback;
  }

  /**
   * Create the settings panel DOM structure
   */
  private createSettingsPanel(): void {
    const panel = document.createElement('div');
    panel.id = 'ore-settings-panel';
    panel.className = 'ore-settings-panel hidden';
    
    panel.innerHTML = `
      <div class="settings-header">
        <h3>⛏️ Ore Detection Settings</h3>
        <button class="close-btn" title="Close Settings">&times;</button>
      </div>
      
      <div class="settings-content">
        <div class="settings-section">
          <h4>Ore Types</h4>
          <div class="current-scan-info">
            <small>Current scan range: Y<span id="current-scan-min">-64</span> to Y<span id="current-scan-max">320</span></small>
          </div>
          <div class="ore-checkboxes">
            ${Object.values(OreType).map(oreType => {
              const yRange = ORE_Y_RANGES[oreType];
              const isInCurrentRange = this.isOreInCurrentScanRange(oreType);
              return `
              <label class="ore-checkbox ${!isInCurrentRange ? 'ore-out-of-range' : ''}" title="${formatYRange(oreType)}${yRange.optimal ? ` (Best at Y${yRange.optimal})` : ''}">
                <input type="checkbox" value="${oreType}" 
                       ${this.currentConfig.highlightedOres.includes(oreType) ? 'checked' : ''}
                       ${!isInCurrentRange ? 'disabled' : ''}>
                <span class="ore-color" style="background-color: ${getOreHighlightColor(oreType)}"></span>
                <span class="ore-info">
                  <span class="ore-name">${this.formatOreName(oreType)}</span>
                  <span class="ore-y-range">${formatYRange(oreType)}</span>
                </span>
              </label>
            `}).join('')}
          </div>
          <div class="ore-controls">
            <button id="select-all-ores" class="small-btn">Select All</button>
            <button id="select-valuable-ores" class="small-btn">Valuable Only</button>
            <button id="select-available-ores" class="small-btn">Available at Current Y</button>
            <button id="clear-all-ores" class="small-btn">Clear All</button>
          </div>
        </div>
        
        <div class="settings-section">
          <h4>Highlight Style</h4>
          <select id="highlight-style">
            <option value="bright" ${this.currentConfig.highlightStyle === 'bright' ? 'selected' : ''}>Bright Fill</option>
            <option value="glow" ${this.currentConfig.highlightStyle === 'glow' ? 'selected' : ''}>Glow Effect</option>
            <option value="outline" ${this.currentConfig.highlightStyle === 'outline' ? 'selected' : ''}>Outline Only</option>
          </select>
        </div>
        
        <div class="settings-section">
          <h4>Background Dimming</h4>
          <div class="slider-container">
            <input type="range" id="dimming-slider" min="0" max="100" 
                   value="${Math.round(this.currentConfig.backgroundDimming * 100)}"
                   class="dimming-slider">
            <span id="dimming-value">${Math.round(this.currentConfig.backgroundDimming * 100)}%</span>
          </div>
          <div class="dimming-presets">
            <button class="preset-btn" data-dimming="20">Light</button>
            <button class="preset-btn" data-dimming="50">Medium</button>
            <button class="preset-btn" data-dimming="80">Heavy</button>
          </div>
        </div>
        
        <div class="settings-section">
          <h4>Y-Level Scan Range</h4>
          <div class="y-offset-controls">
            <div class="y-offset-control">
              <label>Min Y Offset: <span id="min-y-value">${this.currentConfig.yLevelOffsets?.minY || 0}</span></label>
              <input type="range" id="min-y-slider" min="-100" max="10" 
                     value="${this.currentConfig.yLevelOffsets?.minY || 0}"
                     class="y-offset-slider">
            </div>
            <div class="y-offset-control">
              <label>Max Y Offset: <span id="max-y-value">${this.currentConfig.yLevelOffsets?.maxY || 0}</span></label>
              <input type="range" id="max-y-slider" min="-100" max="10" 
                     value="${this.currentConfig.yLevelOffsets?.maxY || 0}"
                     class="y-offset-slider">
            </div>
            <div class="scan-range-display">
              <small>Scans from Y<span id="scan-min-y">-64</span> to Y<span id="scan-max-y">320</span> (relative to player)</small>
            </div>
          </div>
        </div>
        
        <div class="settings-section">
          <label class="settings-checkbox">
            <input type="checkbox" id="show-ore-labels" ${this.currentConfig.showOreLabels ? 'checked' : ''}>
            <span>Show ore labels (experimental)</span>
          </label>
        </div>
      </div>
      
      <div class="settings-actions">
        <button id="reset-defaults" class="secondary-btn">Reset to Defaults</button>
        <button id="apply-settings" class="primary-btn">Apply Settings</button>
      </div>
    `;
    
    document.body.appendChild(panel);
    this.settingsPanel = panel;
    
    // Add CSS styles
    this.addStyles();
  }

  /**
   * Add CSS styles for the settings panel
   */
  private addStyles(): void {
    if (document.getElementById('ore-settings-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'ore-settings-styles';
    style.textContent = `
      .ore-settings-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(20, 20, 20, 0.98);
        border: 2px solid #555;
        border-radius: 8px;
        padding: 20px;
        z-index: 1000;
        width: 450px;
        max-height: 80vh;
        overflow-y: auto;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      }

      .ore-settings-panel.hidden {
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
      }

      .close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
      }

      .settings-content {
        max-height: 60vh;
        overflow-y: auto;
        padding-right: 10px;
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

      .current-scan-info {
        margin-bottom: 12px;
        padding: 8px;
        background: rgba(255, 107, 53, 0.1);
        border: 1px solid rgba(255, 107, 53, 0.3);
        border-radius: 4px;
        text-align: center;
        color: #ff8c5a;
      }

      .ore-checkboxes {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 8px;
        margin-bottom: 15px;
      }

      .ore-checkbox {
        display: flex;
        align-items: center;
        cursor: pointer;
        padding: 6px 8px;
        border-radius: 4px;
        transition: all 0.2s;
        border: 1px solid transparent;
      }

      .ore-checkbox:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.1);
      }

      .ore-checkbox.ore-out-of-range {
        opacity: 0.5;
      }

      .ore-checkbox.ore-out-of-range:hover {
        background: rgba(255, 0, 0, 0.05);
        border-color: rgba(255, 0, 0, 0.2);
      }

      .ore-checkbox input[type="checkbox"] {
        margin-right: 8px;
        width: 16px;
        height: 16px;
      }

      .ore-checkbox input[type="checkbox"]:disabled {
        cursor: not-allowed;
      }

      .ore-color {
        width: 16px;
        height: 16px;
        border-radius: 3px;
        margin-right: 8px;
        border: 1px solid #777;
        flex-shrink: 0;
      }

      .ore-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .ore-name {
        font-size: 13px;
        text-transform: capitalize;
        font-weight: 500;
      }

      .ore-y-range {
        font-size: 11px;
        color: #999;
        font-family: monospace;
      }

      .ore-controls {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .small-btn {
        padding: 4px 8px;
        background: #444;
        border: 1px solid #666;
        color: white;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: background-color 0.2s;
      }

      .small-btn:hover {
        background: #555;
      }

      #highlight-style {
        width: 100%;
        padding: 8px;
        background: #333;
        border: 1px solid #555;
        color: white;
        border-radius: 4px;
        font-size: 14px;
      }

      .slider-container {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 10px;
      }

      .dimming-slider {
        flex: 1;
        height: 6px;
        background: #333;
        border-radius: 3px;
        outline: none;
      }

      .dimming-slider::-webkit-slider-thumb {
        appearance: none;
        width: 18px;
        height: 18px;
        background: #ff6b35;
        border-radius: 50%;
        cursor: pointer;
      }

      .dimming-slider::-moz-range-thumb {
        width: 18px;
        height: 18px;
        background: #ff6b35;
        border-radius: 50%;
        border: none;
        cursor: pointer;
      }

      #dimming-value {
        font-family: monospace;
        font-size: 14px;
        color: #ff6b35;
        min-width: 40px;
        text-align: right;
      }

      .dimming-presets {
        display: flex;
        gap: 6px;
      }

      .preset-btn {
        padding: 4px 12px;
        background: #444;
        border: 1px solid #666;
        color: white;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }

      .preset-btn:hover {
        background: #ff6b35;
        border-color: #ff8c5a;
      }

      .y-offset-controls {
        margin-top: 10px;
      }

      .y-offset-control {
        margin-bottom: 12px;
      }

      .y-offset-control label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
        font-size: 13px;
        color: #ccc;
      }

      .y-offset-control span {
        font-family: monospace;
        color: #ff6b35;
        min-width: 30px;
        text-align: right;
      }

      .y-offset-slider {
        width: 100%;
        height: 6px;
        background: #333;
        border-radius: 3px;
        outline: none;
        -webkit-appearance: none;
      }

      .y-offset-slider::-webkit-slider-thumb {
        appearance: none;
        width: 18px;
        height: 18px;
        background: #ff6b35;
        border-radius: 50%;
        cursor: pointer;
      }

      .y-offset-slider::-moz-range-thumb {
        width: 18px;
        height: 18px;
        background: #ff6b35;
        border-radius: 50%;
        border: none;
        cursor: pointer;
      }

      .scan-range-display {
        margin-top: 10px;
        padding: 8px;
        background: rgba(255, 107, 53, 0.1);
        border: 1px solid rgba(255, 107, 53, 0.3);
        border-radius: 4px;
        text-align: center;
        font-size: 12px;
        color: #ff8c5a;
      }

      .scan-range-display small {
        display: block;
      }

      .scan-range-display span {
        font-family: monospace;
        font-weight: bold;
        margin: 0 2px;
      }

      .settings-checkbox {
        display: flex;
        align-items: center;
        cursor: pointer;
        padding: 8px;
        border-radius: 4px;
        transition: background-color 0.2s;
      }

      .settings-checkbox:hover {
        background: rgba(255, 255, 255, 0.05);
      }

      .settings-checkbox input[type="checkbox"] {
        margin-right: 10px;
        width: 16px;
        height: 16px;
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
      body.overlay-mode .ore-settings-panel {
        width: 380px;
        font-size: 12px;
      }

      body.overlay-mode .ore-checkboxes {
        grid-template-columns: 1fr;
      }
    `;
    
    document.head.appendChild(style);
  }

  /**
   * Format ore name for display
   */
  private formatOreName(oreType: OreType): string {
    return oreType
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Bind event listeners to settings panel elements
   */
  private bindEvents(): void {
    if (!this.settingsPanel) return;

    // Close button
    const closeBtn = this.settingsPanel.querySelector('.close-btn');
    closeBtn?.addEventListener('click', () => this.close());

    // Close on background click
    this.settingsPanel.addEventListener('click', (e) => {
      if (e.target === this.settingsPanel) {
        this.close();
      }
    });

    // Ore type checkboxes
    const checkboxes = this.settingsPanel.querySelectorAll('.ore-checkbox input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => this.updateOreSelection());
    });

    // Ore control buttons
    this.settingsPanel.querySelector('#select-all-ores')?.addEventListener('click', () => this.selectAllOres());
    this.settingsPanel.querySelector('#select-valuable-ores')?.addEventListener('click', () => this.selectValuableOres());
    this.settingsPanel.querySelector('#select-available-ores')?.addEventListener('click', () => this.selectAvailableOres());
    this.settingsPanel.querySelector('#clear-all-ores')?.addEventListener('click', () => this.clearAllOres());

    // Highlight style selector
    const highlightStyle = this.settingsPanel.querySelector('#highlight-style') as HTMLSelectElement;
    highlightStyle?.addEventListener('change', () => {
      this.currentConfig.highlightStyle = highlightStyle.value as 'bright' | 'glow' | 'outline';
      this.updatePreview();
    });

    // Dimming slider
    const dimmingSlider = this.settingsPanel.querySelector('#dimming-slider') as HTMLInputElement;
    const dimmingValue = this.settingsPanel.querySelector('#dimming-value') as HTMLElement;
    
    dimmingSlider?.addEventListener('input', () => {
      const value = parseInt(dimmingSlider.value);
      dimmingValue.textContent = `${value}%`;
      this.currentConfig.backgroundDimming = value / 100;
      this.updatePreview();
    });

    // Dimming presets
    const presetBtns = this.settingsPanel.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const dimming = parseInt(btn.getAttribute('data-dimming') || '50');
        dimmingSlider.value = dimming.toString();
        dimmingValue.textContent = `${dimming}%`;
        this.currentConfig.backgroundDimming = dimming / 100;
        this.updatePreview();
      });
    });

    // Y-level offset sliders
    const minYSlider = this.settingsPanel.querySelector('#min-y-slider') as HTMLInputElement;
    const maxYSlider = this.settingsPanel.querySelector('#max-y-slider') as HTMLInputElement;
    const minYValue = this.settingsPanel.querySelector('#min-y-value') as HTMLElement;
    const maxYValue = this.settingsPanel.querySelector('#max-y-value') as HTMLElement;
    const scanMinY = this.settingsPanel.querySelector('#scan-min-y') as HTMLElement;
    const scanMaxY = this.settingsPanel.querySelector('#scan-max-y') as HTMLElement;
    
    // Ensure yLevelOffsets exists
    if (!this.currentConfig.yLevelOffsets) {
      this.currentConfig.yLevelOffsets = { minY: -5, maxY: 5 };
    }
    
    const updateScanRange = (playerY: number = 64) => {
      const minY = Math.max(-64, Math.floor(playerY + this.currentConfig.yLevelOffsets.minY));
      const maxY = Math.min(320, Math.ceil(playerY + this.currentConfig.yLevelOffsets.maxY));
      
      if (scanMinY) scanMinY.textContent = minY.toString();
      if (scanMaxY) scanMaxY.textContent = maxY.toString();
    };
    
    minYSlider?.addEventListener('input', () => {
      const value = parseInt(minYSlider.value);
      if (minYValue) minYValue.textContent = value.toString();
      this.currentConfig.yLevelOffsets.minY = value;
      updateScanRange();
      this.updatePreview();
    });
    
    maxYSlider?.addEventListener('input', () => {
      const value = parseInt(maxYSlider.value);
      if (maxYValue) maxYValue.textContent = value.toString();
      this.currentConfig.yLevelOffsets.maxY = value;
      updateScanRange();
      this.updatePreview();
    });
    
    // Initial scan range update
    updateScanRange();
    
    // Show labels checkbox
    const showLabelsCheckbox = this.settingsPanel.querySelector('#show-ore-labels') as HTMLInputElement;
    showLabelsCheckbox?.addEventListener('change', () => {
      this.currentConfig.showOreLabels = showLabelsCheckbox.checked;
      this.updatePreview();
    });

    // Action buttons
    this.settingsPanel.querySelector('#reset-defaults')?.addEventListener('click', () => this.resetToDefaults());
    this.settingsPanel.querySelector('#apply-settings')?.addEventListener('click', () => this.applySettings());

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  /**
   * Update ore selection based on checkboxes
   */
  private updateOreSelection(): void {
    if (!this.settingsPanel) return;

    const checkboxes = this.settingsPanel.querySelectorAll('.ore-checkbox input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    const selectedOres: OreType[] = [];

    checkboxes.forEach(checkbox => {
      if (checkbox.checked) {
        selectedOres.push(checkbox.value as OreType);
      }
    });

    this.currentConfig.highlightedOres = selectedOres;
    this.updatePreview();
  }

  /**
   * Select all ore types
   */
  private selectAllOres(): void {
    if (!this.settingsPanel) return;

    const checkboxes = this.settingsPanel.querySelectorAll('.ore-checkbox input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
    this.updateOreSelection();
  }

  /**
   * Select only valuable ore types (diamond, emerald, ancient debris, etc.)
   */
  private selectValuableOres(): void {
    if (!this.settingsPanel) return;

    const valuableOres = [OreType.DIAMOND, OreType.EMERALD, OreType.ANCIENT_DEBRIS, OreType.QUARTZ, OreType.GOLD, OreType.NETHER_GOLD];
    const checkboxes = this.settingsPanel.querySelectorAll('.ore-checkbox input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    
    checkboxes.forEach(checkbox => {
      checkbox.checked = valuableOres.includes(checkbox.value as OreType);
    });
    this.updateOreSelection();
  }

  /**
   * Select only ores available at current scan range
   */
  private selectAvailableOres(): void {
    if (!this.settingsPanel) return;

    const checkboxes = this.settingsPanel.querySelectorAll('.ore-checkbox input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    checkboxes.forEach(checkbox => {
      const oreType = checkbox.value as OreType;
      checkbox.checked = this.isOreInCurrentScanRange(oreType);
    });
    this.updateOreSelection();
  }

  /**
   * Clear all ore selections
   */
  private clearAllOres(): void {
    if (!this.settingsPanel) return;

    const checkboxes = this.settingsPanel.querySelectorAll('.ore-checkbox input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
    this.updateOreSelection();
  }

  /**
   * Reset settings to defaults
   */
  private resetToDefaults(): void {
    this.currentConfig = { ...DEFAULT_ORE_DETECTION_CONFIG };
    this.updatePanelFromConfig();
    this.updatePreview();
  }

  /**
   * Update panel controls to reflect current config
   */
  private updatePanelFromConfig(): void {
    if (!this.settingsPanel) return;

    // Update ore checkboxes
    const checkboxes = this.settingsPanel.querySelectorAll('.ore-checkbox input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    checkboxes.forEach(checkbox => {
      checkbox.checked = this.currentConfig.highlightedOres.includes(checkbox.value as OreType);
    });

    // Update highlight style
    const highlightStyle = this.settingsPanel.querySelector('#highlight-style') as HTMLSelectElement;
    if (highlightStyle) {
      highlightStyle.value = this.currentConfig.highlightStyle;
    }

    // Update dimming slider
    const dimmingSlider = this.settingsPanel.querySelector('#dimming-slider') as HTMLInputElement;
    const dimmingValue = this.settingsPanel.querySelector('#dimming-value') as HTMLElement;
    if (dimmingSlider && dimmingValue) {
      const percentage = Math.round(this.currentConfig.backgroundDimming * 100);
      dimmingSlider.value = percentage.toString();
      dimmingValue.textContent = `${percentage}%`;
    }

    // Update Y-level offset sliders
    const minYSlider = this.settingsPanel.querySelector('#min-y-slider') as HTMLInputElement;
    const maxYSlider = this.settingsPanel.querySelector('#max-y-slider') as HTMLInputElement;
    const minYValue = this.settingsPanel.querySelector('#min-y-value') as HTMLElement;
    const maxYValue = this.settingsPanel.querySelector('#max-y-value') as HTMLElement;
    
    // Ensure yLevelOffsets exists
    if (!this.currentConfig.yLevelOffsets) {
      this.currentConfig.yLevelOffsets = { minY: -5, maxY: 5 };
    }
    
    if (minYSlider && minYValue) {
      minYSlider.value = this.currentConfig.yLevelOffsets.minY.toString();
      minYValue.textContent = this.currentConfig.yLevelOffsets.minY.toString();
    }
    
    if (maxYSlider && maxYValue) {
      maxYSlider.value = this.currentConfig.yLevelOffsets.maxY.toString();
      maxYValue.textContent = this.currentConfig.yLevelOffsets.maxY.toString();
    }
    
    // Update scan range display
    const scanMinY = this.settingsPanel.querySelector('#scan-min-y') as HTMLElement;
    const scanMaxY = this.settingsPanel.querySelector('#scan-max-y') as HTMLElement;
    const playerY = 64; // Default player Y for display purposes
    
    if (scanMinY) {
      scanMinY.textContent = Math.max(-64, Math.floor(playerY + this.currentConfig.yLevelOffsets.minY)).toString();
    }
    if (scanMaxY) {
      scanMaxY.textContent = Math.min(320, Math.ceil(playerY + this.currentConfig.yLevelOffsets.maxY)).toString();
    }

    // Update show labels checkbox
    const showLabelsCheckbox = this.settingsPanel.querySelector('#show-ore-labels') as HTMLInputElement;
    if (showLabelsCheckbox) {
      showLabelsCheckbox.checked = this.currentConfig.showOreLabels;
    }
  }

  /**
   * Update preview (call config change callback)
   */
  private updatePreview(): void {
    if (this.onConfigChange) {
      this.onConfigChange(this.currentConfig);
    }
  }

  /**
   * Apply settings and close panel
   */
  private applySettings(): void {
    this.saveSettings();
    
    if (this.onConfigChange) {
      this.onConfigChange(this.currentConfig);
    }
    
    this.close();
    
    console.log('⛏️ Ore detection settings applied:', this.currentConfig);
  }

  /**
   * Load settings from localStorage
   */
  private loadSettings(): OreDetectionConfig {
    const saved = localStorage.getItem('oreDetectionConfig');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge with defaults to ensure we have all required fields
        const config = {
          ...DEFAULT_ORE_DETECTION_CONFIG,
          ...parsed
        };
        
        // Ensure yLevelOffsets exists (for backward compatibility)
        if (!config.yLevelOffsets) {
          config.yLevelOffsets = DEFAULT_ORE_DETECTION_CONFIG.yLevelOffsets;
        }
        
        return config;
      } catch (error) {
        console.warn('Failed to load ore detection settings:', error);
      }
    }
    
    // Return default configuration
    return { ...DEFAULT_ORE_DETECTION_CONFIG };
  }

  /**
   * Save settings to localStorage
   */
  private saveSettings(): void {
    try {
      localStorage.setItem('oreDetectionConfig', JSON.stringify(this.currentConfig));
    } catch (error) {
      console.error('Failed to save ore detection settings:', error);
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): OreDetectionConfig {
    return { ...this.currentConfig };
  }

  /**
   * Update configuration programmatically
   */
  public updateConfig(newConfig: Partial<OreDetectionConfig>): void {
    this.currentConfig = { ...this.currentConfig, ...newConfig };
    this.updatePanelFromConfig();
    this.saveSettings();
  }

  /**
   * Open settings panel
   */
  public open(): void {
    if (!this.settingsPanel) return;
    
    this.isOpen = true;
    this.settingsPanel.classList.remove('hidden');
    this.updatePanelFromConfig();
  }

  /**
   * Close settings panel
   */
  public close(): void {
    if (!this.settingsPanel) return;
    
    this.isOpen = false;
    this.settingsPanel.classList.add('hidden');
  }

  /**
   * Toggle settings panel
   */
  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Check if settings panel is open
   */
  public isOpened(): boolean {
    return this.isOpen;
  }

  /**
   * Destroy the settings panel
   */
  public destroy(): void {
    if (this.settingsPanel) {
      this.settingsPanel.remove();
      this.settingsPanel = null;
    }
    
    const styleElement = document.getElementById('ore-settings-styles');
    if (styleElement) {
      styleElement.remove();
    }
    
    this.isOpen = false;
  }
}