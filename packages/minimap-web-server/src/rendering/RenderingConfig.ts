import type { RenderingConfig } from '@minecraft-bedrock-minimap/shared';

export interface PerformanceMetrics {
  fps: number;
  drawCalls: number;
  renderTime: number;
  memoryUsage: number;
  visibleChunks: number;
}

export interface DeviceCapabilities {
  isHighEnd: boolean;
  isMobile: boolean;
  supportsWebGL: boolean;
  supportsImageBitmap: boolean;
  supportsOffscreenCanvas: boolean;
  maxCanvasSize: number;
  estimatedVRAM: number;
}

export class RenderingConfigManager {
  private config: RenderingConfig;
  private performanceHistory: PerformanceMetrics[] = [];
  private deviceCapabilities: DeviceCapabilities;
  private readonly maxHistoryLength = 60; // Keep 60 frames of history

  constructor(initialConfig?: Partial<RenderingConfig>) {
    this.deviceCapabilities = this.detectDeviceCapabilities();
    this.config = this.createDefaultConfig(initialConfig);
  }

  private detectDeviceCapabilities(): DeviceCapabilities {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Detect WebGL support
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    const supportsWebGL = !!gl;
    
    // Detect maximum canvas size
    let maxCanvasSize = 4096; // Conservative default
    if (ctx) {
      // Test increasingly large canvas sizes
      const testSizes = [8192, 16384, 32768];
      for (const size of testSizes) {
        canvas.width = size;
        canvas.height = size;
        ctx.fillRect(0, 0, 1, 1);
        if (ctx.getImageData(0, 0, 1, 1).data[0] !== 0) {
          maxCanvasSize = size;
        } else {
          break;
        }
      }
    }

    // Detect device type
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    
    // Estimate device performance level
    const isHighEnd = this.estimatePerformanceLevel();
    
    // Estimate VRAM (rough heuristic)
    const estimatedVRAM = isHighEnd ? 512 : (isMobile ? 128 : 256);

    return {
      isHighEnd,
      isMobile,
      supportsWebGL,
      supportsImageBitmap: typeof createImageBitmap === 'function',
      supportsOffscreenCanvas: typeof OffscreenCanvas === 'function',
      maxCanvasSize,
      estimatedVRAM
    };
  }

  private estimatePerformanceLevel(): boolean {
    // Use various heuristics to estimate device performance
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    const deviceMemory = (navigator as any).deviceMemory || 4;
    
    // High-end if: 8+ cores OR 8GB+ RAM
    return hardwareConcurrency >= 8 || deviceMemory >= 8;
  }

  private createDefaultConfig(overrides?: Partial<RenderingConfig>): RenderingConfig {
    const { deviceCapabilities } = this;
    
    // Base configuration optimized for device type
    const baseConfig: RenderingConfig = {
      useMegaTiles: !deviceCapabilities.isMobile, // Mobile devices may struggle
      megaTileSize: deviceCapabilities.isHighEnd ? 64 : 3,
      useImageBitmap: deviceCapabilities.supportsImageBitmap && !deviceCapabilities.isMobile,
      useDirtyRegions: true, // Always beneficial
      maxCacheSize: deviceCapabilities.isHighEnd ? 200 : (deviceCapabilities.isMobile ? 50 : 100),
      resolutionTiers: deviceCapabilities.isHighEnd ? [64, 128, 256, 512] : [64, 128, 256]
    };

    return { ...baseConfig, ...overrides };
  }

  getConfig(): RenderingConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<RenderingConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  recordPerformanceMetrics(metrics: PerformanceMetrics): void {
    this.performanceHistory.push({
      ...metrics,
      timestamp: Date.now()
    } as PerformanceMetrics & { timestamp: number });

    // Keep only recent history
    if (this.performanceHistory.length > this.maxHistoryLength) {
      this.performanceHistory.shift();
    }

    // Auto-tune based on performance
    this.autoTuneConfiguration(metrics);
  }

  private autoTuneConfiguration(metrics: PerformanceMetrics): void {
    const { fps, renderTime, memoryUsage } = metrics;
    const avgFps = this.getAverageFPS();

    // Performance degradation thresholds
    const targetFPS = 55;
    const criticalFPS = 0;
    const maxRenderTime = 16*100; // 16ms for 60fps

    // Auto-disable expensive features if performance is poor
    if (avgFps < criticalFPS || renderTime > maxRenderTime * 2) {
      // if (this.config.useImageBitmap) {
      //   console.warn('Performance critical: Disabling ImageBitmap');
      //   this.config.useImageBitmap = false;
      // }
      
      // if (this.config.useMegaTiles && this.config.megaTileSize === 5) {
      //   console.warn('Performance critical: Reducing mega tile size');
      //   this.config.megaTileSize = 3;
      // }
    }

    // Reduce cache size if memory usage is high
    const memoryLimitMB = this.deviceCapabilities.isMobile ? 800 : 900;
    if (memoryUsage > memoryLimitMB * 1024 * 1024) {
      this.config.maxCacheSize = Math.max(250000, this.config.maxCacheSize * 0.8);
      console.warn(`High memory usage: Reducing cache size to ${this.config.maxCacheSize}`);
    }

    // Re-enable features if performance improves
    if (avgFps > targetFPS && renderTime < maxRenderTime * 0.8) {
      // Gradually re-enable features
      if (!this.config.useImageBitmap && this.deviceCapabilities.supportsImageBitmap) {
        this.config.useImageBitmap = true;
        console.log('Good performance: Re-enabling ImageBitmap');
      }
    }
  }

  private getAverageFPS(): number {
    if (this.performanceHistory.length === 0) return 60;
    
    const recentFrames = this.performanceHistory.slice(-30); // Last 30 frames
    const sum = recentFrames.reduce((acc, frame) => acc + frame.fps, 0);
    return sum / recentFrames.length;
  }

  getPerformanceStats(): {
    current: PerformanceMetrics | null;
    average: {
      fps: number;
      renderTime: number;
      drawCalls: number;
    };
    trend: 'improving' | 'stable' | 'degrading';
  } {
    const current = this.performanceHistory[this.performanceHistory.length - 1] || null;
    
    if (this.performanceHistory.length < 2) {
      return {
        current,
        average: { fps: 60, renderTime: 10, drawCalls: 50 },
        trend: 'stable'
      };
    }

    const recent = this.performanceHistory.slice(-10);
    const older = this.performanceHistory.slice(-20, -10);

    const recentAvg = recent.reduce((acc, frame) => acc + frame.fps, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((acc, frame) => acc + frame.fps, 0) / older.length : recentAvg;

    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    const fpsDiff = recentAvg - olderAvg;
    if (fpsDiff > 2) trend = 'improving';
    else if (fpsDiff < -2) trend = 'degrading';

    return {
      current,
      average: {
        fps: recentAvg,
        renderTime: recent.reduce((acc, frame) => acc + frame.renderTime, 0) / recent.length,
        drawCalls: recent.reduce((acc, frame) => acc + frame.drawCalls, 0) / recent.length
      },
      trend
    };
  }

  getDeviceCapabilities(): DeviceCapabilities {
    return { ...this.deviceCapabilities };
  }

  getSuggestedRenderDistance(): number {
    const { deviceCapabilities } = this;
    const avgFps = this.getAverageFPS();

    if (deviceCapabilities.isMobile) {
      return avgFps > 45 ? 8 : 6;
    } else if (deviceCapabilities.isHighEnd) {
      return avgFps > 50 ? 16 : 12;
    } else {
      return avgFps > 45 ? 12 : 8;
    }
  }

  resetToDefaults(): void {
    this.config = this.createDefaultConfig();
    this.performanceHistory = [];
  }

  exportConfig(): string {
    return JSON.stringify({
      config: this.config,
      deviceCapabilities: this.deviceCapabilities,
      timestamp: Date.now()
    }, null, 2);
  }

  importConfig(configJson: string): boolean {
    try {
      const data = JSON.parse(configJson);
      if (data.config && typeof data.config === 'object') {
        this.config = { ...this.createDefaultConfig(), ...data.config };
        return true;
      }
    } catch (error) {
      console.error('Failed to import config:', error);
    }
    return false;
  }
}

// Default configuration factory
export function createDefaultRenderingConfig(): RenderingConfig {
  const manager = new RenderingConfigManager();
  return manager.getConfig();
}

// Performance monitoring helper
export function createPerformanceMonitor(): {
  startFrame: () => void;
  endFrame: (drawCalls: number, visibleChunks: number) => PerformanceMetrics;
} {
  let frameStartTime = 0;
  let frameCount = 0;
  let lastFpsTime = Date.now();

  return {
    startFrame: () => {
      frameStartTime = performance.now();
    },
    
    endFrame: (drawCalls: number, visibleChunks: number): PerformanceMetrics => {
      const renderTime = performance.now() - frameStartTime;
      frameCount++;
      
      const now = Date.now();
      const fps = frameCount / ((now - lastFpsTime) / 1000);
      
      // Reset FPS counter every second
      if (now - lastFpsTime >= 1000) {
        frameCount = 0;
        lastFpsTime = now;
      }

      return {
        fps: Math.round(fps),
        drawCalls,
        renderTime,
        memoryUsage: (performance as any).memory?.usedJSHeapSize || 0,
        visibleChunks
      };
    }
  };
}