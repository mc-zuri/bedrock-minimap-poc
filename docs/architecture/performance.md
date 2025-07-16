# Performance Architecture

This document outlines the performance optimization strategies implemented throughout the Minecraft Bedrock Minimap system.

## Performance Goals

- **60 FPS** with 100+ visible chunks
- **< 200MB** memory usage for 1000 cached chunks
- **80% reduction** in network traffic through batching
- **< 16ms** frame time for smooth rendering
- **< 100ms** latency for chunk updates

## Optimization Strategies

### 1. Network Optimizations

#### Intelligent Batching
Reduces message frequency by grouping updates:

```typescript
// Before: 100 messages/second
socket.emit('chunk-data', chunk1);
socket.emit('chunk-data', chunk2);
socket.emit('chunk-data', chunk3);

// After: 10 messages/second
socket.emit('batch-update', {
  chunks: [chunk1, chunk2, chunk3],
  timestamp: Date.now()
});
```

**Implementation:**
- 100ms batch window
- Automatic deduplication
- Priority-based ordering
- Configurable batch size

#### Per-Client State Tracking
Prevents redundant data transmission:

```typescript
class ClientStateManager {
  private sentChunks = new Map<clientId, Set<chunkKey>>();
  
  shouldSendChunk(clientId: string, chunkKey: string): boolean {
    const sent = this.sentChunks.get(clientId);
    return !sent || !sent.has(chunkKey);
  }
  
  markChunkSent(clientId: string, chunkKey: string): void {
    if (!this.sentChunks.has(clientId)) {
      this.sentChunks.set(clientId, new Set());
    }
    this.sentChunks.get(clientId).add(chunkKey);
  }
}
```

#### Delta Updates
Transmit only changed blocks:

```typescript
interface DeltaUpdate {
  chunkKey: string;
  changes: Array<{
    index: number;  // 0-255 (x + z * 16)
    color: [number, number, number];
    height: number;
  }>;
}
```

### 2. Rendering Optimizations

#### Multi-Resolution Caching
Different zoom levels use appropriate resolutions:

```typescript
class MultiResolutionCache {
  private resolutions = [64, 128, 256]; // pixels per chunk
  private caches = new Map<number, Map<string, HTMLCanvasElement>>();
  
  getChunkCanvas(key: string, targetSize: number): HTMLCanvasElement {
    // Find best matching resolution
    const resolution = this.resolutions.find(r => r >= targetSize) || 256;
    return this.caches.get(resolution)?.get(key);
  }
}
```

#### Viewport Culling
Only render visible chunks:

```typescript
function getVisibleChunks(viewport: Viewport): Set<string> {
  const startChunkX = Math.floor((viewport.x - viewport.width/2) / 16);
  const endChunkX = Math.ceil((viewport.x + viewport.width/2) / 16);
  const startChunkZ = Math.floor((viewport.z - viewport.height/2) / 16);
  const endChunkZ = Math.ceil((viewport.z + viewport.height/2) / 16);
  
  const visible = new Set<string>();
  for (let x = startChunkX; x <= endChunkX; x++) {
    for (let z = startChunkZ; z <= endChunkZ; z++) {
      visible.add(`${x},${z},${viewport.dimension}`);
    }
  }
  return visible;
}
```

#### MegaTile Rendering
Group adjacent chunks to reduce draw calls:

```typescript
class MegaTileRenderer {
  private tileSize = 3; // 3x3 chunks
  
  createMegaTile(centerX: number, centerZ: number): ImageBitmap {
    const size = this.tileSize * 16 * blockSize;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Render 9 chunks in one operation
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunk = getChunk(centerX + dx, centerZ + dz);
        if (chunk) {
          ctx.drawImage(chunk.canvas, 
            (dx + 1) * 16 * blockSize,
            (dz + 1) * 16 * blockSize
          );
        }
      }
    }
    
    // Convert to GPU-accelerated bitmap
    return createImageBitmap(canvas);
  }
}
```

**Benefits:**
- 9x reduction in draw calls
- GPU-accelerated rendering
- Better cache locality

#### Dirty Region Tracking
Only redraw changed areas:

```typescript
class DirtyRegionOptimizer {
  private regions: DirtyRegion[] = [];
  
  markDirty(x: number, y: number, w: number, h: number) {
    this.regions.push({ x, y, width: w, height: h });
  }
  
  render(ctx: CanvasRenderingContext2D) {
    const merged = this.mergeRegions(this.regions);
    
    for (const region of merged) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(region.x, region.y, region.width, region.height);
      ctx.clip();
      
      // Only render within clipped region
      this.renderRegion(ctx, region);
      
      ctx.restore();
    }
    
    this.regions = [];
  }
}
```

### 3. Memory Optimizations

#### LRU Cache with Size Limits
Automatic eviction under memory pressure:

```typescript
class SizeLimitedLRUCache<T> {
  private maxSize: number; // bytes
  private currentSize = 0;
  private items = new Map<string, CacheItem<T>>();
  private accessOrder: string[] = [];
  
  set(key: string, value: T, size: number) {
    // Evict least recently used items if needed
    while (this.currentSize + size > this.maxSize && this.accessOrder.length > 0) {
      const evictKey = this.accessOrder.shift()!;
      const item = this.items.get(evictKey);
      if (item) {
        this.currentSize -= item.size;
        this.items.delete(evictKey);
        this.onEvict?.(evictKey, item.value);
      }
    }
    
    this.items.set(key, { value, size, lastAccess: Date.now() });
    this.currentSize += size;
    this.accessOrder.push(key);
  }
}
```

#### Typed Arrays
Use efficient binary data structures:

```typescript
// Inefficient: Regular arrays
const colors = []; // Uses 8 bytes per number

// Efficient: Typed arrays  
const colors = new Uint8Array(16 * 16 * 3); // 1 byte per value
const heights = new Uint8Array(16 * 16);     // 1 byte per height
```

**Memory savings:**
- Colors: 6KB → 768 bytes per chunk
- Heights: 2KB → 256 bytes per chunk

#### Canvas Pooling
Reuse canvases to reduce GC pressure:

```typescript
class CanvasPool {
  private available: HTMLCanvasElement[] = [];
  private inUse = new Set<HTMLCanvasElement>();
  
  acquire(width: number, height: number): HTMLCanvasElement {
    let canvas = this.available.pop();
    
    if (!canvas) {
      canvas = document.createElement('canvas');
    }
    
    canvas.width = width;
    canvas.height = height;
    this.inUse.add(canvas);
    
    return canvas;
  }
  
  release(canvas: HTMLCanvasElement) {
    if (this.inUse.delete(canvas)) {
      // Clear for reuse
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      this.available.push(canvas);
    }
  }
}
```

### 4. Processing Optimizations

#### Chunk Processing Pipeline
Efficient color computation:

```typescript
// Optimized color calculation
function computeChunkColors(chunk: ChunkData): Uint8Array {
  const colors = new Uint8Array(16 * 16 * 3);
  
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      const index = (x + z * 16);
      const blockId = chunk.getHighestBlock(x, z);
      
      // Direct lookup instead of switch/if chains
      const color = BLOCK_COLORS[blockId] || DEFAULT_COLOR;
      
      // Unrolled loop for better performance
      const colorIndex = index * 3;
      colors[colorIndex] = color[0];
      colors[colorIndex + 1] = color[1];
      colors[colorIndex + 2] = color[2];
    }
  }
  
  return colors;
}
```

#### Ore Detection Optimization
Scan only relevant Y-levels:

```typescript
function detectOres(chunk: ChunkData, playerY: number, config: OreDetectionConfig): OreLocation[] {
  const ores: OreLocation[] = [];
  const minY = Math.max(playerY - config.scanYOffset, -64);
  const maxY = Math.min(playerY + 10, config.maxScanY);
  
  // Early exit if no scanning needed
  if (maxY < minY) return ores;
  
  // Use bit flags for enabled ores
  const enabledOres = getEnabledOreBitmap(config);
  
  for (let y = minY; y <= maxY; y++) {
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        const blockId = chunk.getBlock(x, y, z);
        
        // Fast bitwise check
        if (enabledOres & (1 << ORE_BIT_MAP[blockId])) {
          ores.push({ x, y, z, blockId, oreType: getOreType(blockId) });
        }
      }
    }
  }
  
  return ores;
}
```

### 5. Adaptive Performance

#### Dynamic Quality Adjustment
Automatically adjust quality based on performance:

```typescript
class AdaptiveRenderer {
  private targetFPS = 60;
  private measurements: number[] = [];
  
  adjustQuality(currentFPS: number) {
    this.measurements.push(currentFPS);
    
    if (this.measurements.length >= 10) {
      const avgFPS = average(this.measurements);
      
      if (avgFPS < this.targetFPS * 0.8) {
        // Reduce quality
        this.reduceRenderDistance();
        this.disableGridOverlay();
        this.reduceCacheResolution();
      } else if (avgFPS > this.targetFPS * 0.95) {
        // Increase quality
        this.increaseRenderDistance();
        this.enableFeatures();
      }
      
      this.measurements = [];
    }
  }
}
```

#### Progressive Rendering
Load detail levels progressively:

```typescript
class ProgressiveLoader {
  async loadChunk(key: string): Promise<void> {
    // 1. Load low-res preview (fast)
    const preview = await this.loadPreview(key);
    this.renderPreview(preview);
    
    // 2. Load full resolution (slower)
    const full = await this.loadFullResolution(key);
    this.renderFull(full);
    
    // 3. Load ore data if enabled (slowest)
    if (this.oreDetectionEnabled) {
      const ores = await this.loadOreData(key);
      this.renderOres(ores);
    }
  }
}
```

## Performance Monitoring

### Metrics Collection

```typescript
class PerformanceMonitor {
  private metrics = {
    fps: new MovingAverage(60),
    frameTime: new MovingAverage(60),
    drawCalls: 0,
    cacheHits: 0,
    cacheMisses: 0
  };
  
  recordFrame(frameTime: number, drawCalls: number) {
    this.metrics.fps.add(1000 / frameTime);
    this.metrics.frameTime.add(frameTime);
    this.metrics.drawCalls = drawCalls;
  }
  
  getCacheHitRate(): number {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    return total > 0 ? this.metrics.cacheHits / total : 0;
  }
}
```

### Performance Budgets

```yaml
Frame Budget (16.67ms @ 60 FPS):
  - Input processing: < 1ms
  - Viewport calculation: < 1ms  
  - Chunk loading: < 3ms
  - Canvas rendering: < 8ms
  - UI updates: < 2ms
  - Buffer swap: < 1ms

Memory Budget:
  - Chunk data: < 50MB
  - Canvas cache: < 100MB
  - MegaTiles: < 50MB
  - UI/Other: < 50MB
  - Total: < 250MB
```

## Benchmarking

### Performance Test Suite

```typescript
describe('Rendering Performance', () => {
  test('maintains 60 FPS with 100 chunks', async () => {
    const renderer = new MinimapRenderer();
    const chunks = generateTestChunks(100);
    
    const frames: number[] = [];
    for (let i = 0; i < 600; i++) { // 10 seconds @ 60 FPS
      const start = performance.now();
      renderer.render(chunks);
      frames.push(performance.now() - start);
    }
    
    const avgFrameTime = average(frames);
    const avgFPS = 1000 / avgFrameTime;
    
    expect(avgFPS).toBeGreaterThan(55);
    expect(Math.max(...frames)).toBeLessThan(33); // No frame > 33ms
  });
});
```

### Load Testing

```typescript
async function stressTest() {
  const scenarios = [
    { name: 'Light', chunks: 50, players: 1 },
    { name: 'Medium', chunks: 200, players: 4 },
    { name: 'Heavy', chunks: 500, players: 10 },
    { name: 'Extreme', chunks: 1000, players: 20 }
  ];
  
  for (const scenario of scenarios) {
    console.log(`Testing ${scenario.name} load...`);
    const results = await runScenario(scenario);
    
    console.log(`
      Avg FPS: ${results.avgFPS}
      Memory: ${results.memoryMB}MB
      Network: ${results.messagesPerSec} msg/s
      CPU: ${results.cpuPercent}%
    `);
  }
}
```

## Best Practices

### Do's
- ✅ Profile before optimizing
- ✅ Set performance budgets
- ✅ Use browser DevTools
- ✅ Test on various hardware
- ✅ Monitor production metrics

### Don'ts
- ❌ Premature optimization
- ❌ Micro-optimizations without measurement
- ❌ Ignoring memory leaks
- ❌ Blocking the main thread
- ❌ Unlimited cache growth

## Future Optimizations

### WebGL Rendering
- 10x performance improvement potential
- GPU-based chunk rendering
- Instanced rendering for repeated elements

### Web Workers
- Offload chunk processing
- Parallel ore detection
- Background cache management

### WebAssembly
- Critical path optimization
- Complex algorithms in WASM
- Near-native performance

This performance architecture ensures the minimap system can handle large worlds efficiently while maintaining smooth 60 FPS rendering on typical hardware.