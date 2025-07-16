/**
 * ChunkViewportManager - Tracks visible chunks and manages viewport-based chunk lifecycle
 */

import type { PlayerPosition } from "@minecraft-bedrock-minimap/shared";
import type { ViewportBounds } from "./ViewportTracker.js";

export interface Vector2 {
  x: number;
  z: number;
}

interface ChunkPriority {
  key: string;
  chunkX: number;
  chunkZ: number;
  priority: number;
}

export class ChunkViewportManager {
  private loadedChunks: Set<string>;
  private pendingChunks: Set<string>;
  private lastPlayerPosition: PlayerPosition | null = null;
  private playerVelocity: Vector2 = { x: 0, z: 0 };
  private velocityUpdateInterval: number | null = null;
  private lastUpdateTime: number = 0;

  constructor(
    loadedChunks: Set<string>,
    pendingChunks: Set<string>
  ) {
    this.loadedChunks = loadedChunks;
    this.pendingChunks = pendingChunks;
  }

  updateViewport(
    bounds: ViewportBounds,
    playerPos: PlayerPosition,
    forceRefresh: boolean = false
  ): void {
    // Update velocity tracking
    this.updateVelocity(playerPos);

    // Get visible chunks
    const visibleChunks = this.getVisibleChunks(bounds);
    // console.log(`👁️ Viewport bounds: ${bounds.minChunkX},${bounds.minChunkZ} to ${bounds.maxChunkX},${bounds.maxChunkZ} = ${visibleChunks.length} chunks`);
    
    // Get predicted chunks based on movement
    const predictedChunks = this.getPredictedChunks(bounds, this.playerVelocity);
    
    // Combine and prioritize chunks
    const allChunks = new Set([...visibleChunks, ...predictedChunks]);
    const prioritizedChunks = this.prioritizeChunks(
      Array.from(allChunks),
      playerPos
    );

    // Track which chunks are needed for the viewport
    const neededChunks = prioritizedChunks.filter(chunk => {
      const isNeeded = !this.loadedChunks.has(chunk.key) && 
                      !this.pendingChunks.has(chunk.key);
      return forceRefresh || isNeeded;
    });

    // Return the chunks that need to be loaded (for external handling)
    this.neededChunks = neededChunks;

    // Clean up distant chunks
    this.evictDistantChunks(bounds, playerPos);
  }

  private updateVelocity(playerPos: PlayerPosition): void {
    const now = Date.now();
    
    if (this.lastPlayerPosition) {
      const deltaTime = (now - this.lastUpdateTime) / 1000; // Convert to seconds
      
      if (deltaTime > 0) {
        // Calculate velocity in blocks per second
        this.playerVelocity = {
          x: (playerPos.x - this.lastPlayerPosition.x) / deltaTime,
          z: (playerPos.z - this.lastPlayerPosition.z) / deltaTime
        };
      }
    }

    this.lastPlayerPosition = { ...playerPos };
    this.lastUpdateTime = now;
  }

  private getVisibleChunks(bounds: ViewportBounds): string[] {
    const chunks: string[] = [];

    for (let x = bounds.minChunkX; x <= bounds.maxChunkX; x++) {
      for (let z = bounds.minChunkZ; z <= bounds.maxChunkZ; z++) {
        chunks.push(`${x},${z}`);
      }
    }

    return chunks;
  }

  private getPredictedChunks(bounds: ViewportBounds, velocity: Vector2): string[] {
    // Don't predict if not moving much
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    if (speed < 2) { // Less than 2 blocks/second
      return [];
    }

    const predictedChunks: string[] = [];
    
    // Predict 1-2 seconds ahead based on speed
    const predictTime = Math.min(2, Math.max(1, speed / 10));
    const predictedX = bounds.centerWorldX + (velocity.x * predictTime);
    const predictedZ = bounds.centerWorldZ + (velocity.z * predictTime);

    // Calculate predicted viewport bounds
    const halfWidthBlocks = bounds.screenWidth / bounds.zoom / 2;
    const halfHeightBlocks = bounds.screenHeight / bounds.zoom / 2;

    const predictedMinChunkX = Math.floor((predictedX - halfWidthBlocks) / 16) - 1;
    const predictedMaxChunkX = Math.ceil((predictedX + halfWidthBlocks) / 16) + 1;
    const predictedMinChunkZ = Math.floor((predictedZ - halfHeightBlocks) / 16) - 1;
    const predictedMaxChunkZ = Math.ceil((predictedZ + halfHeightBlocks) / 16) + 1;

    // Only add chunks in the direction of movement
    for (let x = predictedMinChunkX; x <= predictedMaxChunkX; x++) {
      for (let z = predictedMinChunkZ; z <= predictedMaxChunkZ; z++) {
        const key = `${x},${z}`;
        
        // Check if this chunk is in the direction of movement
        const chunkDirX = (x * 16 + 8) - bounds.centerWorldX;
        const chunkDirZ = (z * 16 + 8) - bounds.centerWorldZ;
        
        // Dot product to check if chunk is in movement direction
        const dot = (chunkDirX * velocity.x + chunkDirZ * velocity.z);
        
        if (dot > 0) {
          predictedChunks.push(key);
        }
      }
    }

    return predictedChunks;
  }

  private prioritizeChunks(chunkKeys: string[], playerPos: PlayerPosition): ChunkPriority[] {
    const priorities: ChunkPriority[] = chunkKeys.map(key => {
      const [x, z] = key.split(',').map(Number);
      
      // Calculate distance from player to chunk center
      const chunkCenterX = x * 16 + 8;
      const chunkCenterZ = z * 16 + 8;
      const distance = Math.sqrt(
        Math.pow(chunkCenterX - playerPos.x, 2) +
        Math.pow(chunkCenterZ - playerPos.z, 2)
      );

      // Lower distance = higher priority
      return {
        key,
        chunkX: x,
        chunkZ: z,
        priority: distance
      };
    });

    // Sort by priority (closer chunks first)
    return priorities.sort((a, b) => a.priority - b.priority);
  }

  getNeededChunks(): ChunkPriority[] {
    return this.neededChunks || [];
  }

  private neededChunks: ChunkPriority[] = [];

  private evictDistantChunks(bounds: ViewportBounds, playerPos: PlayerPosition): void {
    const maxDistance = Math.max(
      bounds.screenWidth / bounds.zoom,
      bounds.screenHeight / bounds.zoom
    ) * 3; // Keep chunks within 3x viewport distance for smoother scrolling

    const chunksToEvict: string[] = [];

    this.loadedChunks.forEach(key => {
      const [x, z] = key.split(',').map(Number);
      const chunkCenterX = x * 16 + 8;
      const chunkCenterZ = z * 16 + 8;
      
      const distance = Math.sqrt(
        Math.pow(chunkCenterX - playerPos.x, 2) +
        Math.pow(chunkCenterZ - playerPos.z, 2)
      );

      if (distance > maxDistance) {
        chunksToEvict.push(key);
      }
    });

    // Remove evicted chunks from loaded set and return them
    chunksToEvict.forEach(key => {
      this.loadedChunks.delete(key);
    });

    if (chunksToEvict.length > 0) {
      // console.log(`🗑️ Evicted ${chunksToEvict.length} distant chunks`);
    }

    return chunksToEvict;
  }

  getStats(): {
    loadedChunks: number;
    pendingChunks: number;
    velocity: Vector2;
  } {
    return {
      loadedChunks: this.loadedChunks.size,
      pendingChunks: this.pendingChunks.size,
      velocity: { ...this.playerVelocity }
    };
  }

  destroy(): void {
    if (this.velocityUpdateInterval !== null) {
      clearInterval(this.velocityUpdateInterval);
      this.velocityUpdateInterval = null;
    }
  }
}