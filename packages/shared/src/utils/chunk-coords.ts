import type { ChunkCoordinate } from "../types.js";

/**
 * Convert world coordinates to chunk coordinates
 * @param x World X coordinate
 * @param z World Z coordinate
 * @returns Chunk coordinates
 */
export function worldToChunkCoords(x: number, z: number): ChunkCoordinate {
  return {
    x: Math.floor(x / 16),
    z: Math.floor(z / 16)
  };
}

/**
 * Convert chunk coordinates to a string key for storage
 * @param chunkX Chunk X coordinate
 * @param chunkZ Chunk Z coordinate
 * @returns String key in format "x,z"
 */
export function chunkCoordsToKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

/**
 * Get all chunks that might be affected by a block update
 * This handles blocks on chunk boundaries that might affect neighboring chunks
 * @param blockX Block X coordinate
 * @param blockZ Block Z coordinate
 * @returns Array of affected chunk coordinates
 */
export function getAffectedChunks(blockX: number, blockZ: number): ChunkCoordinate[] {
  const primaryChunk = worldToChunkCoords(blockX, blockZ);
  const affectedChunks: ChunkCoordinate[] = [primaryChunk];
  
  // Check if block is on chunk boundary
  const blockXInChunk = blockX % 16;
  const blockZInChunk = blockZ % 16;
  
  // Handle negative coordinates properly
  const normalizedX = blockXInChunk < 0 ? blockXInChunk + 16 : blockXInChunk;
  const normalizedZ = blockZInChunk < 0 ? blockZInChunk + 16 : blockZInChunk;
  
  // Check boundaries and add neighboring chunks if needed
  if (normalizedX === 0) {
    affectedChunks.push({ x: primaryChunk.x - 1, z: primaryChunk.z });
  } else if (normalizedX === 15) {
    affectedChunks.push({ x: primaryChunk.x + 1, z: primaryChunk.z });
  }
  
  if (normalizedZ === 0) {
    affectedChunks.push({ x: primaryChunk.x, z: primaryChunk.z - 1 });
  } else if (normalizedZ === 15) {
    affectedChunks.push({ x: primaryChunk.x, z: primaryChunk.z + 1 });
  }
  
  // Corner cases - block is on both X and Z boundaries
  if (normalizedX === 0 && normalizedZ === 0) {
    affectedChunks.push({ x: primaryChunk.x - 1, z: primaryChunk.z - 1 });
  } else if (normalizedX === 0 && normalizedZ === 15) {
    affectedChunks.push({ x: primaryChunk.x - 1, z: primaryChunk.z + 1 });
  } else if (normalizedX === 15 && normalizedZ === 0) {
    affectedChunks.push({ x: primaryChunk.x + 1, z: primaryChunk.z - 1 });
  } else if (normalizedX === 15 && normalizedZ === 15) {
    affectedChunks.push({ x: primaryChunk.x + 1, z: primaryChunk.z + 1 });
  }
  
  // Remove duplicates (shouldn't happen but just in case)
  const uniqueChunks = new Map<string, ChunkCoordinate>();
  affectedChunks.forEach(chunk => {
    const key = chunkCoordsToKey(chunk.x, chunk.z);
    uniqueChunks.set(key, chunk);
  });
  
  return Array.from(uniqueChunks.values());
}