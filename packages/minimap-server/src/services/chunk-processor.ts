import type { ChunkResponse, ChunkData as ProcessedChunkData, ChunkOreData, OreLocation } from "@minecraft-bedrock-minimap/shared";
import {
  getBlockColorWithFallback,
  isOreBlock,
  getOreType
} from "@minecraft-bedrock-minimap/shared";
import PrismarineRegistry, { type RegistryBedrock } from 'prismarine-registry';
import PrismarineChunk, { type BedrockChunk } from 'prismarine-chunk';

interface ChunkColorData {
  chunkX: number;
  chunkZ: number;
  colors: string[][];
  heights?: number[][];
}

export interface ProcessedChunkWithOres {
  chunkData: ChunkColorData | null;
  oreData: ChunkOreData | null;
}

export class ChunkProcessor {
  private registry: RegistryBedrock;
  private ChunkColumn: typeof BedrockChunk;
  private chunkColorCache: Map<string, ChunkColorData>;
  private processedChunkCache: Map<string, ProcessedChunkWithOres>;

  constructor() {
    this.registry = PrismarineRegistry(`bedrock_1.21.93`) as any;
    this.ChunkColumn = (PrismarineChunk as any)(this.registry as any) as typeof BedrockChunk;
    this.chunkColorCache = new Map();
    this.processedChunkCache = new Map();
  }

  /**
   * Process a chunk completely - returns both chunk colors and ore data in one pass
   */
  processChunkComplete(chunk: ChunkResponse): ProcessedChunkWithOres {
    if (!chunk.success || !chunk.data) {
      return { chunkData: null, oreData: null };
    }

    const cacheKey = `${chunk.chunkX},${chunk.chunkZ}`;

    // Check cache first
    const cached = this.processedChunkCache.get(cacheKey);
    if (cached && cached.chunkData) {
      // For cached chunks, just update ore data with current player Y
      if (cached.oreData) {
        return {
          chunkData: cached.chunkData,
          oreData: this.processChunkForOres(chunk)
        };
      }
      return cached;
    }

    // Initialize arrays
    const colors: string[][] = Array(16).fill(null).map(() => Array(16).fill('#000000'));
    const heights: number[][] = Array(16).fill(null).map(() => Array(16).fill(-64));
    const ores: OreLocation[] = [];

    try {
      const chunkJson = this.ChunkColumn.fromJson(chunk.data) as unknown as BedrockChunk;
      const sections = (chunkJson as any).sections;

      if (!sections || sections.length === 0) {
        return { chunkData: null, oreData: null };
      }

      // Single pass through all blocks
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          let foundSurface = false;

          // Sort sections by Y coordinate (descending) to find surface
          const sortedSections = [...sections].filter(s => s).sort((a, b) => b.y - a.y);

          for (const subchunk of sortedSections) {
            if (!subchunk) continue;


            // Process blocks in this subchunk
            for (let y = 15; y >= 0; y--) {
              try {
                const blockY = subchunk.y * 16 + y;
                const stateId = subchunk.getBlockStateId(0, x, y, z);
                const state = this.registry.blocksByStateId[stateId];

                if (state && state.name && state.name !== 'air' && !state.name.includes('void_air')) {
                  // Surface detection
                  if (!foundSurface) {
                    const baseColor = this.getBlockColor(state.name);
                    heights[x][z] = blockY;
                    colors[x][z] = this.applyHeightShading(baseColor, blockY);
                    foundSurface = true;
                  }

                  // Ore detection (only in scan range)
                  if (isOreBlock(state.name)) {
                    const oreType = getOreType(state.name);
                    if (oreType) {
                      ores.push({
                        x: chunk.chunkX * 16 + x,
                        z: chunk.chunkZ * 16 + z,
                        y: blockY,
                        oreType,
                        chunkX: chunk.chunkX,
                        chunkZ: chunk.chunkZ
                      });
                    }
                  }
                }
              } catch (err) {
                continue;
              }
            }
          }
        }
      }

      const processedData: ChunkColorData = {
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        colors,
        heights
      };

      // Check if chunk is empty
      if (this.isChunkEmpty(processedData)) {
        return { chunkData: null, oreData: null };
      }

      const oreData: ChunkOreData = {
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        dimension: 0, // TODO: Get actual dimension
        ores,
        surfaceColors: colors
      };

      const result = { chunkData: processedData, oreData };

      // Cache the result
      this.processedChunkCache.set(cacheKey, result);
      this.chunkColorCache.set(cacheKey, processedData);

      return result;
    } catch (error) {
      console.error(`Error processing chunk ${chunk.chunkX},${chunk.chunkZ}:`, error);
      return { chunkData: null, oreData: null };
    }
  }

  /**
   * Process a chunk response and convert it to color array format
   * (Legacy method - kept for compatibility)
   */
  processChunk(chunk: ChunkResponse): ChunkColorData | null {
    if (!chunk.success || !chunk.data) {
      return null;
    }

    const cacheKey = `${chunk.chunkX},${chunk.chunkZ}`;

    // Check cache first
    const cached = this.chunkColorCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Initialize 16x16 arrays
    const colors: string[][] = Array(16)
      .fill(null)
      .map(() => Array(16).fill('#000000'));
    const heights: number[][] = Array(16)
      .fill(null)
      .map(() => Array(16).fill(-64));

    try {
      const chunkJson = this.ChunkColumn.fromJson(chunk.data) as unknown as BedrockChunk;
      // Find the highest non-air block for each x,z position
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          let foundBlock = false;

          // Iterate through subchunks from top to bottom
          const sections = (chunkJson as any).sections;
          if (!sections || sections.length === 0) continue;

          // Sort sections by Y coordinate (descending) to search from top
          const sortedSections = [...sections].filter(s => s).sort((a, b) => b.y - a.y);

          for (const subchunk of sortedSections) {
            if (!subchunk || foundBlock) continue;

            // Search from top of subchunk to bottom
            for (let y = 15; y >= 0; y--) {
              try {
                const blockY = subchunk.y * 16 + y;
                const stateId = subchunk.getBlockStateId(0, x, y, z);
                const state = this.registry.blocksByStateId[stateId];

                if (state && state.name && state.name !== 'air' && !state.name.includes('void_air')) {
                  const baseColor = this.getBlockColor(state.name);
                  heights[x][z] = blockY;

                  // Apply simple height-based shading 
                  colors[x][z] = this.applyHeightShading(baseColor, blockY);
                  foundBlock = true;
                  break; // Found the highest non-air block
                }
              } catch (err) {
                // Skip invalid blocks
                continue;
              }
            }
          }
        }
      }

      const processedData: ChunkColorData = {
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        colors,
        heights
      };

      // Check if chunk is entirely black/empty - don't cache or return it
      if (this.isChunkEmpty(processedData)) {
        //console.log(`🚫 Filtered out empty chunk at ${chunk.chunkX},${chunk.chunkZ}`);
        return null;
      }

      // Cache the processed data
      this.chunkColorCache.set(cacheKey, processedData);

      return processedData;
    } catch (error) {
      console.error(`Error processing chunk ${chunk.chunkX},${chunk.chunkZ}:`, error);
      return null;
    }
  }

  /**
   * Process a chunk specifically for ore detection - scans Y-range based on player position and offsets
   */
  processChunkForOres(chunk: ChunkResponse): ChunkOreData | null {
    if (!chunk.success || !chunk.data) {
      return null;
    }

    const ores: OreLocation[] = [];
    const surfaceColors: string[][] = Array(16)
      .fill(null)
      .map(() => Array(16).fill('#000000'));

    try {
      const chunkJson = this.ChunkColumn.fromJson(chunk.data) as unknown as BedrockChunk;

      // First pass: Find surface colors for context using subchunk iteration
      const sections = (chunkJson as any).sections;
      if (sections && sections.length > 0) {
        for (let x = 0; x < 16; x++) {
          for (let z = 0; z < 16; z++) {
            let foundBlock = false;

            // Sort sections by Y coordinate (descending) to search from top
            const sortedSections = [...sections].filter(s => s).sort((a, b) => b.y - a.y);

            for (const subchunk of sortedSections) {
              if (!subchunk || foundBlock) continue;

              // Search from top of subchunk to bottom
              for (let y = 15; y >= 0; y--) {
                try {
                  const blockY = subchunk.y * 16 + y;
                  const stateId = subchunk.getBlockStateId(0, x, y, z);
                  const state = this.registry.blocksByStateId[stateId];

                  if (state && state.name && state.name !== 'air' && !state.name.includes('void_air')) {
                    const baseColor = this.getBlockColor(state.name);
                    surfaceColors[x][z] = this.applyHeightShading(baseColor, blockY);
                    foundBlock = true;
                    break;
                  }
                } catch (err) {
                  continue;
                }
              }
            }
          }
        }
      }



      // Iterate through subchunks for better performance
      for (const subchunk of (chunkJson as any).sections) {
        if (!subchunk) continue;

        // Calculate subchunk Y range
        const subchunkMinY = subchunk.y * 16;

        // Scan blocks in this subchunk
        for (let x = 0; x < 16; x++) {
          for (let z = 0; z < 16; z++) {
            for (let y = 0; y < 16; y++) {
              try {
                const blockY = subchunkMinY + y; // Convert to absolute Y
                const stateId = subchunk.getBlockStateId(0, x, y, z);
                const state = this.registry.blocksByStateId[stateId];

                if (state && state.name && isOreBlock(state.name)) {
                  const oreType = getOreType(state.name);
                  if (oreType) {
                    ores.push({
                      x: chunk.chunkX * 16 + x,
                      z: chunk.chunkZ * 16 + z,
                      y: blockY,
                      oreType,
                      chunkX: chunk.chunkX,
                      chunkZ: chunk.chunkZ
                    });
                  }
                }
              } catch (err) {
                continue; // Skip invalid blocks
              }
            }
          }
        }
      }




      return {
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        dimension: 0, // Default to overworld, TODO: get from chunk data
        ores,
        surfaceColors
      };
    } catch (error) {
      console.error(`Error processing chunk for ores ${chunk.chunkX},${chunk.chunkZ}:`, error);
      return null;
    }
  }

  /**
   * Process multiple chunks in batch
   */
  processChunks(chunks: ChunkResponse[]): ChunkColorData[] {
    const results: ChunkColorData[] = [];

    for (const chunk of chunks) {
      const processed = this.processChunk(chunk);
      if (processed) {
        results.push(processed);
      }
    }

    return results;
  }

  /**
   * Process multiple chunks for ore detection in batch
   */
  processChunksForOres(chunks: ChunkResponse[]): ChunkOreData[] {
    const results: ChunkOreData[] = [];

    for (const chunk of chunks) {
      const processed = this.processChunkForOres(chunk);
      if (processed) {
        results.push(processed);
      }
    }

    return results;
  }

  /**
   * Get block color with fallback
   */
  private getBlockColor(blockName: string): string {
    // Remove minecraft: prefix if present
    const cleanName = blockName.replace('minecraft:', '');

    // Use the shared utility function for consistent colors
    return getBlockColorWithFallback(cleanName);
  }

  /**
   * Apply simple height-based shading
   */
  private applyHeightShading(color: string, y: number): string {
    // Normalize height from -64 to 320 range to 0-1
    const normalizedHeight = (y + 64) / 384;

    // Apply subtle shading based on absolute height
    // Higher = brighter, lower = darker
    const shadeFactor = 0.7 + (normalizedHeight * 0.6); // Range: 0.7 to 1.3

    return this.adjustColorBrightness(color, shadeFactor);
  }

  /**
   * Check if a chunk is entirely black/empty
   */
  private isChunkEmpty(chunkData: ChunkColorData): boolean {
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        const color = chunkData.colors[x][z];
        const height = chunkData.heights?.[x][z] ?? -64;

        // If any block has a non-black color or is above void level, chunk is not empty
        if (color !== '#000000' && color !== '#000000ff' && height > -64) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Adjust color brightness
   */
  private adjustColorBrightness(hexColor: string, factor: number): string {
    // Handle both #RRGGBB and #RRGGBBAA formats
    const hasAlpha = hexColor.length === 9;

    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const a = hasAlpha ? hexColor.slice(7, 9) : '';

    // Apply brightness factor
    const newR = Math.max(0, Math.min(255, Math.round(r * factor)));
    const newG = Math.max(0, Math.min(255, Math.round(g * factor)));
    const newB = Math.max(0, Math.min(255, Math.round(b * factor)));

    // Convert back to hex
    const hex = `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}${a}`;
    return hex;
  }

  /**
   * Invalidate cached chunks
   */
  invalidateChunks(chunks: Array<{ x: number, z: number }>): void {
    for (const chunk of chunks) {
      const cacheKey = `${chunk.x},${chunk.z}`;
      this.chunkColorCache.delete(cacheKey);
      this.processedChunkCache.delete(cacheKey);
    }
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.chunkColorCache.clear();
    this.processedChunkCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number } {
    return {
      size: this.chunkColorCache.size
    };
  }
}