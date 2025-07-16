import type { ChunkData, ChunkUpdateEntry } from "@minecraft-bedrock-minimap/shared";

/**
 * Batches chunk updates to reduce network traffic
 * Deduplicates updates for the same chunk keeping only the latest
 */
export class ChunkUpdateBatcher {
  private updates = new Map<string, ChunkUpdateEntry>();
  private updateOrder: string[] = [];

  /**
   * Add a chunk update to the batch
   * If an update for this chunk already exists, it will be replaced with the newer one
   * @param chunkKey Unique identifier for the chunk (e.g., "0,0" or "0:0:0")
   * @param chunk The chunk data
   * @param updateType Whether this is a full chunk update or delta
   */
  addUpdate(chunkKey: string, chunk: ChunkData, updateType: 'full' | 'delta' = 'full'): void {
    // If update exists, keep the latest
    if (this.updates.has(chunkKey)) {
      // Remove from order to re-add at end
      this.updateOrder = this.updateOrder.filter(k => k !== chunkKey);
    }
    
    this.updates.set(chunkKey, {
      chunk,
      timestamp: Date.now(),
      updateType
    });
    this.updateOrder.push(chunkKey);
  }

  /**
   * Get a batch of updates up to the specified size
   * Removes the returned updates from the queue
   * @param maxSize Maximum number of updates to return (default: 50)
   * @returns Array of chunk updates
   */
  getBatch(maxSize: number = 50): ChunkUpdateEntry[] {
    const batchKeys = this.updateOrder.slice(0, maxSize);
    const batch = batchKeys.map(key => this.updates.get(key)!).filter(Boolean);
    
    // Remove batched items
    batchKeys.forEach(key => this.updates.delete(key));
    this.updateOrder = this.updateOrder.slice(maxSize);
    
    return batch;
  }

  /**
   * Get all pending updates without removing them
   * @returns Array of all pending chunk updates
   */
  getAllPending(): ChunkUpdateEntry[] {
    return this.updateOrder.map(key => this.updates.get(key)!).filter(Boolean);
  }

  /**
   * Get the number of pending updates
   * @returns Number of updates in the queue
   */
  getPendingCount(): number {
    return this.updates.size;
  }

  /**
   * Check if a specific chunk has pending updates
   * @param chunkKey The chunk identifier
   * @returns True if chunk has pending updates
   */
  hasPendingUpdate(chunkKey: string): boolean {
    return this.updates.has(chunkKey);
  }

  /**
   * Clear all pending updates
   */
  clear(): void {
    this.updates.clear();
    this.updateOrder = [];
  }

  /**
   * Remove a specific chunk from pending updates
   * @param chunkKey The chunk identifier to remove
   */
  removeUpdate(chunkKey: string): void {
    if (this.updates.has(chunkKey)) {
      this.updates.delete(chunkKey);
      this.updateOrder = this.updateOrder.filter(k => k !== chunkKey);
    }
  }
}