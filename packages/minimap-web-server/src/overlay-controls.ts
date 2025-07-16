/**
 * Overlay Controls - Web-side overlay functionality
 * Provides overlay-specific UI controls and keyboard shortcuts when running in Electron
 */

export class OverlayControls {
  private isElectron: boolean;
  private opacitySlider: HTMLInputElement | null = null;
  private overlayControlsElement: HTMLElement | null = null;

  constructor() {
    this.isElectron = this.detectElectron();
    if (this.isElectron) {
      this.setupControls();
    }
  }

  private detectElectron(): boolean {
    // Check if window.electronAPI exists (provided by preload script)
    return typeof (window as any).electronAPI !== 'undefined';
  }

  private setupControls(): void {
    if (!this.isElectron) return;

    // Setup opacity slider if element exists
    this.setupOpacitySlider();

    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Setup initial state
    this.syncWithElectronSettings();

    console.log('✅ Overlay controls initialized');
  }

  private setupOpacitySlider(): void {
    this.opacitySlider = document.getElementById('opacity-slider') as HTMLInputElement;
    this.overlayControlsElement = document.getElementById('overlay-controls');

    if (this.opacitySlider && this.overlayControlsElement) {
      // Show the overlay controls
      this.overlayControlsElement.style.display = 'block';

      // Add event listener for opacity changes
      this.opacitySlider.addEventListener('input', (event) => {
        const target = event.target as HTMLInputElement;
        const opacity = parseFloat(target.value);
        this.setOpacity(opacity);
      });

      console.log('📊 Opacity slider initialized');
    }
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (event) => {
      // Ctrl/Cmd + Plus: Increase opacity
      if ((event.ctrlKey || event.metaKey) && event.key === '=') {
        event.preventDefault();
        this.adjustOpacity(0.1);
      }
      // Ctrl/Cmd + Minus: Decrease opacity
      else if ((event.ctrlKey || event.metaKey) && event.key === '-') {
        event.preventDefault();
        this.adjustOpacity(-0.1);
      }
      // Ctrl/Cmd + 0: Reset opacity to 80%
      else if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        this.setOpacity(0.8);
      }
      // F11: Toggle always on top
      else if (event.key === 'F11') {
        event.preventDefault();
        this.toggleAlwaysOnTop();
      }
      // Escape: Minimize window
      else if (event.key === 'Escape') {
        event.preventDefault();
        this.minimizeWindow();
      }
      // Ctrl/Cmd + H: Toggle controls visibility
      else if ((event.ctrlKey || event.metaKey) && event.key === 'h') {
        event.preventDefault();
        this.toggleControlsVisibility();
      }
      // Ctrl/Cmd + M: Minimize window
      else if ((event.ctrlKey || event.metaKey) && event.key === 'm') {
        event.preventDefault();
        this.minimizeWindow();
      }
      // Ctrl/Cmd + W or Alt + F4: Close window
      else if (((event.ctrlKey || event.metaKey) && event.key === 'w') || 
               (event.altKey && event.key === 'F4')) {
        event.preventDefault();
        this.closeWindow();
      }
    });

    console.log('⌨️ Keyboard shortcuts initialized');
  }

  private async syncWithElectronSettings(): Promise<void> {
    try {
      const electronAPI = (window as any).electronAPI;
      
      // Get current opacity and update slider
      const currentOpacity = await electronAPI.getOpacity();
      if (currentOpacity && this.opacitySlider) {
        this.opacitySlider.value = currentOpacity.toString();
      }

      // Check if we need CSS opacity fallback on initialization
      const settings = await electronAPI.getSettings();
      if (settings && settings.opacity) {
        // Wait a bit for window to fully load, then check opacity
        setTimeout(async () => {
          const actualOpacity = await electronAPI.getOpacity();
          if (Math.abs(actualOpacity - settings.opacity) > 0.01) {
            console.log(`🎨 Initializing CSS opacity fallback`);
            this.applyCSSOpacity(settings.opacity);
          }
        }, 500);
      }

      // Listen for settings changes from main process
      electronAPI.onSettingsChanged((event: any, settings: any) => {
        console.log('⚙️ Settings changed:', settings);
        
        if (settings.opacity !== undefined && this.opacitySlider) {
          this.opacitySlider.value = settings.opacity.toString();
        }
        
        if (settings.hideControls !== undefined) {
          this.toggleControls(!settings.hideControls);
        }
      });

    } catch (error) {
      console.warn('⚠️ Failed to sync with Electron settings:', error);
    }
  }

  public async setOpacity(opacity: number): Promise<void> {
    if (!this.isElectron) return;

    try {
      const electronAPI = (window as any).electronAPI;
      const actualOpacity = await electronAPI.setOpacity(opacity);
      
      if (actualOpacity && this.opacitySlider) {
        this.opacitySlider.value = actualOpacity.toString();
      }

      // Check if window-level opacity worked, if not apply CSS fallback
      const currentOpacity = await electronAPI.getOpacity();
      if (Math.abs(currentOpacity - opacity) > 0.01) {
        console.log(`🎨 Window opacity not supported, applying CSS opacity fallback`);
        this.applyCSSOpacity(opacity);
      }

      console.log(`📊 Opacity set to ${(opacity * 100).toFixed(0)}%`);
    } catch (error) {
      console.error('❌ Failed to set opacity:', error);
    }
  }

  private applyCSSOpacity(opacity: number): void {
    // Apply opacity to the entire app body as a fallback
    document.body.style.opacity = opacity.toString();
    console.log(`🎨 Applied CSS opacity: ${(opacity * 100).toFixed(0)}%`);
  }

  public async adjustOpacity(delta: number): Promise<void> {
    if (!this.isElectron) return;

    try {
      const electronAPI = (window as any).electronAPI;
      const newOpacity = await electronAPI.adjustOpacity(delta);
      
      if (newOpacity && this.opacitySlider) {
        this.opacitySlider.value = newOpacity.toString();
      }

      // Check if window-level opacity worked, if not apply CSS fallback
      const currentOpacity = await electronAPI.getOpacity();
      if (Math.abs(currentOpacity - newOpacity) > 0.01) {
        this.applyCSSOpacity(newOpacity);
      }

      console.log(`📊 Opacity adjusted to ${(newOpacity * 100).toFixed(0)}%`);
    } catch (error) {
      console.error('❌ Failed to adjust opacity:', error);
    }
  }

  public async toggleAlwaysOnTop(): Promise<void> {
    if (!this.isElectron) return;

    try {
      const electronAPI = (window as any).electronAPI;
      const newValue = await electronAPI.toggleAlwaysOnTop();
      console.log(`📌 Always on top: ${newValue}`);
    } catch (error) {
      console.error('❌ Failed to toggle always on top:', error);
    }
  }

  public async minimizeWindow(): Promise<void> {
    if (!this.isElectron) return;

    try {
      const electronAPI = (window as any).electronAPI;
      await electronAPI.minimizeWindow();
      console.log('📉 Window minimized');
    } catch (error) {
      console.error('❌ Failed to minimize window:', error);
    }
  }

  public async closeWindow(): Promise<void> {
    if (!this.isElectron) return;

    try {
      const electronAPI = (window as any).electronAPI;
      await electronAPI.closeWindow();
      console.log('🚪 Window closed');
    } catch (error) {
      console.error('❌ Failed to close window:', error);
    }
  }

  public async getSettings(): Promise<any> {
    if (!this.isElectron) return null;

    try {
      const electronAPI = (window as any).electronAPI;
      return await electronAPI.getSettings();
    } catch (error) {
      console.error('❌ Failed to get settings:', error);
      return null;
    }
  }

  public isOverlayMode(): boolean {
    return this.isElectron;
  }

  private toggleControls(show: boolean): void {
    const controlsElement = document.querySelector('.controls');
    if (controlsElement) {
      if (show) {
        controlsElement.classList.remove('hidden');
      } else {
        controlsElement.classList.add('hidden');
      }
      console.log(`🎛️ Controls ${show ? 'shown' : 'hidden'}`);
    }
  }

  public async toggleControlsVisibility(): Promise<void> {
    if (!this.isElectron) return;

    try {
      const electronAPI = (window as any).electronAPI;
      const settings = await electronAPI.getSettings();
      const newValue = !settings.hideControls;
      
      // Update setting in Electron
      await electronAPI.getSettings(); // This will trigger the setting change
      
      // Toggle immediately in UI
      this.toggleControls(!newValue);
      
      console.log(`🎛️ Controls visibility toggled: ${!newValue ? 'shown' : 'hidden'}`);
    } catch (error) {
      console.error('❌ Failed to toggle controls visibility:', error);
    }
  }


  public destroy(): void {
    // Cleanup event listeners if needed
    console.log('🧹 Overlay controls destroyed');
  }
}