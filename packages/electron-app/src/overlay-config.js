import Store from 'electron-store';

const defaultConfig = {
  opacity: 0.5,
  alwaysOnTop: true,
  frameless: false,  // Use native window frame by default
  windowBounds: {
    width: 400,
    height: 400,
    x: 100,
    y: 100
  },
  overlayMode: true,
  showDebugInfo: false,
  showConnectionStatus: false,
  hideControls: false
};

export class OverlayConfig {
  constructor() {
    this.store = new Store({ 
      defaults: defaultConfig,
      name: 'overlay-settings'
    });
  }
  
  get(key) { 
    return this.store.get(key); 
  }
  
  set(key, value) { 
    this.store.set(key, value); 
  }
  
  getAll() { 
    return this.store.store; 
  }
  
  reset() {
    this.store.clear();
  }
  
  // Helper methods for specific settings
  getOpacity() {
    return this.get('opacity');
  }
  
  setOpacity(opacity) {
    // Clamp opacity to valid range
    const clampedOpacity = Math.max(0.3, Math.min(1.0, opacity));
    this.set('opacity', clampedOpacity);
    return clampedOpacity;
  }
  
  getWindowBounds() {
    return this.get('windowBounds');
  }
  
  setWindowBounds(bounds) {
    // Ensure minimum size constraints
    const constrainedBounds = {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(200, Math.min(800, bounds.width)),
      height: Math.max(200, Math.min(800, bounds.height))
    };
    this.set('windowBounds', constrainedBounds);
    return constrainedBounds;
  }
  
  toggleAlwaysOnTop() {
    const current = this.get('alwaysOnTop');
    this.set('alwaysOnTop', !current);
    return !current;
  }
  
  toggleFrameless() {
    const current = this.get('frameless');
    this.set('frameless', !current);
    return !current;
  }
  
  toggleOverlayMode() {
    const current = this.get('overlayMode');
    this.set('overlayMode', !current);
    return !current;
  }
}