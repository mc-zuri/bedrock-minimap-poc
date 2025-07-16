/**
 * Chunk rendering utilities
 */

import { getBlockColor, isColorArrayChunk, getOreHighlightColor } from "@minecraft-bedrock-minimap/shared";
import type { ChunkResponse, ChunkData, LegacyChunkData, ChunkOreData, OreDetectionConfig, OreType } from "@minecraft-bedrock-minimap/shared";

/**
 * Chunk rendering class with ImageBitmap support
 */
export class ChunkRenderer {
  private bitmapCache = new Map<string, ImageBitmap>();
  private pendingBitmaps = new Map<string, Promise<ImageBitmap>>();
  private maxCacheSize = 100000;

  /**
   * Render a chunk to a canvas and return the canvas
   */
  renderChunk(chunk: ChunkData | ChunkResponse, blockSize: number): HTMLCanvasElement {
    const canvas = createChunkCanvas(chunk, blockSize);
    if (!canvas) {
      // Return empty canvas for null chunks
      const emptyCanvas = document.createElement('canvas');
      emptyCanvas.width = 16 * blockSize;
      emptyCanvas.height = 16 * blockSize;
      return emptyCanvas;
    }
    return canvas;
  }

  /**
   * Create an ImageBitmap for a chunk (async, GPU-accelerated)
   */
  async createChunkBitmap(
    chunk: ChunkData | ChunkResponse, 
    blockSize: number,
    chunkKey: string
  ): Promise<ImageBitmap | null> {
    // Check if already cached
    const cached = this.bitmapCache.get(chunkKey);
    if (cached) {
      return cached;
    }

    // Check if already being created
    const pending = this.pendingBitmaps.get(chunkKey);
    if (pending) {
      return pending;
    }

    // Create new bitmap
    const promise = this.createBitmapInternal(chunk, blockSize);
    this.pendingBitmaps.set(chunkKey, promise);

    try {
      const bitmap = await promise;
      
      if (bitmap) {
        // Cache management
        this.ensureCacheSize();
        this.bitmapCache.set(chunkKey, bitmap);
      }
      
      this.pendingBitmaps.delete(chunkKey);
      return bitmap;
    } catch (error) {
      this.pendingBitmaps.delete(chunkKey);
      console.error('Failed to create chunk bitmap:', error);
      return null;
    }
  }

  private async createBitmapInternal(
    chunk: ChunkData | ChunkResponse, 
    blockSize: number
  ): Promise<ImageBitmap | null> {
    const canvas = createChunkCanvas(chunk, blockSize);
    if (!canvas) {
      return null;
    }

    try {
      return await createImageBitmap(canvas, {
        imageOrientation: 'none',
        premultiplyAlpha: 'none'
      });
    } catch (error) {
      console.error('ImageBitmap creation failed:', error);
      return null;
    }
  }

  /**
   * Get cached bitmap or null if not available
   */
  getCachedBitmap(chunkKey: string): ImageBitmap | null {
    return this.bitmapCache.get(chunkKey) || null;
  }

  /**
   * Check if bitmap is being created
   */
  isBitmapPending(chunkKey: string): boolean {
    return this.pendingBitmaps.has(chunkKey);
  }

  /**
   * Invalidate cached bitmap for a chunk
   */
  invalidateBitmap(chunkKey: string): void {
    const bitmap = this.bitmapCache.get(chunkKey);
    if (bitmap) {
      bitmap.close(); // Free GPU memory
      this.bitmapCache.delete(chunkKey);
    }
    
    // Cancel pending creation if any
    this.pendingBitmaps.delete(chunkKey);
  }

  /**
   * Clear all cached bitmaps
   */
  clearBitmapCache(): void {
    for (const bitmap of this.bitmapCache.values()) {
      bitmap.close();
    }
    this.bitmapCache.clear();
    this.pendingBitmaps.clear();
  }

  /**
   * Ensure cache doesn't exceed size limit
   */
  private ensureCacheSize(): void {
    if (this.bitmapCache.size >= this.maxCacheSize) {
      // Remove oldest entries (simple FIFO)
      const keysToRemove = Array.from(this.bitmapCache.keys())
        .slice(0, Math.floor(this.maxCacheSize * 0.2));
      
      for (const key of keysToRemove) {
        this.invalidateBitmap(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cachedBitmaps: number;
    pendingBitmaps: number;
    maxCacheSize: number;
  } {
    return {
      cachedBitmaps: this.bitmapCache.size,
      pendingBitmaps: this.pendingBitmaps.size,
      maxCacheSize: this.maxCacheSize
    };
  }

  /**
   * Set maximum cache size
   */
  setMaxCacheSize(size: number): void {
    this.maxCacheSize = size;
    this.ensureCacheSize();
  }
}

/**
 * Render a chunk to a canvas context
 * @param ctx Canvas 2D rendering context
 * @param chunk Chunk data to render
 * @param blockSize Size of each block in pixels
 */
export function renderChunk(
  ctx: CanvasRenderingContext2D,
  chunk: ChunkData | ChunkResponse,
  blockSize: number
): void {
  // CRITICAL: Disable image smoothing for pixel-perfect rendering
  ctx.imageSmoothingEnabled = false;
  
  // Check if this is the color array format
  if (isColorArrayChunk(chunk)) {
    renderChunkFromColors(ctx, chunk, blockSize);
    return;
  }
  
  // Handle ChunkResponse format - fill with error color for now
  // since legacy format was removed
  ctx.fillStyle = '#444444';
  ctx.fillRect(0, 0, 16 * blockSize, 16 * blockSize);
}

/**
 * Render a chunk from color array format
 * @param ctx Canvas 2D rendering context
 * @param chunk Chunk data in color array format
 * @param blockSize Size of each block in pixels
 */
export function renderChunkFromColors(
  ctx: CanvasRenderingContext2D,
  chunk: ChunkData,
  blockSize: number
): void {
  // CRITICAL: Disable image smoothing for pixel-perfect rendering
  ctx.imageSmoothingEnabled = false;
  
  // PATTERN: Clear the chunk area first
  ctx.clearRect(0, 0, 16 * blockSize, 16 * blockSize);
  
  // OPTIMIZATION: Batch by color to reduce fillStyle changes
  const colorBatches = new Map<string, Array<{x: number, z: number}>>();
  
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      const color = chunk.colors[x]?.[z];
      if (color && color !== '#000000') {
        if (!colorBatches.has(color)) {
          colorBatches.set(color, []);
        }
        colorBatches.get(color)!.push({x, z});
      }
    }
  }
  
  // PATTERN: Render all blocks of same color together
  colorBatches.forEach((positions, color) => {
    ctx.fillStyle = color;
    positions.forEach(({x, z}) => {
      ctx.fillRect(x * blockSize, z * blockSize, blockSize, blockSize);
    });
  });
}

/**
 * Create a cached chunk canvas
 * @param chunk Chunk data to render
 * @param blockSize Size of each block in pixels
 * @returns Off-screen canvas with rendered chunk, or null if chunk is empty
 */
export function createChunkCanvas(
  chunk: ChunkData | ChunkResponse,
  blockSize: number
): HTMLCanvasElement | null {
  // Check if this is the new color array format
  if (isColorArrayChunk(chunk)) {
    // Check if chunk has any non-black colors
    let hasContent = false;
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        if (chunk.colors[x]?.[z] && chunk.colors[x][z] !== '#000000') {
          hasContent = true;
          break;
        }
      }
      if (hasContent) break;
    }
    
    if (!hasContent) {
      return null;
    }
  } else {
    // Handle old format
    const oldChunk = chunk as ChunkResponse;
    
    // Check if chunk has valid data
    if (!oldChunk.success || !oldChunk.data) {
      return null;
    }
    
    // Parse chunk data to check if it's empty
    let chunkData: LegacyChunkData;
    try {
      chunkData = JSON.parse(oldChunk.data);
    } catch (error) {
      return null;
    }
    
    // Don't create canvas for empty chunks
    if (!chunkData.blocks || chunkData.blocks.length === 0) {
      return null;
    }
  }
  
  // Create off-screen canvas
  const canvas = document.createElement('canvas');
  canvas.width = 16 * blockSize;
  canvas.height = 16 * blockSize;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  
  // Render the chunk
  renderChunk(ctx, chunk, blockSize);
  
  return canvas;
}

/**
 * Render chunk ores with highlighting (for ore detection mode)
 * @param ctx Canvas 2D rendering context
 * @param chunkOreData Chunk ore data to render
 * @param blockSize Size of each block in pixels
 * @param config Ore detection configuration
 * @param playerY Optional player Y position for filtering
 */
export function renderChunkOres(
  ctx: CanvasRenderingContext2D,
  chunkOreData: ChunkOreData,
  blockSize: number,
  config: OreDetectionConfig,
  playerY?: number
): void {
  // CRITICAL: Disable image smoothing for crisp ore markers
  ctx.imageSmoothingEnabled = false;
  
  // Clear the chunk area first
  ctx.clearRect(0, 0, 16 * blockSize, 16 * blockSize);
  
  // PATTERN: Render dimmed surface first for context
  if (chunkOreData.surfaceColors) {
    renderDimmedSurface(ctx, chunkOreData.surfaceColors, blockSize, config.backgroundDimming);
  }
  
  // Calculate scan range based on player Y and offsets
  const scanMinY = playerY !== undefined && config.yLevelOffsets 
    ? Math.max(-64, Math.floor(playerY + config.yLevelOffsets.minY))
    : -64;
  const scanMaxY = playerY !== undefined && config.yLevelOffsets
    ? Math.min(320, Math.ceil(playerY + config.yLevelOffsets.maxY))
    : 320;
  
  // Debug logging for Y offset issues
  if (chunkOreData.chunkX === 16 && chunkOreData.chunkZ === 0) {
    console.log(`🔍 Ore Y-scan debug for chunk 16,0:`);
    console.log(`   Player Y: ${playerY}`);
    console.log(`   Y offsets: min=${config.yLevelOffsets?.minY}, max=${config.yLevelOffsets?.maxY}`);
    console.log(`   Scan range: Y${scanMinY} to Y${scanMaxY}`);
    console.log(`   Ores in chunk: ${chunkOreData.ores.length}`);
  }
  
  // OPTIMIZATION: Batch ore rendering by type/color
  const oresByType = new Map<OreType, Array<{x: number, z: number}>>();
  chunkOreData.ores.forEach(ore => {
    // Filter by Y-level first
    if (ore.y >= scanMinY && ore.y <= scanMaxY && 
        config.highlightedOres.includes(ore.oreType)) {
      // Convert world coordinates to local chunk coordinates (handle negative correctly)
      const localX = ((ore.x % 16) + 16) % 16;
      const localZ = ((ore.z % 16) + 16) % 16;
      
      if (!oresByType.has(ore.oreType)) {
        oresByType.set(ore.oreType, []);
      }
      oresByType.get(ore.oreType)!.push({x: localX, z: localZ});
    }
  });
  
  // PATTERN: Render all ores of same type together
  oresByType.forEach((ores, oreType) => {
    const color = getOreHighlightColor(oreType);
    
    ores.forEach(({x, z}) => {
      // PATTERN: Different highlight styles
      switch (config.highlightStyle) {
        case 'bright':
          ctx.fillStyle = color;
          ctx.fillRect(x * blockSize, z * blockSize, blockSize, blockSize);
          break;
        case 'glow':
          renderGlowEffect(ctx, x * blockSize, z * blockSize, blockSize, color);
          break;
        case 'outline':
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(x * blockSize, z * blockSize, blockSize, blockSize);
          break;
      }
    });
  });
}

/**
 * Render dimmed surface colors for context in ore detection mode
 * @param ctx Canvas 2D rendering context
 * @param surfaceColors 16x16 array of surface colors
 * @param blockSize Size of each block in pixels
 * @param dimmingFactor Factor to dim the colors (0-1)
 */
export function renderDimmedSurface(
  ctx: CanvasRenderingContext2D,
  surfaceColors: string[][],
  blockSize: number,
  dimmingFactor: number
): void {
  // OPTIMIZATION: Batch by color to reduce fillStyle changes
  const colorBatches = new Map<string, Array<{x: number, z: number}>>();
  
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      const originalColor = surfaceColors[x]?.[z];
      if (originalColor && originalColor !== '#000000') {
        const dimmedColor = dimColor(originalColor, dimmingFactor);
        if (!colorBatches.has(dimmedColor)) {
          colorBatches.set(dimmedColor, []);
        }
        colorBatches.get(dimmedColor)!.push({x, z});
      }
    }
  }
  
  // Render all blocks of same dimmed color together
  colorBatches.forEach((positions, color) => {
    ctx.fillStyle = color;
    positions.forEach(({x, z}) => {
      ctx.fillRect(x * blockSize, z * blockSize, blockSize, blockSize);
    });
  });
}

/**
 * Render glow effect for ore highlighting
 * @param ctx Canvas 2D rendering context
 * @param x X position in pixels
 * @param z Z position in pixels
 * @param blockSize Size of the block in pixels
 * @param color Glow color
 */
function renderGlowEffect(
  ctx: CanvasRenderingContext2D,
  x: number,
  z: number,
  blockSize: number,
  color: string
): void {
  const centerX = x + blockSize / 2;
  const centerZ = z + blockSize / 2;
  const radius = blockSize / 2;
  
  // Create radial gradient for glow effect
  const gradient = ctx.createRadialGradient(centerX, centerZ, 0, centerX, centerZ, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.7, color + '80'); // Semi-transparent
  gradient.addColorStop(1, color + '00'); // Fully transparent
  
  ctx.fillStyle = gradient;
  ctx.fillRect(x, z, blockSize, blockSize);
}

/**
 * Dim a color by a given factor
 * @param hexColor Hex color string
 * @param factor Dimming factor (0-1, where 0 = black, 1 = original)
 * @returns Dimmed hex color
 */
function dimColor(hexColor: string, factor: number): string {
  // Handle both #RRGGBB and #RRGGBBAA formats
  const hasAlpha = hexColor.length === 9;
  
  // Convert hex to RGB
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const a = hasAlpha ? hexColor.slice(7, 9) : '';
  
  // Apply dimming factor
  const newR = Math.max(0, Math.min(255, Math.round(r * factor)));
  const newG = Math.max(0, Math.min(255, Math.round(g * factor)));
  const newB = Math.max(0, Math.min(255, Math.round(b * factor)));
  
  // Convert back to hex
  const hex = `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}${a}`;
  return hex;
}

/**
 * Create a chunk canvas for ore detection mode
 * @param chunkOreData Chunk ore data to render
 * @param blockSize Size of each block in pixels
 * @param config Ore detection configuration
 * @returns Off-screen canvas with rendered ore highlights
 */
export function createOreChunkCanvas(
  chunkOreData: ChunkOreData,
  blockSize: number,
  config: OreDetectionConfig,
  playerY?: number
): HTMLCanvasElement | null {
  // Calculate scan range based on player Y and offsets
  const scanMinY = playerY !== undefined && config.yLevelOffsets 
    ? Math.max(-64, Math.floor(playerY + config.yLevelOffsets.minY))
    : -64;
  const scanMaxY = playerY !== undefined && config.yLevelOffsets
    ? Math.min(320, Math.ceil(playerY + config.yLevelOffsets.maxY))
    : 320;
    
  // Check if chunk has any ores to display within Y-range
  const hasVisibleOres = chunkOreData.ores.some(ore => 
    ore.y >= scanMinY && ore.y <= scanMaxY &&
    config.highlightedOres.includes(ore.oreType)
  );
  
  if (!hasVisibleOres && !chunkOreData.surfaceColors) {
    return null;
  }
  
  // Create off-screen canvas
  const canvas = document.createElement('canvas');
  canvas.width = 16 * blockSize;
  canvas.height = 16 * blockSize;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  
  // Render the ore highlights
  renderChunkOres(ctx, chunkOreData, blockSize, config, playerY);
  
  return canvas;
}

/**
 * Render a chunk grid overlay (for debugging)
 * @param ctx Canvas 2D rendering context
 * @param screenX Screen X position of chunk
 * @param screenZ Screen Z position of chunk
 * @param size Size of the chunk in pixels
 */
export function renderChunkGrid(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenZ: number,
  size: number
): void {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(screenX, screenZ, size, size);
}

/**
 * Get cache resolution based on block size
 * Lower resolution for smaller block sizes to save memory
 */
export function getCacheResolution(blockSize: number): number {
  if (blockSize <= 4) return 64;   // Very zoomed out
  if (blockSize <= 8) return 128;  // Zoomed out
  return 256;                      // Normal/zoomed in
}

/**
 * Calculate chunk size for rendering
 */
export function getChunkSize(blockSize: number): number {
  return 16 * blockSize;
}