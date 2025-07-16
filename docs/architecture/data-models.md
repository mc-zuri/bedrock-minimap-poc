# Data Models

This document describes the TypeScript interfaces and types used throughout the Minecraft Bedrock Minimap system.

## Core Data Types

### Position and Movement

```typescript
interface PlayerPosition {
  x: number;      // Block X coordinate
  y: number;      // Block Y coordinate  
  z: number;      // Block Z coordinate
  yaw?: number;   // Horizontal rotation (0-360)
  pitch?: number; // Vertical rotation (-90 to 90)
}

interface ChunkCoordinate {
  x: number;      // Chunk X (block X / 16)
  z: number;      // Chunk Z (block Z / 16)
  dimension: number; // 0=Overworld, 1=Nether, 2=End
}
```

### Chunk Data

```typescript
interface ChunkData {
  x: number;              // Chunk X coordinate
  z: number;              // Chunk Z coordinate
  dimension: number;      // Dimension ID
  colors: Uint8Array;     // RGB colors (16x16x3 = 768 bytes)
  heights: Uint8Array;    // Height map (16x16 = 256 bytes)
  timestamp: number;      // Last update timestamp
  ores?: OreLocation[];   // Optional ore detection data
  biomes?: Uint8Array;    // Optional biome data (16x16)
}

interface ChunkUpdateEntry {
  key: string;            // Chunk key "x,z,dimension"
  data: ChunkData;        // Full chunk data
  updateType: 'full' | 'delta'; // Update type
  deltaBlocks?: DeltaBlock[]; // Changed blocks only
}
```

### Ore Detection

```typescript
interface OreLocation {
  x: number;      // Block X within chunk (0-15)
  y: number;      // Block Y (absolute)
  z: number;      // Block Z within chunk (0-15)
  blockId: number; // Minecraft block ID
  oreType: OreType; // Categorized ore type
}

enum OreType {
  DIAMOND = 'diamond',
  EMERALD = 'emerald',
  GOLD = 'gold',
  IRON = 'iron',
  COPPER = 'copper',
  COAL = 'coal',
  REDSTONE = 'redstone',
  LAPIS = 'lapis',
  ANCIENT_DEBRIS = 'ancient_debris'
}

interface OreDetectionConfig {
  enabled: boolean;
  scanYOffset: number;      // Blocks below player to scan
  maxScanY: number;         // Maximum Y level to scan
  highlightStyle: 'overlay' | 'replace' | 'border';
  oreTypes: {
    [key in OreType]?: {
      enabled: boolean;
      color: string;      // Hex color
      priority: number;   // Render priority
    };
  };
}
```

## Rendering Types

### Canvas and Caching

```typescript
interface MegaTile {
  centerX: number;          // Center chunk X
  centerZ: number;          // Center chunk Z
  dimension: number;        
  size: 3 | 5;             // 3x3 or 5x5 chunks
  canvas?: HTMLCanvasElement;
  bitmap?: ImageBitmap;     // GPU-accelerated rendering
  lastUpdate: number;
  chunks: Set<string>;      // Included chunk keys
}

interface CachedChunk {
  key: string;
  data: ChunkData;
  canvases: Map<number, HTMLCanvasElement>; // Resolution -> Canvas
  lastAccess: number;
  memorySize: number;       // Estimated bytes
}

interface DirtyRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  timestamp: number;
}
```

### Rendering Configuration

```typescript
interface RenderingConfig {
  blockSize: number;        // Pixels per block (default: 4)
  renderDistance: number;   // Chunks to render
  useMegaTiles: boolean;
  megaTileSize: 3 | 5;
  useImageBitmap: boolean;
  useDirtyRegions: boolean;
  maxCacheSize: number;     // MB
  resolutionTiers: number[]; // [64, 128, 256]
  showGrid: boolean;
  gridColor: string;
  backgroundColor: string;
}

interface ViewportConfig {
  centerX: number;          // World coordinates
  centerZ: number;
  zoom: number;            // Zoom level (0.5 - 4.0)
  width: number;           // Canvas width
  height: number;          // Canvas height
}
```

## Network Communication

### Batch Updates

```typescript
interface BatchUpdateData {
  chunks: ChunkData[];
  playerPosition?: PlayerPosition;
  timestamp: number;
  batchId: string;         // Unique identifier
  sequenceNumber?: number; // For ordering
}

interface ChunkRequest {
  chunks: ChunkCoordinate[];
  priority: 'high' | 'normal' | 'low';
  reason: 'viewport' | 'preload' | 'user';
}
```

### Connection Management

```typescript
interface ConnectionStatus {
  connected: boolean;
  latency: number;         // ms
  lastUpdate: number;
  error?: string;
  reconnectAttempts?: number;
}

interface ClientState {
  id: string;
  sentChunks: Set<string>; // Already sent chunk keys
  viewDistance: number;
  lastPosition: PlayerPosition;
  connectionTime: number;
  settings: ClientSettings;
}
```

## Settings and Configuration

### Proxy Settings

```typescript
interface ProxySettings {
  host: string;
  port: number;
  username?: string;
  offline: boolean;
  version?: string;
  viewDistance?: number;
  socketioUrl?: string;
  profileHost?: string;
  enablePacketDumps?: boolean;
  dumpPath?: string;
  simulatePackets?: boolean;
  simulationFile?: string;
}

// Zod schema for validation
const ProxySettingsSchema = z.object({
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
  username: z.string().optional(),
  offline: z.boolean(),
  // ... other fields
});
```

### Application Settings

```typescript
interface MinimapSettings {
  rendering: RenderingConfig;
  oreDetection: OreDetectionConfig;
  ui: UISettings;
  performance: PerformanceSettings;
}

interface UISettings {
  showCoordinates: boolean;
  showFPS: boolean;
  showChunkBorders: boolean;
  minimapPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity: number;          // 0-1
  size: 'small' | 'medium' | 'large' | 'custom';
  customSize?: { width: number; height: number };
}

interface PerformanceSettings {
  targetFPS: number;
  adaptiveQuality: boolean;
  workerThreads: number;
  gpuAcceleration: boolean;
}
```

## Electron IPC Types

### Process Management

```typescript
interface ProcessStatus {
  name: string;
  pid?: number;
  status: 'running' | 'stopped' | 'crashed' | 'starting';
  lastStart?: number;
  restarts: number;
  logs: LogEntry[];
}

interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: string;
}
```

### Window Management

```typescript
interface WindowSettings {
  overlayMode: boolean;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  opacity: number;
  bounds: {
    x?: number;
    y?: number;
    width: number;
    height: number;
  };
  frameMode: 'native' | 'custom' | 'none';
}
```

## Performance Metrics

```typescript
interface PerformanceMetrics {
  fps: number;
  frameTime: number;       // ms
  drawCalls: number;
  visibleChunks: number;
  cachedChunks: number;
  cacheHitRate: number;    // 0-1
  networkLatency: number;  // ms
  memoryUsage: {
    chunks: number;        // MB
    canvases: number;      // MB
    total: number;         // MB
  };
}

interface RenderStats {
  totalFrames: number;
  droppedFrames: number;
  averageFPS: number;
  renderTime: {
    min: number;
    max: number;
    average: number;
  };
}
```

## Utility Types

### Type Guards

```typescript
// Type guard functions
function isChunkData(data: unknown): data is ChunkData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'x' in data &&
    'z' in data &&
    'colors' in data &&
    data.colors instanceof Uint8Array
  );
}

function isValidDimension(dim: number): dim is 0 | 1 | 2 {
  return dim === 0 || dim === 1 || dim === 2;
}
```

### Helper Types

```typescript
// Chunk key generation
type ChunkKey = `${number},${number},${number}`;

function getChunkKey(x: number, z: number, dimension: number): ChunkKey {
  return `${x},${z},${dimension}`;
}

// Coordinate conversion
interface BlockToChunk {
  blockX: number;
  blockZ: number;
  chunkX: number;
  chunkZ: number;
  localX: number; // 0-15
  localZ: number; // 0-15
}

function blockToChunk(blockX: number, blockZ: number): BlockToChunk {
  const chunkX = Math.floor(blockX / 16);
  const chunkZ = Math.floor(blockZ / 16);
  const localX = blockX % 16;
  const localZ = blockZ % 16;
  return { blockX, blockZ, chunkX, chunkZ, localX, localZ };
}
```

## Event Types

### Socket.io Event Maps

```typescript
// Server to Client
interface ServerToClientEvents {
  'connection-status': (data: ConnectionStatus) => void;
  'chunk-data': (data: ChunkData) => void;
  'batch-update': (data: BatchUpdateData) => void;
  'player-move': (data: PlayerPosition) => void;
  'world-reset': () => void;
  'performance-metrics': (data: PerformanceMetrics) => void;
}

// Client to Server
interface ClientToServerEvents {
  'request-chunks': (data: ChunkRequest) => void;
  'update-settings': (data: Partial<MinimapSettings>) => void;
  'minimap-click': (data: { x: number; z: number; dimension: number }) => void;
  'subscribe': (playerId: string) => void;
  'unsubscribe': (playerId: string) => void;
}

// Inter-server events (Proxy <-> Minimap Server)
interface InterServerEvents {
  'player-position': (data: PlayerPosition) => void;
  'chunk-data': (data: ChunkData) => void;
  'connection-status': (data: ConnectionStatus) => void;
  'world-reset': () => void;
}
```

## Constants and Enums

```typescript
// Dimensions
export enum Dimension {
  OVERWORLD = 0,
  NETHER = 1,
  END = 2
}

// Chunk constants
export const CHUNK_SIZE = 16;
export const SUBCHUNK_SIZE = 16;
export const MAX_BUILD_HEIGHT = 320;
export const MIN_BUILD_HEIGHT = -64;

// Network constants
export const DEFAULT_BATCH_SIZE = 10;
export const DEFAULT_BATCH_INTERVAL = 100; // ms
export const MAX_CHUNKS_PER_REQUEST = 50;

// Rendering constants
export const DEFAULT_BLOCK_SIZE = 4; // pixels
export const DEFAULT_RENDER_DISTANCE = 8; // chunks
export const MAX_CANVAS_SIZE = 16384; // pixels
```

This comprehensive type system ensures type safety across the entire application while providing clear contracts for component communication and data structures.