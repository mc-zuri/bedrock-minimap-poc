# SubChunk Data Parsing

This document explains how Minecraft Bedrock Edition subchunk data is parsed from network packets and converted into minimap-ready data.

## Overview

Minecraft Bedrock Edition uses a sophisticated SubChunk Request System (introduced in v1.18.10) that dramatically changes how chunk data is transmitted over the network. This system is crucial for the minimap's real-time data processing.

## SubChunk Request System (v1.18.10+)

### Background

Prior to v1.18.0, Minecraft sent entire chunk columns (0-255 blocks high) in single `LevelChunkPacket` packets. This became inefficient when world height expanded to -64→319 blocks, so a new system was introduced.

### Key Changes

- **Expanded World Height**: From 256 blocks (0-255) to 384 blocks (-64 to 319)
- **SubChunk Requests**: Only send visible/needed 16×16×16 sections
- **Network Optimization**: Reduces bandwidth by ~70% in typical scenarios
- **Caching System**: Optional blob caching for repeated chunks

### SubChunk Structure

```
SubChunk Dimensions:
- Size: 16×16×16 blocks
- Y-Range: Absolute coordinates (e.g., Y=-4 means blocks -64 to -49)
- Count: 24 subchunks per column (-4 to 19 for full height)
```

## Packet Flow

### 1. Initial Level Chunk Packet

```typescript
// LevelChunkPacket structure
interface LevelChunkPacket {
  x: number;              // Chunk X coordinate
  z: number;              // Chunk Z coordinate
  sub_chunk_count: number; // -1 indicates SubChunk Request System
  cache_enabled: boolean;  // Blob caching enabled
  payload: Buffer;         // Minimal chunk skeleton data
}
```

**Processing in WorldHandler:**
```typescript
async on_level_chunk(packet: LevelChunkPacket) {
  // Create chunk column with coordinates
  const chunkColumn = new this.ChunkColumn({ 
    x: packet.x, 
    z: packet.z 
  });
  
  if (packet.sub_chunk_count < 0) {
    // Modern SubChunk Request System
    await this.requestSubChunks(packet.x, packet.z);
  } else {
    // Legacy system (pre-1.18)
    await this.processLegacyChunk(packet);
  }
  
  await this.world.setColumn(packet.x, packet.z, chunkColumn);
}
```

### 2. SubChunk Request Generation

```typescript
private async requestSubChunks(chunkX: number, chunkZ: number) {
  const requests = [];
  
  // Request all Y-levels (-4 to 19 for full height)
  for (let y = -4; y <= 19; y++) {
    requests.push({
      dx: 0,  // Relative to origin
      dz: 0,  // Relative to origin  
      dy: y   // SubChunk Y-level
    });
  }
  
  // Send batch request
  this.client.queue("subchunk_request", {
    dimension: 0,
    origin: { x: chunkX, z: chunkZ, y: 0 },
    requests: requests
  });
}
```

### 3. SubChunk Response Processing

```typescript
// SubChunkPacket structure
interface SubChunkPacket {
  cache_enabled: boolean;
  dimension: number;
  origin: { x: number; y: number; z: number };
  entries: SubChunkEntry[];
}

interface SubChunkEntry {
  dx: number;           // Offset from origin
  dy: number;           // Y-level offset
  dz: number;           // Z offset
  result: number;       // 0=success, 1=chunk not found, etc.
  payload?: Buffer;     // Raw subchunk data
  blob_id?: bigint;     // Cache ID if caching enabled
  heightmap_type?: number;
  heightmap_data?: Buffer;
}
```

**Processing logic:**
```typescript
async on_subchunk(packet: SubChunkPacket) {
  for (const entry of packet.entries) {
    const absoluteX = packet.origin.x + entry.dx;
    const absoluteY = packet.origin.y + entry.dy;
    const absoluteZ = packet.origin.z + entry.dz;
    
    // Get the chunk column
    const chunkColumn = await this.world.getColumn(absoluteX, absoluteZ);
    
    if (entry.result === 0) { // Success
      if (packet.cache_enabled && entry.blob_id) {
        // Process cached subchunk
        await this.processCachedSubChunk(
          chunkColumn, 
          absoluteY, 
          entry.blob_id, 
          entry.payload
        );
      } else {
        // Process raw subchunk data
        await chunkColumn.networkDecodeSubChunkNoCache(
          absoluteY, 
          entry.payload
        );
      }
    }
  }
  
  // Emit chunk update for minimap processing
  this.emit('chunk-ready', {
    x: packet.origin.x,
    z: packet.origin.z,
    chunkColumn: chunkColumn
  });
}
```

## Prismarine Integration

### Block State Resolution

The minimap uses `prismarine-chunk` and `prismarine-registry` for parsing:

```typescript
import { Registry } from 'prismarine-registry';
import { Chunk } from 'prismarine-chunk';

class ChunkProcessor {
  private registry: Registry;
  
  constructor(minecraftVersion: string) {
    this.registry = Registry(minecraftVersion);
  }
  
  async processSubChunk(chunkColumn: any, subChunkY: number): Promise<void> {
    // Get the specific subchunk
    const subChunk = chunkColumn.sections[subChunkY + 4]; // Offset for negative Y
    
    if (!subChunk) return;
    
    // Process 16x16x16 blocks in subchunk
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = 15; y >= 0; y--) { // Top to bottom
          const blockY = subChunkY * 16 + y;
          
          // Get block state ID
          const stateId = subChunk.getBlockStateId(0, x, y, z);
          
          // Resolve to block name
          const blockState = this.registry.blocksByStateId[stateId];
          
          if (blockState && blockState.name !== 'minecraft:air') {
            // Found surface block
            await this.processSurfaceBlock(x, z, blockY, blockState.name);
            break; // Stop at surface
          }
        }
      }
    }
  }
}
```

### Surface Detection Algorithm

```typescript
private async processSurfaceBlock(
  x: number, 
  z: number, 
  blockY: number, 
  blockName: string
): Promise<void> {
  // Get base color from block name
  const baseColor = this.getBlockColor(blockName);
  
  // Apply height-based shading
  const shadedColor = this.applyHeightShading(baseColor, blockY);
  
  // Store in surface array
  this.surfaceColors[x][z] = shadedColor;
  this.surfaceHeights[x][z] = blockY;
  
  // Check for ore detection
  if (this.isOreBlock(blockName)) {
    this.oreLocations.push({
      x, z, y: blockY,
      blockName,
      oreType: this.getOreType(blockName)
    });
  }
}
```

## Data Transformation Pipeline

### 1. Raw Packet Data

```
Network Packet (Binary)
├── Header (packet ID, length)
├── SubChunk Coordinates
├── Result Status Codes
└── Payload Data (compressed NBT)
```

### 2. Prismarine Parsing

```typescript
// prismarine-chunk processes binary data
const subChunk = {
  y: -2,  // Subchunk Y-level
  blocks: {
    palette: [
      { name: 'minecraft:air', properties: {} },
      { name: 'minecraft:stone', properties: {} },
      // ... more block states
    ],
    data: Uint16Array // Block state indices
  },
  biomes: {
    palette: ['plains', 'forest'],
    data: Uint8Array
  }
};
```

### 3. Surface Extraction

```typescript
// Convert 3D subchunk to 2D surface
const surfaceData = {
  x: 0, z: 0,
  colors: [
    ['#7F7F7F', '#7F7F7F', ...], // 16 colors per row
    // ... 15 more rows
  ],
  heights: [
    [64, 65, 63, ...], // 16 heights per row
    // ... 15 more rows  
  ],
  ores: [
    { x: 5, y: 12, z: 8, oreType: 'diamond' }
  ]
};
```

## Performance Optimizations

### Batch Processing

```typescript
class SubChunkProcessor {
  private pendingSubChunks = new Map<string, SubChunkData[]>();
  private batchTimer: NodeJS.Timeout | null = null;
  
  queueSubChunk(chunkKey: string, subChunk: SubChunkData) {
    if (!this.pendingSubChunks.has(chunkKey)) {
      this.pendingSubChunks.set(chunkKey, []);
    }
    
    this.pendingSubChunks.get(chunkKey)!.push(subChunk);
    
    // Batch process after 50ms
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.processBatch();
        this.batchTimer = null;
      }, 50);
    }
  }
  
  private processBatch() {
    for (const [chunkKey, subChunks] of this.pendingSubChunks) {
      this.processCompleteChunk(chunkKey, subChunks);
    }
    this.pendingSubChunks.clear();
  }
}
```

### Caching Strategy

```typescript
class SubChunkCache {
  private cache = new Map<string, ProcessedSubChunk>();
  private blobStore = new Map<bigint, Buffer>();
  
  async getSubChunk(
    x: number, 
    y: number, 
    z: number, 
    blobId?: bigint
  ): Promise<ProcessedSubChunk | null> {
    const key = `${x},${y},${z}`;
    
    // Check processed cache first
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    
    // Check blob cache
    if (blobId && this.blobStore.has(blobId)) {
      const rawData = this.blobStore.get(blobId)!;
      const processed = await this.processRawSubChunk(rawData);
      this.cache.set(key, processed);
      return processed;
    }
    
    return null;
  }
}
```

## Error Handling

### SubChunk Result Codes

```typescript
enum SubChunkResult {
  SUCCESS = 0,
  CHUNK_NOT_FOUND = 1,
  INVALID_DIMENSION = 2,
  PLAYER_NOT_FOUND = 3,
  Y_OUT_OF_BOUNDS = 4,
  SUCCESS_ALL_AIR = 5
}

private handleSubChunkResult(entry: SubChunkEntry) {
  switch (entry.result) {
    case SubChunkResult.SUCCESS:
      return this.processSubChunkData(entry.payload);
      
    case SubChunkResult.SUCCESS_ALL_AIR:
      return this.createAirSubChunk();
      
    case SubChunkResult.CHUNK_NOT_FOUND:
      console.warn(`SubChunk not found at ${entry.dx},${entry.dy},${entry.dz}`);
      return null;
      
    case SubChunkResult.Y_OUT_OF_BOUNDS:
      console.warn(`Y coordinate out of bounds: ${entry.dy}`);
      return null;
      
    default:
      console.error(`Unknown SubChunk result: ${entry.result}`);
      return null;
  }
}
```

## Debugging SubChunk Processing

### Packet Inspection

```typescript
// Enable detailed packet logging
relay.on('packet', (packet, client, server) => {
  if (packet.name === 'level_chunk') {
    console.log('Level Chunk:', {
      x: packet.params.x,
      z: packet.params.z,
      subChunkCount: packet.params.sub_chunk_count,
      cacheEnabled: packet.params.cache_enabled,
      payloadSize: packet.params.payload?.length
    });
  }
  
  if (packet.name === 'subchunk') {
    console.log('SubChunk Response:', {
      origin: packet.params.origin,
      entryCount: packet.params.entries?.length,
      cacheEnabled: packet.params.cache_enabled
    });
    
    packet.params.entries?.forEach((entry, i) => {
      console.log(`  Entry ${i}:`, {
        offset: { dx: entry.dx, dy: entry.dy, dz: entry.dz },
        result: entry.result,
        hasPayload: !!entry.payload,
        payloadSize: entry.payload?.length,
        blobId: entry.blob_id
      });
    });
  }
});
```

### Data Validation

```typescript
private validateSubChunkData(subChunk: any): boolean {
  // Check basic structure
  if (!subChunk || typeof subChunk !== 'object') {
    console.error('Invalid subchunk: not an object');
    return false;
  }
  
  // Validate Y coordinate
  if (typeof subChunk.y !== 'number' || subChunk.y < -4 || subChunk.y > 19) {
    console.error(`Invalid subchunk Y: ${subChunk.y}`);
    return false;
  }
  
  // Check block data structure
  if (!subChunk.blocks || !Array.isArray(subChunk.blocks.palette)) {
    console.error('Invalid subchunk: missing block palette');
    return false;
  }
  
  // Verify data array length (should be 4096 for 16³ blocks)
  if (subChunk.blocks.data.length !== 4096) {
    console.error(`Invalid block data length: ${subChunk.blocks.data.length}`);
    return false;
  }
  
  return true;
}
```

## Integration Points

### WorldHandler Integration

```typescript
// In bedrock-proxy-server/src/world-handler.ts
export class WorldHandler extends EventEmitter {
  private subChunkProcessor: SubChunkProcessor;
  
  constructor(client: BedrockClient) {
    super();
    this.subChunkProcessor = new SubChunkProcessor();
    
    // Register packet handlers
    client.on('level_chunk', this.on_level_chunk.bind(this));
    client.on('subchunk', this.on_subchunk.bind(this));
  }
}
```

### ChunkService Integration

```typescript
// In minimap-server/src/services/chunk.service.ts
export class ChunkService {
  async processChunkRequest(x: number, z: number): Promise<ChunkData> {
    const chunkColumn = await this.world.getColumn(x, z);
    
    if (!chunkColumn) {
      throw new Error(`Chunk not found: ${x},${z}`);
    }
    
    // Process all subchunks to create surface data
    const surfaceData = await this.extractSurfaceData(chunkColumn);
    
    return {
      x, z,
      colors: surfaceData.colors,
      heights: surfaceData.heights,
      ores: surfaceData.ores,
      dimension: 0
    };
  }
}
```

This SubChunk parsing system enables the minimap to efficiently process real-time world data from Minecraft Bedrock Edition, converting complex 3D subchunk data into 2D surface representations optimized for visualization.