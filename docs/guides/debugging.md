# Debugging Guide

This guide covers debugging techniques and tools for troubleshooting issues in the Minecraft Bedrock Minimap system.

## Debugging Tools

### Browser DevTools

#### Chrome DevTools
Essential for web client debugging:

```bash
# Open web client
http://localhost:5173

# Press F12 or Ctrl+Shift+I
# Key tabs:
# - Console: JavaScript errors and logs
# - Network: Socket.io connections
# - Performance: Rendering performance
# - Memory: Memory usage and leaks
```

#### Network Tab
Monitor Socket.io communication:
1. Refresh page with DevTools open
2. Look for `socket.io` requests
3. Check WebSocket frames for event data

#### Performance Tab
Profile rendering performance:
1. Click Record
2. Interact with minimap (pan, zoom)
3. Stop recording
4. Analyze frame drops and function calls

### Node.js Debugging

#### Debug with VS Code
```json
// .vscode/launch.json
{
  "configurations": [
    {
      "name": "Debug Proxy Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/packages/bedrock-proxy-server/src/index.ts",
      "runtimeArgs": ["--loader", "tsx/esm"],
      "stopOnEntry": false,
      "console": "integratedTerminal"
    }
  ]
}
```

#### Command Line Debugging
```bash
# Debug with Node.js inspector
node --inspect-brk --loader tsx/esm packages/bedrock-proxy-server/src/index.ts

# Open Chrome to chrome://inspect
# Click "Open dedicated DevTools for Node"
```

### Socket.io Debugging

#### Enable Debug Logging
```bash
# Server-side (Node.js)
DEBUG=socket.io* npm run dev:minimap

# Client-side (Browser console)
localStorage.debug = 'socket.io-client:*';
```

#### Socket.io Admin UI
```typescript
// Add to development server
import { instrument } from '@socket.io/admin-ui';

instrument(io, {
  auth: false,
  mode: 'development'
});

// Open http://localhost:3002/admin
```

## Common Issues and Solutions

### Connection Problems

#### Socket.io Connection Failures

**Symptoms**:
- "Connection failed" in console
- No chunk updates
- Empty minimap

**Debugging Steps**:
```bash
# 1. Check if servers are running
curl http://localhost:3001/socket.io/
curl http://localhost:3002/socket.io/

# 2. Verify CORS settings
# Check CORS_ORIGINS environment variable

# 3. Test with different transports
const socket = io('http://localhost:3002', {
  transports: ['websocket', 'polling']
});

# 4. Enable verbose logging
DEBUG=socket.io* npm run dev:minimap
```

**Common Fixes**:
```javascript
// Fix CORS issues
io(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Force websocket transport
const socket = io('http://localhost:3002', {
  transports: ['websocket']
});
```

#### Minecraft Connection Issues

**Symptoms**:
- "Cannot connect to Minecraft server"
- Proxy server errors

**Debugging Steps**:
```bash
# 1. Test direct connection to Minecraft
telnet your.minecraft.server.com 19132

# 2. Check firewall rules
# Allow ports 3001, 3002, 19134

# 3. Verify environment variables
echo $MC_SERVER_HOST
echo $MC_SERVER_PORT

# 4. Test with local server
MC_SERVER_HOST=127.0.0.1 npm run dev:proxy
```

### Rendering Issues

#### Empty or Black Minimap

**Debugging Checklist**:
```javascript
// 1. Check chunk data in console
socket.on('batch-update', (data) => {
  console.log('Chunks received:', data.chunks.length);
  console.log('Sample chunk:', data.chunks[0]);
});

// 2. Verify canvas context
const canvas = document.getElementById('minimap-canvas');
const ctx = canvas.getContext('2d');
console.log('Canvas context:', ctx);

// 3. Check rendering calls
console.log('Rendering chunks:', visibleChunks.size);

// 4. Verify chunk colors
chunks.forEach(chunk => {
  if (!chunk.colors || chunk.colors.length !== 16) {
    console.error('Invalid chunk colors:', chunk);
  }
});
```

#### Performance Issues

**Frame Rate Debugging**:
```javascript
// Monitor FPS
let lastTime = 0;
let frameCount = 0;

function render(currentTime) {
  frameCount++;
  
  if (currentTime - lastTime >= 1000) {
    console.log(`FPS: ${frameCount}`);
    frameCount = 0;
    lastTime = currentTime;
  }
  
  requestAnimationFrame(render);
}
```

**Memory Usage Monitoring**:
```javascript
// Check memory usage
setInterval(() => {
  if (performance.memory) {
    console.log({
      used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
      total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
      limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
    });
  }
}, 5000);
```

### Data Processing Issues

#### Chunk Processing Errors

**Debug Chunk Pipeline**:
```typescript
// Add logging to chunk processing
function processChunk(rawChunk: any): ChunkData {
  console.log('Processing chunk:', rawChunk.x, rawChunk.z);
  
  try {
    const processed = convertToChunkData(rawChunk);
    console.log('Processed successfully:', processed.colors.length);
    return processed;
  } catch (error) {
    console.error('Chunk processing failed:', error);
    console.log('Raw chunk data:', rawChunk);
    throw error;
  }
}
```

#### Ore Detection Issues

**Debug Ore Processing**:
```typescript
// Verify ore detection
function debugOreDetection(chunk: ChunkData) {
  console.log('Checking ores for chunk:', chunk.x, chunk.z);
  
  if (chunk.ores) {
    console.log('Found ores:', chunk.ores.length);
    chunk.ores.forEach(ore => {
      console.log(`${ore.oreType} at Y=${ore.y}`);
    });
  } else {
    console.log('No ores found');
  }
}
```

## Logging and Monitoring

### Structured Logging

```typescript
// Create logger utility
class Logger {
  private context: string;
  
  constructor(context: string) {
    this.context = context;
  }
  
  info(message: string, data?: any) {
    console.log(`[${this.context}] ${message}`, data);
  }
  
  error(message: string, error?: Error) {
    console.error(`[${this.context}] ${message}`, error);
  }
  
  debug(message: string, data?: any) {
    if (process.env.DEBUG) {
      console.debug(`[${this.context}] ${message}`, data);
    }
  }
}

// Usage
const logger = new Logger('ChunkProcessor');
logger.info('Processing chunk', { x: 10, z: 5 });
```

### Performance Metrics

```typescript
// Performance monitoring utility
class PerformanceMonitor {
  private metrics = new Map<string, number[]>();
  
  time(label: string): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.addMetric(label, duration);
    };
  }
  
  addMetric(label: string, value: number) {
    if (!this.metrics.has(label)) {
      this.metrics.set(label, []);
    }
    this.metrics.get(label)!.push(value);
  }
  
  getAverages() {
    const averages: Record<string, number> = {};
    
    for (const [label, values] of this.metrics) {
      averages[label] = values.reduce((a, b) => a + b) / values.length;
    }
    
    return averages;
  }
}

// Usage
const monitor = new PerformanceMonitor();
const endTiming = monitor.time('chunk-processing');
// ... processing logic
endTiming();
```

## Advanced Debugging Techniques

### Packet Inspection

#### Minecraft Protocol Debugging
```typescript
// Log all packets in proxy server
relay.on('packet', (packet, client) => {
  if (packet.name === 'level_chunk') {
    console.log('Level chunk packet:', {
      chunkX: packet.params.x,
      chunkZ: packet.params.z,
      dataSize: packet.params.payload?.length
    });
  }
});
```

#### Socket.io Event Debugging
```typescript
// Log all Socket.io events
const originalEmit = socket.emit;
socket.emit = function(event, ...args) {
  console.log('Emitting:', event, args);
  return originalEmit.apply(this, [event, ...args]);
};

const originalOn = socket.on;
socket.on = function(event, handler) {
  return originalOn.call(this, event, (...args) => {
    console.log('Received:', event, args);
    return handler(...args);
  });
};
```

### Memory Debugging

#### Chunk Cache Analysis
```typescript
// Monitor cache efficiency
class CacheDebugger {
  private hits = 0;
  private misses = 0;
  
  recordHit() { this.hits++; }
  recordMiss() { this.misses++; }
  
  getStats() {
    const total = this.hits + this.misses;
    return {
      hitRate: total > 0 ? (this.hits / total) * 100 : 0,
      total,
      hits: this.hits,
      misses: this.misses
    };
  }
}
```

#### Memory Leak Detection
```typescript
// Track object creation
const objectCounts = new Map<string, number>();

function trackObject(type: string) {
  objectCounts.set(type, (objectCounts.get(type) || 0) + 1);
}

function releaseObject(type: string) {
  const count = objectCounts.get(type) || 0;
  objectCounts.set(type, Math.max(0, count - 1));
}

// Monitor growth
setInterval(() => {
  console.log('Object counts:', Object.fromEntries(objectCounts));
}, 10000);
```

## Testing and Reproduction

### Creating Minimal Reproductions

```typescript
// Minimal Socket.io test
import { io } from 'socket.io-client';

const socket = io('http://localhost:3002');

socket.on('connect', () => {
  console.log('Connected!');
  socket.emit('test-event', { data: 'test' });
});

socket.on('connect_error', (error) => {
  console.error('Connection failed:', error);
});
```

### Automated Testing for Debugging

```typescript
// Automated debugging test
describe('Chunk Processing Debug', () => {
  test('should process valid chunk data', () => {
    const mockChunk = createMockChunk();
    const result = processChunk(mockChunk);
    
    expect(result.colors).toBeDefined();
    expect(result.colors.length).toBe(16);
    expect(result.colors[0].length).toBe(16);
  });
  
  test('should handle invalid chunk data gracefully', () => {
    const invalidChunk = { invalid: 'data' };
    
    expect(() => processChunk(invalidChunk))
      .toThrow('Invalid chunk format');
  });
});
```

## Debug Configuration

### Environment Variables

```bash
# Enable all debug output
DEBUG=*

# Specific components
DEBUG=socket.io*,minimap:*,proxy:*

# Performance debugging
NODE_ENV=development
ENABLE_PERFORMANCE_MONITORING=true

# Memory debugging
NODE_OPTIONS="--max-old-space-size=4096 --inspect"
```

### Debug Build Configuration

```typescript
// webpack.config.js or vite.config.ts
export default {
  define: {
    __DEBUG__: process.env.NODE_ENV === 'development',
    __VERSION__: JSON.stringify(process.env.npm_package_version)
  }
};

// Usage in code
if (__DEBUG__) {
  console.log('Debug information');
}
```

Effective debugging requires a systematic approach combining the right tools, logging strategies, and reproduction techniques. This guide provides the foundation for diagnosing and resolving issues across the entire minimap system.