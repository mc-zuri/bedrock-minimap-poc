import { type ChunkResponse, type ChunkCoordinate, type ChunkUpdateEntry, type ChunkData, chunkCoordsToKey } from "@minecraft-bedrock-minimap/shared";import type { BedrockWorld } from "../world/BedrockWorld.ts";
;

interface ChunkCacheEntry {
  data: ChunkResponse;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  isStale?: boolean;
}

export class ChunkCacheService {
  private cache = new Map<string, ChunkCacheEntry>();
  private maxSize: number;
  private world: BedrockWorld | null = null;

  constructor(maxSize: number = 1000, world?: BedrockWorld) {
    this.maxSize = maxSize;
    this.world = world || null;
  }

  /**
   * Get a chunk from the cache
   * @param chunkX Chunk X coordinate
   * @param chunkZ Chunk Z coordinate
   * @returns ChunkResponse if found, null otherwise
   */
  get(chunkX: number, chunkZ: number): ChunkResponse | null {
    const key = chunkCoordsToKey(chunkX, chunkZ);
    const entry = this.cache.get(key);

    if (entry) {
      // Update access information for LRU
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      return entry.data;
    }

    return null;
  }

  /**
   * Check if a chunk is stale
   * @param chunkX Chunk X coordinate
   * @param chunkZ Chunk Z coordinate
   * @returns True if chunk is stale, false otherwise
   */
  isStale(chunkX: number, chunkZ: number): boolean {
    const key = chunkCoordsToKey(chunkX, chunkZ);
    const entry = this.cache.get(key);
    return entry?.isStale ?? false;
  }

  /**
   * Set a chunk in the cache
   * @param chunkX Chunk X coordinate
   * @param chunkZ Chunk Z coordinate
   * @param data Chunk response data
   */
  set(chunkX: number, chunkZ: number, data: ChunkResponse): void {
    const key = chunkCoordsToKey(chunkX, chunkZ);

    // Check if we need to evict entries
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: ChunkCacheEntry = {
      data,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now()
    };

    this.cache.set(key, entry);
  }

  /**
   * Invalidate specific chunks
   * @param chunks Array of chunk coordinates to invalidate
   */
  invalidate(chunks: ChunkCoordinate[]): void {
    for (const chunk of chunks) {
      const key = chunkCoordsToKey(chunk.x, chunk.z);
      
      // Mark as stale instead of removing
      const cached = this.cache.get(key);
      if (cached) {
        cached.isStale = true;
      }

      // Still need to invalidate in BedrockWorld for consistency
      if (this.world && this.world.columns) {
        delete this.world.columns[key];
      }
    }
  }

  /**
   * Invalidate multiple chunks at once
   * @param chunks Array of chunk coordinates to invalidate
   */
  invalidateMultiple(chunks: ChunkCoordinate[]): void {
    this.invalidate(chunks); // Same as invalidate, kept for API compatibility
  }

  /**
   * Clear all cached chunks
   */
  clear(): void {
    this.cache.clear();
    
    // Also clear BedrockWorld if available
    if (this.world && this.world.columns) {
      this.world.columns = {};
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    totalAccesses: number;
  } {
    let totalAccesses = 0;
    let totalHits = 0;

    for (const entry of this.cache.values()) {
      totalAccesses += entry.accessCount;
      totalHits += entry.accessCount - 1; // First access is not a hit
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: totalAccesses > 0 ? totalHits / totalAccesses : 0,
      totalAccesses
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    // Find the least recently used entry
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    // Remove the LRU entry
    if (lruKey) {
      this.cache.delete(lruKey);
      
      // Also remove from BedrockWorld if available
      if (this.world && this.world.columns) {
        delete this.world.columns[lruKey];
      }
    }
  }

  /**
   * Get all cached chunk keys
   */
  getCachedChunkKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Check if a chunk is cached
   */
  has(chunkX: number, chunkZ: number): boolean {
    const key = chunkCoordsToKey(chunkX, chunkZ);
    return this.cache.has(key);
  }

  /**
   * Update the associated BedrockWorld instance
   */
  setWorld(world: BedrockWorld): void {
    this.world = world;
  }
}