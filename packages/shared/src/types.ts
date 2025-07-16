// Player position in 3D space
export interface PlayerPosition {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
}

// Chunk coordinate
export interface ChunkCoordinate {
  x: number;
  z: number;
  data?: string;
}

// Legacy chunk data format (for backward compatibility)
export interface LegacyChunkData extends ChunkCoordinate {
  blocks: unknown[][][]; // 16x256x16 array of block data
  dimension?: number;
}

// New chunk data format with pre-computed colors (color array format)
export interface ChunkData extends ChunkCoordinate {
  colors: string[][]; // 16x16 array of hex colors
  heights?: number[][]; // 16x16 array of Y coordinates
  dimension?: number; // 0: Overworld, 1: Nether, 2: End
  ores?: OreLocation[]; // Optional ore data for this chunk
}

// Performance optimization types
export interface MegaTile {
  centerX: number;  // Center chunk X
  centerZ: number;  // Center chunk Z
  dimension: number;
  size: 3 | 5;      // 3x3 or 5x5 chunks
  canvas?: HTMLCanvasElement;
  bitmap?: ImageBitmap;
  lastUpdate: number;
  chunks: Set<string>; // Track included chunks
}

export interface RenderLayer {
  name: 'base' | 'updates' | 'overlay';
  canvas: HTMLCanvasElement;
  dirty: boolean;
  dirtyRegions: DirtyRegion[];
}

export interface DirtyRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  timestamp: number;
}

export interface RenderingConfig {
  useMegaTiles: boolean;
  megaTileSize: number;
  useImageBitmap: boolean;
  useDirtyRegions: boolean;
  maxCacheSize: number;
  resolutionTiers: number[];
}

// Minimap configuration
export interface MinimapConfig {
  zoomLevel: number;
  renderDistance: number;
  updateInterval: number;
}

// Server status
export interface ServerStatus {
  proxy: {
    connected: boolean;
    players: number;
  };
  minimap: {
    connected: boolean;
    clients: number;
  };
  timestamp: number;
}

// Chunk request structure
export interface ChunkRequest {
  chunkX: number;
  chunkZ: number;
}

// Chunk response structure
export interface ChunkResponse {
  chunkX: number;
  chunkZ: number;
  data: string | null;
  success: boolean;
  error?: string;
}

// Chunk invalidation data structure
export interface InvalidateChunksData {
  chunks: ChunkCoordinate[];
  reason: 'block_update' | 'chunk_unload' | 'world_reset';
  timestamp: number;
  data?: string;
}

// Type guard to check if a chunk is in the new color array format
export function isColorArrayChunk(chunk: unknown): chunk is ChunkData {
  return typeof chunk === 'object' && 
         chunk !== null &&
         typeof (chunk as Record<string, unknown>).x === 'number' && 
         typeof (chunk as Record<string, unknown>).z === 'number' && 
         Array.isArray((chunk as Record<string, unknown>).colors);
}

// Bedrock protocol packet interfaces for type safety
export interface BedrockClient {
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  removeAllListeners(): void;
}

export interface PacketData {
  name: string;
  params: Record<string, unknown>;
}

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface ChunkGenerator {
  generate(x: number, z: number): unknown;
}

export interface StorageProvider {
  save(key: string, data: unknown): Promise<void>;
  load(key: string): Promise<unknown>;
}

// Chunk update entry for batching
export interface ChunkUpdateEntry {
  chunk: ChunkData;
  timestamp: number;
  updateType: 'full' | 'delta';
}

// Batch update data sent to clients
export interface BatchUpdateData {
  updates: ChunkUpdateEntry[];
  playerPosition: PlayerPosition;
  batchId: string;
  timestamp: number;
}

export enum OreType {
  COAL = 'coal_ore',
  IRON = 'iron_ore', 
  COPPER = 'copper_ore',
  GOLD = 'gold_ore',
  REDSTONE = 'redstone_ore',
  LAPIS = 'lapis_ore',
  DIAMOND = 'diamond_ore',
  EMERALD = 'emerald_ore',
  QUARTZ = 'quartz_ore',
  NETHER_GOLD = 'nether_gold_ore',
  ANCIENT_DEBRIS = 'ancient_debris'
}

export interface OreDetectionConfig {
  highlightedOres: OreType[];
  highlightStyle: 'bright' | 'glow' | 'outline';
  backgroundDimming: number; // 0-1, how much to dim non-ore blocks
  showOreLabels: boolean;
  yLevelOffsets: {
    minY: number; // -10 to +10, offset from player Y position for scan floor
    maxY: number; // -10 to +10, offset from player Y position for scan ceiling
  };
}

/**
 * Default ore detection configuration with sensible defaults
 */
export const DEFAULT_ORE_DETECTION_CONFIG: OreDetectionConfig = {
  highlightedOres: [], // Only valuable ores by default
  highlightStyle: 'bright',
  backgroundDimming: 0.5, // 50% dimming for good contrast
  showOreLabels: false,
  yLevelOffsets: {
    minY: -10, // Default to scanning 10 blocks below player
    maxY: 5   // Default to scanning 5 blocks above player
  }
};

export interface OreLocation {
  x: number;
  z: number;
  y: number;
  oreType: OreType;
  chunkX: number;
  chunkZ: number;
}

export interface ChunkOreData {
  chunkX: number;
  chunkZ: number;
  dimension: number;
  ores: OreLocation[];
  surfaceColors?: string[][]; // Dimmed surface colors for context
}