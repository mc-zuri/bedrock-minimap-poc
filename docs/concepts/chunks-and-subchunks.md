# Chunks and Subchunks

Understanding Minecraft's chunk system is essential for working with the minimap. This document explains how the world is divided and how we process this data.

## Chunk Basics

### What is a Chunk?

A chunk is a 16×16 block section of the Minecraft world that extends from the bottom of the world to the build height limit.

```
Chunk Dimensions:
- Width: 16 blocks (X-axis)
- Length: 16 blocks (Z-axis)  
- Height: 384 blocks (Y-axis)
- Total blocks: 98,304 per chunk
```

### Chunk Coordinates

Chunks use a coordinate system separate from block coordinates:

```typescript
// Convert block coordinates to chunk coordinates
const chunkX = Math.floor(blockX / 16);
const chunkZ = Math.floor(blockZ / 16);

// Convert chunk coordinates to block coordinates (northwest corner)
const blockX = chunkX * 16;
const blockZ = chunkZ * 16;
```

### Visual Representation

```
World viewed from above (each cell = 1 chunk):

    -2  -1   0   1   2  (Chunk X)
-2  [ ] [ ] [ ] [ ] [ ]
-1  [ ] [ ] [ ] [ ] [ ]
 0  [ ] [ ] [P] [ ] [ ]  P = Player at chunk (0,0)
 1  [ ] [ ] [ ] [ ] [ ]
 2  [ ] [ ] [ ] [ ] [ ]
(Chunk Z)
```

## Subchunks

### Structure

Each chunk is divided vertically into 24 subchunks:

```
Subchunk Dimensions:
- Size: 16×16×16 blocks
- Count: 24 per chunk
- Y-range: -64 to 320 (Y = subchunk_index * 16 - 64)
```

### Subchunk Indexing

```typescript
// Get subchunk index from Y coordinate
const subchunkIndex = Math.floor((y + 64) / 16);

// Get Y range for a subchunk
const minY = subchunkIndex * 16 - 64;
const maxY = minY + 15;
```

### Memory Layout

```
Chunk Memory Structure:
┌─────────────────┐ Y = 320
│  Subchunk 23    │
├─────────────────┤
│  Subchunk 22    │
├─────────────────┤
│       ...       │
├─────────────────┤ Y = 0 (Sea level)
│  Subchunk 4     │
├─────────────────┤
│  Subchunk 3     │
├─────────────────┤
│       ...       │
├─────────────────┤
│  Subchunk 0     │ Y = -64
└─────────────────┘
```

## Minimap Chunk Processing

### Surface Detection

The minimap only needs the topmost non-air block in each column:

```typescript
function getHighestBlock(chunk: ChunkData, x: number, z: number): BlockInfo {
  // Start from the top and work down
  for (let y = 319; y >= -64; y--) {
    const block = chunk.getBlock(x, y, z);
    if (block !== 'minecraft:air') {
      return { blockId: block, height: y };
    }
  }
  return { blockId: 'minecraft:air', height: -64 };
}
```

### Optimized Data Format

Instead of storing all 98,304 blocks, we store only what's needed:

```typescript
interface MinimapChunkData {
  x: number;              // Chunk X coordinate
  z: number;              // Chunk Z coordinate
  dimension: number;      // 0=Overworld, 1=Nether, 2=End
  colors: Uint8Array;     // 768 bytes (16×16×3 RGB)
  heights: Uint8Array;    // 256 bytes (16×16 heights)
  timestamp: number;      // Last update time
  ores?: OreLocation[];   // Optional ore data
}
```

**Memory savings:**
- Full chunk: ~300KB (all blocks)
- Minimap format: ~1KB (surface only)
- Compression ratio: 300:1

## Chunk Loading Patterns

### Render Distance

Chunks are loaded based on render distance:

```typescript
function getChunksInRadius(centerX: number, centerZ: number, radius: number): ChunkCoord[] {
  const chunks: ChunkCoord[] = [];
  
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      // Circular loading pattern
      if (dx * dx + dz * dz <= radius * radius) {
        chunks.push({
          x: centerX + dx,
          z: centerZ + dz
        });
      }
    }
  }
  
  return chunks;
}
```

### Loading Priority

Chunks are prioritized based on distance to player:

```typescript
enum ChunkPriority {
  IMMEDIATE = 0,  // Currently visible
  NEAR = 1,       // Within 2 chunks
  MEDIUM = 2,     // Within 5 chunks
  FAR = 3,        // Within render distance
  PRELOAD = 4     // Beyond render distance
}
```

## Chunk Updates

### Update Types

1. **Full Update**: Complete chunk data replacement
2. **Delta Update**: Only changed blocks
3. **Metadata Update**: Non-block changes (e.g., biome)

### Change Detection

```typescript
function detectChunkChanges(oldChunk: ChunkData, newChunk: ChunkData): BlockChange[] {
  const changes: BlockChange[] = [];
  
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      const index = x + z * 16;
      
      if (oldChunk.colors[index] !== newChunk.colors[index] ||
          oldChunk.heights[index] !== newChunk.heights[index]) {
        changes.push({ x, z, index });
      }
    }
  }
  
  return changes;
}
```

## Dimension Handling

### Dimension IDs

```typescript
enum Dimension {
  OVERWORLD = 0,
  NETHER = 1,
  END = 2
}
```

### Dimension-Specific Processing

Different dimensions require different handling:

```typescript
function processChunkForDimension(chunk: ChunkData): void {
  switch (chunk.dimension) {
    case Dimension.NETHER:
      // Nether has a bedrock ceiling at Y=127
      chunk.maxY = Math.min(chunk.maxY, 127);
      break;
      
    case Dimension.END:
      // End has special void handling
      chunk.fillVoidWithBlack();
      break;
      
    case Dimension.OVERWORLD:
      // Standard processing
      break;
  }
}
```

## Chunk Caching

### Cache Key Generation

```typescript
type ChunkKey = `${number},${number},${number}`;

function getChunkKey(x: number, z: number, dimension: number): ChunkKey {
  return `${x},${z},${dimension}`;
}

function parseChunkKey(key: ChunkKey): ChunkCoordinate {
  const [x, z, dimension] = key.split(',').map(Number);
  return { x, z, dimension };
}
```

### Cache Invalidation

```typescript
class ChunkCache {
  private cache = new Map<ChunkKey, CachedChunk>();
  
  invalidateChunk(x: number, z: number, dimension: number): void {
    const key = getChunkKey(x, z, dimension);
    const cached = this.cache.get(key);
    
    if (cached) {
      // Mark as stale
      cached.stale = true;
      
      // Dispose of GPU resources
      cached.bitmap?.close();
      
      // Schedule for removal
      this.scheduleEviction(key);
    }
  }
}
```

## Best Practices

### Do's
- ✅ Use chunk coordinates for cache keys
- ✅ Process only visible chunks
- ✅ Cache processed chunk data
- ✅ Handle dimension transitions
- ✅ Implement proper cleanup

### Don'ts
- ❌ Store full chunk data in memory
- ❌ Process chunks outside render distance
- ❌ Assume chunk data is immutable
- ❌ Ignore dimension boundaries
- ❌ Keep references to evicted chunks

## Common Patterns

### Chunk Iteration

```typescript
// Iterate over all blocks in a chunk
for (let x = 0; x < 16; x++) {
  for (let z = 0; z < 16; z++) {
    const index = x + z * 16;
    // Process block at (x, z)
  }
}
```

### Neighbor Access

```typescript
function getNeighborChunks(x: number, z: number): ChunkCoordinate[] {
  return [
    { x: x - 1, z: z },     // West
    { x: x + 1, z: z },     // East
    { x: x, z: z - 1 },     // North
    { x: x, z: z + 1 },     // South
    { x: x - 1, z: z - 1 }, // Northwest
    { x: x + 1, z: z - 1 }, // Northeast
    { x: x - 1, z: z + 1 }, // Southwest
    { x: x + 1, z: z + 1 }  // Southeast
  ];
}
```

Understanding chunks and subchunks is fundamental to efficiently processing and rendering the Minecraft world in the minimap system.