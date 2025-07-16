import type { ChunkData, MegaTile } from '@minecraft-bedrock-minimap/shared';
import { ChunkRenderer } from './ChunkRenderer.js';

export class MegaTileRenderer {
  private megaTiles = new Map<string, MegaTile>();
  private pendingBitmaps = new Map<string, Promise<ImageBitmap>>();
  private chunkRenderer: ChunkRenderer;

  constructor() {
    this.chunkRenderer = new ChunkRenderer();
  }

  getMegaTileKey(chunkX: number, chunkZ: number, dimension: number = 0, size: number = 3): string {
    const tileX = Math.floor(chunkX / size) * size;
    const tileZ = Math.floor(chunkZ / size) * size;
    return `${dimension}:${tileX}:${tileZ}`;
  }

  getChunksForMegaTile(centerX: number, centerZ: number, size: 3 | 5 = 3): ChunkCoordinate[] {
    const halfSize = Math.floor(size / 2);
    const chunks: ChunkCoordinate[] = [];

    for (let dx = -halfSize; dx <= halfSize; dx++) {
      for (let dz = -halfSize; dz <= halfSize; dz++) {
        chunks.push({
          x: centerX + dx,
          z: centerZ + dz
        });
      }
    }

    return chunks;
  }

  async createMegaTile(
    centerX: number,
    centerZ: number,
    chunks: Map<string, ChunkData>,
    blockSize: number,
    dimension: number = 0,
    size: 3 | 5 = 3
  ): Promise<MegaTile> {
    const tileSize = size * 16 * blockSize;

    // Create off-screen canvas
    const canvas = document.createElement('canvas');
    canvas.width = tileSize;
    canvas.height = tileSize;
    const ctx = canvas.getContext('2d', { alpha: false });
    
    if (!ctx) {
      throw new Error('Failed to create canvas context');
    }

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, tileSize, tileSize);

    // Calculate tile starting position
    const halfSize = Math.floor(size / 2);
    const startX = centerX - halfSize;
    const startZ = centerZ - halfSize;

    const includedChunks = new Set<string>();

    // Render all chunks in the mega-tile
    for (let dx = 0; dx < size; dx++) {
      for (let dz = 0; dz < size; dz++) {
        const chunkX = startX + dx;
        const chunkZ = startZ + dz;
        const chunkKey = `${dimension}:${chunkX}:${chunkZ}`;
        const chunk = chunks.get(chunkKey);

        if (chunk) {
          const offsetX = dx * 16 * blockSize;
          const offsetZ = dz * 16 * blockSize;

          ctx.save();
          ctx.translate(offsetX, offsetZ);
          
          // Use the chunk renderer to draw the chunk
          const chunkCanvas = this.chunkRenderer.renderChunk(chunk, blockSize);
          ctx.drawImage(chunkCanvas, 0, 0);
          
          ctx.restore();
          
          includedChunks.add(chunkKey);
        }
      }
    }

    // Create ImageBitmap for GPU acceleration
    const bitmap = await createImageBitmap(canvas);

    const megaTile: MegaTile = {
      centerX,
      centerZ,
      dimension,
      size,
      canvas,
      bitmap,
      lastUpdate: Date.now(),
      chunks: includedChunks
    };

    // Cache the mega-tile
    const key = this.getMegaTileKey(centerX, centerZ, dimension, size);
    this.megaTiles.set(key, megaTile);

    return megaTile;
  }

  async getOrCreateMegaTile(
    chunkX: number,
    chunkZ: number,
    chunks: Map<string, ChunkData>,
    blockSize: number,
    dimension: number = 0,
    size: 3 | 5 = 3
  ): Promise<MegaTile | null> {
    const key = this.getMegaTileKey(chunkX, chunkZ, dimension, size);
    
    // Check if we already have this mega-tile
    const existing = this.megaTiles.get(key);
    if (existing && this.isMegaTileValid(existing, chunks)) {
      return existing;
    }

    // Check if we're already creating this mega-tile
    const pending = this.pendingBitmaps.get(key);
    if (pending) {
      return null; // Return null to avoid duplicate creation
    }

    // Calculate center position for the mega-tile
    const halfSize = Math.floor(size / 2);
    const tileBaseX = Math.floor(chunkX / size) * size;
    const tileBaseZ = Math.floor(chunkZ / size) * size;
    const centerX = tileBaseX + halfSize;
    const centerZ = tileBaseZ + halfSize;

    // Create the mega-tile asynchronously
    const promise = this.createMegaTile(centerX, centerZ, chunks, blockSize, dimension, size);
    this.pendingBitmaps.set(key, promise.then(tile => tile.bitmap!));

    try {
      const megaTile = await promise;
      this.pendingBitmaps.delete(key);
      return megaTile;
    } catch (error) {
      this.pendingBitmaps.delete(key);
      console.error('Failed to create mega-tile:', error);
      return null;
    }
  }

  private isMegaTileValid(megaTile: MegaTile, chunks: Map<string, ChunkData>): boolean {
    // Check if all chunks in the mega-tile are still valid
    for (const chunkKey of megaTile.chunks) {
      const chunk = chunks.get(chunkKey);
      if (!chunk) {
        return false; // Chunk is missing
      }
      // Could add more validation here (e.g., check if chunk has been updated)
    }
    return true;
  }

  invalidateOverlapping(chunkX: number, chunkZ: number, dimension: number = 0): void {
    // Invalidate any mega-tiles that contain this chunk
    const sizes: Array<3 | 5> = [3, 5];
    
    for (const size of sizes) {
      const key = this.getMegaTileKey(chunkX, chunkZ, dimension, size);
      const megaTile = this.megaTiles.get(key);
      
      if (megaTile) {
        // Dispose of the ImageBitmap to free memory
        megaTile.bitmap?.close();
        this.megaTiles.delete(key);
      }
    }
  }

  invalidateChunk(chunkKey: string): void {
    const [dimension, x, z] = chunkKey.split(':').map(Number);
    if (!isNaN(dimension) && !isNaN(x) && !isNaN(z)) {
      this.invalidateOverlapping(x, z, dimension);
    }
  }

  clear(): void {
    // Dispose of all ImageBitmaps
    for (const megaTile of this.megaTiles.values()) {
      megaTile.bitmap?.close();
    }
    this.megaTiles.clear();
    this.pendingBitmaps.clear();
  }

  getCacheSize(): number {
    return this.megaTiles.size;
  }

  getCachedMegaTiles(): Map<string, MegaTile> {
    return new Map(this.megaTiles);
  }
}

interface ChunkCoordinate {
  x: number;
  z: number;
}