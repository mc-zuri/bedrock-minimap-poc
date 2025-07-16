/**
 * Multi-resolution chunk caching system with LRU eviction
 */

export interface ChunkCacheEntry {
  canvas: HTMLCanvasElement;  // Off-screen canvas
  bitmap?: ImageBitmap;       // GPU-accelerated bitmap
  blockSize: number;          // Resolution it was rendered at
  resolution: number;         // Cache tier resolution (64, 128, 256)
  lastAccess: number;         // For LRU eviction
  memoryUsage: number;        // Estimated memory usage in bytes
}

export interface ResolutionTier {
  resolution: number;
  maxEntries: number;
  cache: Map<string, ChunkCacheEntry>;
  accessOrder: string[];
}

export class ChunkCache {
  private resolutionTiers: Map<number, ResolutionTier> = new Map();
  private totalMemoryUsage = 0;
  private maxMemoryUsage: number; // in bytes
  private defaultResolutions = [64, 128, 256];
  
  constructor(maxSize: number = 150, maxMemoryMB: number = 100) {
    this.maxMemoryUsage = maxMemoryMB * 1024 * 1024; // Convert to bytes
    
    // Initialize resolution tiers
    this.initializeResolutionTiers(maxSize);
  }

  private initializeResolutionTiers(totalMaxSize: number): void {
    // Distribute cache sizes across resolutions
    // Lower resolutions get more entries since they're smaller
    const distributions = [
      { resolution: 64, ratio: 0.5 },   // 50% for lowest resolution
      { resolution: 128, ratio: 0.3 },  // 30% for medium resolution  
      { resolution: 256, ratio: 0.2 }   // 20% for highest resolution
    ];

    for (const { resolution, ratio } of distributions) {
      const maxEntries = Math.floor(totalMaxSize * ratio);
      this.resolutionTiers.set(resolution, {
        resolution,
        maxEntries,
        cache: new Map(),
        accessOrder: []
      });
    }
  }
  
  /**
   * Get the appropriate resolution tier for a block size
   */
  private getResolutionForBlockSize(blockSize: number): number {
    if (blockSize <= 4) return 64;   // Very zoomed out
    if (blockSize <= 8) return 128;  // Zoomed out
    return 256;                      // Normal/zoomed in
  }

  /**
   * Calculate estimated memory usage for a chunk
   */
  private calculateMemoryUsage(blockSize: number): number {
    const chunkPixelSize = 16 * blockSize;
    // 4 bytes per pixel (RGBA) for canvas
    const canvasMemory = chunkPixelSize * chunkPixelSize * 4;
    // Additional overhead for bitmap if present
    const bitmapMemory = canvasMemory * 0.5; // Estimated
    return canvasMemory + bitmapMemory;
  }

  /**
   * Get cached chunk for specific resolution
   */
  getForResolution(key: string, blockSize: number): ChunkCacheEntry | null {
    const resolution = this.getResolutionForBlockSize(blockSize);
    const tier = this.resolutionTiers.get(resolution);
    
    if (!tier) return null;
    
    const entry = tier.cache.get(key);
    if (entry && entry.blockSize === blockSize) {
      this.updateAccessTime(key, resolution);
      return entry;
    }
    
    return null;
  }

  /**
   * Get a cached chunk or create a new entry
   * @param key Chunk key in format "chunkX,chunkZ"
   * @param blockSize Current block size for resolution check
   * @param creator Function to create the canvas if not cached
   */
  getOrCreate(
    key: string, 
    blockSize: number, 
    creator: () => HTMLCanvasElement | null
  ): HTMLCanvasElement | null {
    const entry = this.getForResolution(key, blockSize);
    
    if (entry) {
      return entry.canvas;
    }
    
    // Create new canvas using creator function
    const canvas = creator();
    if (!canvas) return null;
    
    // Add to cache
    this.set(key, canvas, blockSize);
    return canvas;
  }
  
  /**
   * Get a cached chunk without creating
   */
  get(key: string, blockSize: number): HTMLCanvasElement | null {
    const entry = this.getForResolution(key, blockSize);
    return entry ? entry.canvas : null;
  }
  
  /**
   * Set a chunk in the cache
   */
  set(key: string, canvas: HTMLCanvasElement, blockSize: number, bitmap?: ImageBitmap): void {
    const resolution = this.getResolutionForBlockSize(blockSize);
    const tier = this.resolutionTiers.get(resolution);
    
    if (!tier) return;
    
    const memoryUsage = this.calculateMemoryUsage(blockSize);
    
    // Check memory pressure before adding
    this.handleMemoryPressure(memoryUsage);
    
    // Remove existing entry from access order if present
    const existingIndex = tier.accessOrder.indexOf(key);
    if (existingIndex !== -1) {
      tier.accessOrder.splice(existingIndex, 1);
      // Remove old memory usage
      const oldEntry = tier.cache.get(key);
      if (oldEntry) {
        this.totalMemoryUsage -= oldEntry.memoryUsage;
        oldEntry.bitmap?.close(); // Clean up old bitmap
      }
    }
    
    // Add to end of access order (most recently used)
    tier.accessOrder.push(key);
    
    // Store in tier cache
    const entry: ChunkCacheEntry = {
      canvas,
      bitmap,
      blockSize,
      resolution,
      lastAccess: Date.now(),
      memoryUsage
    };
    
    tier.cache.set(key, entry);
    this.totalMemoryUsage += memoryUsage;
    
    // Evict oldest entries if we exceed max size for this tier
    this.evictFromTier(tier);
  }

  /**
   * Set cached bitmap for existing entry
   */
  setBitmap(key: string, blockSize: number, bitmap: ImageBitmap): void {
    const resolution = this.getResolutionForBlockSize(blockSize);
    const tier = this.resolutionTiers.get(resolution);
    
    if (!tier) return;
    
    const entry = tier.cache.get(key);
    if (entry && entry.blockSize === blockSize) {
      // Clean up old bitmap if exists
      entry.bitmap?.close();
      entry.bitmap = bitmap;
      this.updateAccessTime(key, resolution);
    }
  }
  
  /**
   * Handle memory pressure by evicting entries
   */
  private handleMemoryPressure(newEntrySize: number): void {
    const neededSpace = this.totalMemoryUsage + newEntrySize - this.maxMemoryUsage;
    
    if (neededSpace <= 0) return;
    
    // Prioritize evicting from higher resolution tiers first
    const resolutions = [256, 128, 64];
    let freedSpace = 0;
    
    for (const resolution of resolutions) {
      const tier = this.resolutionTiers.get(resolution);
      if (!tier || freedSpace >= neededSpace) break;
      
      // Evict oldest entries from this tier
      while (tier.accessOrder.length > 0 && freedSpace < neededSpace) {
        const key = tier.accessOrder.shift();
        if (key) {
          const entry = tier.cache.get(key);
          if (entry) {
            entry.bitmap?.close();
            tier.cache.delete(key);
            freedSpace += entry.memoryUsage;
            this.totalMemoryUsage -= entry.memoryUsage;
          }
        }
      }
    }
  }

  /**
   * Evict entries from a specific tier if it exceeds limits
   */
  private evictFromTier(tier: ResolutionTier): void {
    while (tier.cache.size > tier.maxEntries && tier.accessOrder.length > 0) {
      const oldestKey = tier.accessOrder.shift();
      if (oldestKey) {
        const entry = tier.cache.get(oldestKey);
        if (entry) {
          entry.bitmap?.close();
          tier.cache.delete(oldestKey);
          this.totalMemoryUsage -= entry.memoryUsage;
        }
      }
    }
  }

  /**
   * Invalidate specific chunks across all resolutions
   */
  invalidate(keys: string[]): void {
    for (const tier of this.resolutionTiers.values()) {
      for (const key of keys) {
        const entry = tier.cache.get(key);
        if (entry) {
          entry.bitmap?.close();
          tier.cache.delete(key);
          this.totalMemoryUsage -= entry.memoryUsage;
          
          const index = tier.accessOrder.indexOf(key);
          if (index !== -1) {
            tier.accessOrder.splice(index, 1);
          }
        }
      }
    }
  }
  
  /**
   * Invalidate chunks that don't match the current block size
   */
  invalidateByBlockSize(blockSize: number): void {
    const keysToInvalidate: string[] = [];
    
    for (const tier of this.resolutionTiers.values()) {
      for (const [key, entry] of tier.cache.entries()) {
        if (entry.blockSize !== blockSize) {
          keysToInvalidate.push(key);
        }
      }
    }
    
    this.invalidate(keysToInvalidate);
  }
  
  /**
   * Clear all cached chunks
   */
  clear(): void {
    for (const tier of this.resolutionTiers.values()) {
      for (const entry of tier.cache.values()) {
        entry.bitmap?.close();
      }
      tier.cache.clear();
      tier.accessOrder = [];
    }
    this.totalMemoryUsage = 0;
  }
  
  /**
   * Get the current cache size across all tiers
   */
  size(): number {
    let total = 0;
    for (const tier of this.resolutionTiers.values()) {
      total += tier.cache.size;
    }
    return total;
  }
  
  /**
   * Check if a chunk is cached at the current resolution
   */
  has(key: string, blockSize: number): boolean {
    const entry = this.getForResolution(key, blockSize);
    return entry !== null;
  }
  
  /**
   * Update access time and order for LRU
   */
  private updateAccessTime(key: string, resolution: number): void {
    const tier = this.resolutionTiers.get(resolution);
    if (!tier) return;
    
    const entry = tier.cache.get(key);
    if (entry) {
      entry.lastAccess = Date.now();
      
      // Move to end of access order (most recently used)
      const index = tier.accessOrder.indexOf(key);
      if (index !== -1) {
        tier.accessOrder.splice(index, 1);
        tier.accessOrder.push(key);
      }
    }
  }
  
  /**
   * Get comprehensive cache statistics
   */
  getStats(): {
    totalSize: number;
    totalMemoryUsage: number;
    maxMemoryUsage: number;
    memoryFillRate: number;
    tiers: {
      [resolution: number]: {
        size: number;
        maxSize: number;
        fillRate: number;
        memoryUsage: number;
        oldestAccess: number | null;
        newestAccess: number | null;
      };
    };
  } {
    const tiers: Record<number, any> = {};
    let totalMemoryCalculated = 0;
    
    for (const [resolution, tier] of this.resolutionTiers) {
      let oldestAccess: number | null = null;
      let newestAccess: number | null = null;
      let tierMemoryUsage = 0;
      
      for (const entry of tier.cache.values()) {
        tierMemoryUsage += entry.memoryUsage;
        
        if (oldestAccess === null || entry.lastAccess < oldestAccess) {
          oldestAccess = entry.lastAccess;
        }
        if (newestAccess === null || entry.lastAccess > newestAccess) {
          newestAccess = entry.lastAccess;
        }
      }
      
      totalMemoryCalculated += tierMemoryUsage;
      
      tiers[resolution] = {
        size: tier.cache.size,
        maxSize: tier.maxEntries,
        fillRate: tier.maxEntries > 0 ? (tier.cache.size / tier.maxEntries) * 100 : 0,
        memoryUsage: tierMemoryUsage,
        oldestAccess,
        newestAccess
      };
    }
    
    return {
      totalSize: this.size(),
      totalMemoryUsage: this.totalMemoryUsage,
      maxMemoryUsage: this.maxMemoryUsage,
      memoryFillRate: (this.totalMemoryUsage / this.maxMemoryUsage) * 100,
      tiers
    };
  }

  /**
   * Get memory usage in human readable format
   */
  getMemoryUsageString(): string {
    const usageMB = this.totalMemoryUsage / (1024 * 1024);
    const maxMB = this.maxMemoryUsage / (1024 * 1024);
    return `${usageMB.toFixed(1)}MB / ${maxMB.toFixed(1)}MB (${((usageMB / maxMB) * 100).toFixed(1)}%)`;
  }
}