/**
 * Performance tracking utilities for minimap rendering
 */

export interface PerformanceMetrics {
  currentFps: number;
  averageFps: number;
  frameTime: number;
  chunkCacheHits: number;
  chunkCacheMisses: number;
}

export class FpsTracker {
  private frameCount = 0;
  private lastTime = performance.now();
  private fpsHistory: number[] = [];
  private maxHistorySize = 60;
  
  // Cache performance metrics
  private cacheHits = 0;
  private cacheMisses = 0;
  
  /**
   * Track a frame and return current FPS
   * @returns Current FPS value
   */
  trackFrame(): number {
    this.frameCount++;
    const now = performance.now();
    const delta = now - this.lastTime;
    
    if (delta >= 1000) {  // Update every second
      const fps = (this.frameCount * 1000) / delta;
      this.fpsHistory.push(fps);
      
      // Maintain history size
      if (this.fpsHistory.length > this.maxHistorySize) {
        this.fpsHistory.shift();
      }
      
      this.frameCount = 0;
      this.lastTime = now;
      return fps;
    }
    
    return this.getCurrentFps();
  }
  
  /**
   * Get the current FPS (last recorded value)
   */
  getCurrentFps(): number {
    return this.fpsHistory.length > 0 
      ? this.fpsHistory[this.fpsHistory.length - 1] 
      : 0;
  }
  
  /**
   * Get average FPS over the history period
   */
  getAverageFps(): number {
    if (this.fpsHistory.length === 0) return 0;
    
    const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
    return sum / this.fpsHistory.length;
  }
  
  /**
   * Get minimum FPS from history
   */
  getMinFps(): number {
    return this.fpsHistory.length > 0 
      ? Math.min(...this.fpsHistory) 
      : 0;
  }
  
  /**
   * Get maximum FPS from history
   */
  getMaxFps(): number {
    return this.fpsHistory.length > 0 
      ? Math.max(...this.fpsHistory) 
      : 0;
  }
  
  /**
   * Record a cache hit
   */
  recordCacheHit(): void {
    this.cacheHits++;
  }
  
  /**
   * Record a cache miss
   */
  recordCacheMiss(): void {
    this.cacheMisses++;
  }
  
  /**
   * Get cache hit rate as a percentage
   */
  getCacheHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    return total > 0 ? (this.cacheHits / total) * 100 : 0;
  }
  
  /**
   * Get all performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return {
      currentFps: this.getCurrentFps(),
      averageFps: this.getAverageFps(),
      frameTime: this.fpsHistory.length > 0 ? 1000 / this.getCurrentFps() : 0,
      chunkCacheHits: this.cacheHits,
      chunkCacheMisses: this.cacheMisses
    };
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fpsHistory = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
}

// Singleton instance for global FPS tracking
export const globalFpsTracker = new FpsTracker();

/**
 * Convenience function to track a frame
 */
export function trackFrame(): number {
  return globalFpsTracker.trackFrame();
}

/**
 * Get current performance metrics
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  return globalFpsTracker.getMetrics();
}