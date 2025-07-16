# Shared Package

The shared package provides TypeScript types, utilities, and constants used across all components of the minimap system, ensuring type safety and consistency.

## Overview

`@minecraft-bedrock-minimap/shared` serves as the central type and utility library, providing:
- TypeScript interfaces and types for all data structures
- Socket.io event type definitions
- Block color mappings for rendering
- Ore detection utilities and configurations
- Coordinate conversion functions
- Validation schemas for settings

## Package Structure

```
packages/shared/src/
├── index.ts              # Main exports
├── types.ts             # Core type definitions
├── socket-events.ts     # Socket.io event types
├── block-colors.ts      # Block color mappings
├── ore-utils.ts         # Ore detection utilities
├── types/
│   └── proxy-settings.ts # Proxy configuration schema
└── utils/
    └── chunk-coords.ts  # Coordinate utilities
```

## Core Types

### Chunk Data

```typescript
// New optimized format with pre-computed colors
interface ChunkData {
  x: number;              // Chunk X coordinate
  z: number;              // Chunk Z coordinate
  colors: string[][];     // 16x16 array of hex colors
  heights?: number[][];   // 16x16 array of Y coordinates
  dimension?: number;     // 0: Overworld, 1: Nether, 2: End
  ores?: OreLocation[];   // Optional ore detection data
}

// Legacy format for backwards compatibility
interface LegacyChunkData {
  x: number;
  z: number;
  data: number[][][];     // Raw block data
  dimension?: number;
}
```

### Player and Position

```typescript
interface PlayerPosition {
  x: number;              // Block X coordinate
  y: number;              // Block Y coordinate
  z: number;              // Block Z coordinate
  pitch: number;          // Vertical rotation
  yaw: number;            // Horizontal rotation
}

interface Position3D {
  x: number;
  y: number;
  z: number;
}
```

### Performance Optimization Types

```typescript
interface MegaTile {
  centerX: number;        // Center chunk X
  centerZ: number;        // Center chunk Z
  size: 3 | 5;           // 3x3 or 5x5 chunks
  chunks: ChunkData[];
  lastUpdate: number;
}

interface DirtyRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  timestamp: number;
}

interface RenderingConfig {
  useMegaTiles: boolean;
  megaTileSize: 3 | 5;
  useImageBitmap: boolean;
  useDirtyRegions: boolean;
  maxCacheSize: number;
  resolutionTiers: number[];
}
```

## Socket.io Event Types

### Type-Safe Event Interfaces

```typescript
// Proxy to Minimap Server
interface ProxyToMinimapEvents {
  'player-position': (data: PlayerPosition) => void;
  'chunk-data': (data: ChunkResponse) => void;
  'world-reset': () => void;
  'connection-status': (connected: boolean) => void;
}

// Minimap Server to Web Client
interface MinimapToWebEvents {
  'batch-update': (data: BatchUpdateData) => void;
  'player-move': (data: PlayerPosition) => void;
  'chunk-data': (data: ChunkData) => void;
  'connection-status': (connected: boolean) => void;
}

// Web Client to Minimap Server
interface WebToMinimapEvents {
  'request-initial-chunks': () => void;
  'minimap-click': (data: { x: number; z: number; dimension: number }) => void;
}
```

### Batch Update System

```typescript
interface BatchUpdateData {
  chunks: ChunkUpdateEntry[];
  playerPosition?: PlayerPosition;
  timestamp: number;
  batchId: string;
}

interface ChunkUpdateEntry {
  chunkData: ChunkData;
  updateType: 'full' | 'delta';
  metadata?: {
    priority: number;
    source: string;
  };
}
```

## Block Color System

### Comprehensive Block Mapping

```typescript
// 1,261 Minecraft Bedrock blocks mapped to colors
const BLOCK_MAP_COLORS: Record<string, string> = {
  "minecraft:stone": "#7F7F7F",
  "minecraft:grass_block": "#7FB238",
  "minecraft:dirt": "#8B5A2B",
  "minecraft:water": "#4D6BE8",
  // ... 1,257 more blocks
};

// Utility functions
function getBlockColor(blockName: string): string | undefined;
function getBlockColorWithFallback(blockName: string, fallback: string): string;
```

### Color Categories

- **Terrain Blocks**: Stone, dirt, sand, etc.
- **Vegetation**: Grass, leaves, logs
- **Ores**: All ore types with distinct colors
- **Liquids**: Water, lava with transparency
- **Special**: Glass, air (transparent blocks)

## Ore Detection System

### Ore Types and Configuration

```typescript
enum OreType {
  COAL = 'coal',
  IRON = 'iron',
  COPPER = 'copper',
  GOLD = 'gold',
  REDSTONE = 'redstone',
  LAPIS = 'lapis',
  DIAMOND = 'diamond',
  EMERALD = 'emerald',
  QUARTZ = 'quartz',
  NETHER_GOLD = 'nether_gold',
  ANCIENT_DEBRIS = 'ancient_debris'
}

interface OreDetectionConfig {
  enabled: boolean;
  scanYOffset: number;      // Blocks below player
  maxScanY: number;         // Maximum Y to scan
  highlightStyle: 'bright' | 'glow' | 'outline';
  backgroundDim: number;    // 0-1 dimming
  oreTypes: Record<OreType, {
    enabled: boolean;
    color: string;
    priority: number;
  }>;
}
```

### Ore Utilities

```typescript
// Y-level spawn ranges
const ORE_Y_RANGES: Record<OreType, { min: number; max: number; optimal: number }> = {
  diamond: { min: -64, max: 16, optimal: -59 },
  emerald: { min: -16, max: 320, optimal: 236 },
  coal: { min: 0, max: 320, optimal: 96 },
  // ... more ranges
};

// Utility functions
function isOreBlock(blockName: string): boolean;
function getOreType(blockName: string): OreType | undefined;
function canOreSpawnAtY(oreType: OreType, y: number): boolean;
function getOresAtY(y: number): OreType[];
function getOreHighlightColor(oreType: OreType): string;
```

## Proxy Settings Schema

### Zod Validation Schema

```typescript
const ProxySettingsSchema = z.object({
  // Minecraft connection
  version: z.string().default('1.21.93'),
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
  
  // Relay settings
  relayHost: z.string().default('0.0.0.0'),
  relayPort: z.number().min(1024).max(65535).default(19134),
  
  // Performance
  enableChunkCaching: z.boolean().default(true),
  chunkSaveInterval: z.number().min(1000).default(10000),
  maxCachedChunks: z.number().min(100).default(10000),
  
  // Advanced
  profilesFolder: z.string().optional(),
  enableAutoReconnect: z.boolean().default(true),
  enableDebugLogging: z.boolean().default(false)
});

type ProxySettings = z.infer<typeof ProxySettingsSchema>;
```

### Default Configuration

```typescript
const DEFAULT_PROXY_SETTINGS: ProxySettings = {
  version: '1.21.93',
  host: 'localhost',
  port: 19132,
  relayHost: '0.0.0.0',
  relayPort: 19134,
  enableChunkCaching: true,
  chunkSaveInterval: 10000,
  maxCachedChunks: 10000,
  enableAutoReconnect: true,
  enableDebugLogging: false
};
```

## Coordinate Utilities

### Chunk Coordinate Conversion

```typescript
// Convert world coordinates to chunk coordinates
function worldToChunkCoords(x: number, z: number): { chunkX: number; chunkZ: number } {
  return {
    chunkX: Math.floor(x / 16),
    chunkZ: Math.floor(z / 16)
  };
}

// Generate chunk key for storage
function chunkCoordsToKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

// Get all chunks affected by a block update
function getAffectedChunks(blockX: number, blockZ: number): Array<{ chunkX: number; chunkZ: number }> {
  // Handles chunk boundaries
  // Returns all affected chunks (up to 4 for corner blocks)
}
```

## Type Guards

### Runtime Type Checking

```typescript
// Check if chunk uses new color array format
function isColorArrayChunk(chunk: any): chunk is ChunkData {
  return chunk && 
         Array.isArray(chunk.colors) && 
         chunk.colors.length === 16 &&
         Array.isArray(chunk.colors[0]);
}

// Validate ore detection config
function isValidOreConfig(config: any): config is OreDetectionConfig {
  return config &&
         typeof config.enabled === 'boolean' &&
         typeof config.scanYOffset === 'number' &&
         config.oreTypes && typeof config.oreTypes === 'object';
}
```

## Usage Examples

### Import Patterns

```typescript
// Main types
import type { 
  ChunkData, 
  PlayerPosition, 
  OreDetectionConfig 
} from '@minecraft-bedrock-minimap/shared';

// Specific utilities
import { 
  getBlockColor,
  isOreBlock,
  worldToChunkCoords 
} from '@minecraft-bedrock-minimap/shared';

// Socket.io events
import type { 
  ProxyToMinimapEvents,
  MinimapToWebEvents 
} from '@minecraft-bedrock-minimap/shared/socket-events';
```

### Type-Safe Socket.io

```typescript
import type { Socket } from 'socket.io';
import type { ProxyToMinimapEvents, MinimapToProxyEvents } from '@minecraft-bedrock-minimap/shared';

const socket: Socket<ProxyToMinimapEvents, MinimapToProxyEvents> = io('http://localhost:3001');

socket.on('player-position', (position: PlayerPosition) => {
  // TypeScript knows the exact type
  console.log(`Player at ${position.x}, ${position.y}, ${position.z}`);
});
```

### Chunk Processing

```typescript
import { getBlockColor, isOreBlock, getOreType } from '@minecraft-bedrock-minimap/shared';

function processChunk(chunk: ChunkData): void {
  // Use pre-computed colors
  const color = chunk.colors[0][0]; // Already a hex color
  
  // Or get colors from block names (legacy)
  const blockColor = getBlockColor('minecraft:stone');
  
  // Process ores
  if (chunk.ores) {
    chunk.ores.forEach(ore => {
      const oreType = getOreType(ore.blockName);
      if (oreType) {
        console.log(`Found ${oreType} at Y=${ore.y}`);
      }
    });
  }
}
```

## Development

### Building the Package

```bash
# Build TypeScript
npm run build

# Type checking
npm run typecheck

# Run tests
npm run test
```

### Adding New Types

1. Add types to appropriate file in `src/`
2. Export from `src/index.ts`
3. Update version in `package.json`
4. Test across all packages

## Best Practices

### Type Safety

```typescript
// ✅ Use specific types
function updateChunk(chunk: ChunkData): void { }

// ❌ Avoid any
function updateChunk(chunk: any): void { }
```

### Event Types

```typescript
// ✅ Use typed Socket.io
const socket: Socket<ServerEvents, ClientEvents> = io();

// ❌ Untyped events
socket.emit('some-event', data); // No type checking
```

### Imports

```typescript
// ✅ Import specific utilities
import { getBlockColor } from '@minecraft-bedrock-minimap/shared';

// ✅ Type-only imports
import type { ChunkData } from '@minecraft-bedrock-minimap/shared';

// ❌ Avoid barrel imports for tree-shaking
import * as shared from '@minecraft-bedrock-minimap/shared';
```

The shared package ensures type consistency and provides essential utilities across the entire minimap system, enabling type-safe development and reducing bugs through compile-time checking.