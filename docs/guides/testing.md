# Testing Guide

This guide covers testing strategies, tools, and best practices for the Minecraft Bedrock Minimap project.

## Testing Strategy

### Testing Pyramid

```
    ┌─────────────┐
    │     E2E     │  Few, High-Value
    │   Tests     │
    ├─────────────┤
    │ Integration │  Some, Key Paths
    │   Tests     │
    ├─────────────┤
    │    Unit     │  Many, Fast
    │   Tests     │
    └─────────────┘
```

### Test Categories

1. **Unit Tests**: Individual functions and components
2. **Integration Tests**: Component interactions
3. **E2E Tests**: Complete user workflows
4. **Performance Tests**: Load and stress testing

## Test Setup

### Prerequisites

```bash
# Install test dependencies
npm install --save-dev \
  jest \
  @types/jest \
  supertest \
  @testing-library/dom \
  @testing-library/user-event \
  playwright
```

### Jest Configuration

```javascript
// jest.config.js
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/index.ts'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};
```

## Unit Testing

### Testing Utilities

```typescript
// __tests__/utils/test-helpers.ts
import { ChunkData, PlayerPosition } from '@minecraft-bedrock-minimap/shared';

export function createMockChunk(x = 0, z = 0): ChunkData {
  return {
    x,
    z,
    colors: Array(16).fill(null).map(() => 
      Array(16).fill('#7F7F7F')
    ),
    heights: Array(16).fill(null).map(() => 
      Array(16).fill(64)
    ),
    dimension: 0
  };
}

export function createMockPlayer(): PlayerPosition {
  return {
    x: 0,
    y: 64,
    z: 0,
    pitch: 0,
    yaw: 0
  };
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Testing Shared Utilities

```typescript
// packages/shared/__tests__/ore-utils.test.ts
import {
  isOreBlock,
  getOreType,
  canOreSpawnAtY,
  getOresAtY
} from '../src/ore-utils';

describe('Ore Utilities', () => {
  describe('isOreBlock', () => {
    test('should identify ore blocks correctly', () => {
      expect(isOreBlock('minecraft:diamond_ore')).toBe(true);
      expect(isOreBlock('minecraft:deepslate_diamond_ore')).toBe(true);
      expect(isOreBlock('minecraft:stone')).toBe(false);
    });

    test('should handle blocks without namespace', () => {
      expect(isOreBlock('diamond_ore')).toBe(true);
      expect(isOreBlock('stone')).toBe(false);
    });
  });

  describe('canOreSpawnAtY', () => {
    test('should validate Y-level ranges correctly', () => {
      expect(canOreSpawnAtY('diamond', -59)).toBe(true);
      expect(canOreSpawnAtY('diamond', 20)).toBe(false);
      expect(canOreSpawnAtY('emerald', 236)).toBe(true);
    });
  });

  describe('getOresAtY', () => {
    test('should return ores that spawn at given Y-level', () => {
      const oresAtBedrock = getOresAtY(-64);
      expect(oresAtBedrock).toContain('diamond');
      expect(oresAtBedrock).toContain('redstone');
      
      const oresAtSurface = getOresAtY(64);
      expect(oresAtSurface).toContain('coal');
      expect(oresAtSurface).toContain('iron');
    });
  });
});
```

### Testing Coordinate Utilities

```typescript
// packages/shared/__tests__/chunk-coords.test.ts
import {
  worldToChunkCoords,
  chunkCoordsToKey,
  getAffectedChunks
} from '../src/utils/chunk-coords';

describe('Chunk Coordinates', () => {
  describe('worldToChunkCoords', () => {
    test('should convert positive coordinates correctly', () => {
      expect(worldToChunkCoords(0, 0)).toEqual({ chunkX: 0, chunkZ: 0 });
      expect(worldToChunkCoords(15, 15)).toEqual({ chunkX: 0, chunkZ: 0 });
      expect(worldToChunkCoords(16, 16)).toEqual({ chunkX: 1, chunkZ: 1 });
    });

    test('should handle negative coordinates', () => {
      expect(worldToChunkCoords(-1, -1)).toEqual({ chunkX: -1, chunkZ: -1 });
      expect(worldToChunkCoords(-16, -16)).toEqual({ chunkX: -1, chunkZ: -1 });
      expect(worldToChunkCoords(-17, -17)).toEqual({ chunkX: -2, chunkZ: -2 });
    });
  });

  describe('getAffectedChunks', () => {
    test('should return single chunk for interior blocks', () => {
      const chunks = getAffectedChunks(5, 5);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({ chunkX: 0, chunkZ: 0 });
    });

    test('should return multiple chunks for boundary blocks', () => {
      const chunks = getAffectedChunks(0, 0);
      expect(chunks.length).toBeGreaterThan(1);
      
      // Should include chunk (0,0) and adjacent chunks
      const chunkKeys = chunks.map(c => `${c.chunkX},${c.chunkZ}`);
      expect(chunkKeys).toContain('0,0');
      expect(chunkKeys).toContain('-1,-1');
    });
  });
});
```

## Integration Testing

### Socket.io Testing

```typescript
// packages/minimap-server/__tests__/socket-integration.test.ts
import { Server } from 'socket.io';
import { io as Client, Socket } from 'socket.io-client';
import { createServer } from 'http';
import { AddressInfo } from 'net';

describe('Socket.io Integration', () => {
  let server: Server;
  let clientSocket: Socket;
  let port: number;

  beforeEach((done) => {
    const httpServer = createServer();
    server = new Server(httpServer);
    
    httpServer.listen(() => {
      port = (httpServer.address() as AddressInfo).port;
      clientSocket = Client(`http://localhost:${port}`);
      
      server.on('connection', (socket) => {
        socket.on('test-event', (data) => {
          socket.emit('test-response', { received: data });
        });
      });
      
      clientSocket.on('connect', done);
    });
  });

  afterEach(() => {
    server.close();
    clientSocket.close();
  });

  test('should exchange messages correctly', (done) => {
    clientSocket.emit('test-event', { message: 'hello' });
    
    clientSocket.on('test-response', (data) => {
      expect(data.received.message).toBe('hello');
      done();
    });
  });

  test('should handle batch updates', (done) => {
    const mockBatch = {
      chunks: [createMockChunk(0, 0), createMockChunk(1, 0)],
      timestamp: Date.now(),
      batchId: 'test-batch'
    };

    clientSocket.emit('batch-update', mockBatch);
    
    clientSocket.on('chunks-processed', (response) => {
      expect(response.processed).toBe(2);
      expect(response.batchId).toBe('test-batch');
      done();
    });
  });
});
```

### API Testing

```typescript
// packages/bedrock-proxy-server/__tests__/api.test.ts
import request from 'supertest';
import { app } from '../src/app';

describe('Proxy Server API', () => {
  test('should return health status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({
      status: 'healthy',
      uptime: expect.any(Number),
      timestamp: expect.any(String)
    });
  });

  test('should handle chunk requests', async () => {
    const response = await request(app)
      .post('/api/chunks')
      .send({
        chunks: [{ x: 0, z: 0, dimension: 0 }]
      })
      .expect(200);

    expect(response.body.chunks).toBeDefined();
    expect(Array.isArray(response.body.chunks)).toBe(true);
  });
});
```

## Component Testing

### React Component Testing (if using React)

```typescript
// packages/minimap-web-server/__tests__/components/OreSettings.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { OreDetectionSettings } from '../src/ui/ore-detection-settings';

describe('OreDetectionSettings Component', () => {
  const defaultConfig = {
    enabled: true,
    scanYOffset: 30,
    highlightStyle: 'bright' as const,
    oreTypes: {
      diamond: { enabled: true, color: '#00FFFF', priority: 1 }
    }
  };

  test('should render with default configuration', () => {
    render(
      <OreDetectionSettings 
        config={defaultConfig}
        onChange={() => {}}
      />
    );

    expect(screen.getByText('Ore Detection')).toBeInTheDocument();
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();
  });

  test('should call onChange when settings are modified', () => {
    const mockOnChange = jest.fn();
    
    render(
      <OreDetectionSettings 
        config={defaultConfig}
        onChange={mockOnChange}
      />
    );

    const enabledCheckbox = screen.getByRole('checkbox', { name: /enabled/i });
    fireEvent.click(enabledCheckbox);

    expect(mockOnChange).toHaveBeenCalledWith({
      ...defaultConfig,
      enabled: false
    });
  });
});
```

### Canvas Testing

```typescript
// packages/minimap-web-server/__tests__/rendering/ChunkRenderer.test.ts
import { ChunkRenderer } from '../src/rendering/ChunkRenderer';
import { createMockChunk } from '../../__tests__/utils/test-helpers';

// Mock HTMLCanvasElement
class MockCanvas {
  private context = {
    fillStyle: '',
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    getImageData: jest.fn(() => ({
      data: new Uint8ClampedArray(64)
    }))
  };

  getContext() {
    return this.context;
  }

  get width() { return 64; }
  get height() { return 64; }
}

global.HTMLCanvasElement = MockCanvas as any;
global.document.createElement = jest.fn(() => new MockCanvas());

describe('ChunkRenderer', () => {
  let renderer: ChunkRenderer;

  beforeEach(() => {
    renderer = new ChunkRenderer();
  });

  test('should render chunk without errors', () => {
    const chunk = createMockChunk(0, 0);
    const canvas = renderer.renderChunk(chunk, 4);

    expect(canvas).toBeDefined();
    expect(canvas.width).toBe(64); // 16 blocks * 4 pixels
    expect(canvas.height).toBe(64);
  });

  test('should handle empty chunks gracefully', () => {
    const emptyChunk = {
      ...createMockChunk(0, 0),
      colors: []
    };

    expect(() => renderer.renderChunk(emptyChunk, 4)).not.toThrow();
  });
});
```

## Performance Testing

### Load Testing

```typescript
// __tests__/performance/load.test.ts
import { io } from 'socket.io-client';

describe('Load Testing', () => {
  test('should handle multiple concurrent connections', async () => {
    const connectionCount = 50;
    const connections: Socket[] = [];

    // Create multiple connections
    for (let i = 0; i < connectionCount; i++) {
      const socket = io('http://localhost:3002');
      connections.push(socket);
    }

    // Wait for all connections
    await Promise.all(
      connections.map(socket => 
        new Promise(resolve => socket.on('connect', resolve))
      )
    );

    // Simulate chunk requests
    const promises = connections.map(socket =>
      new Promise(resolve => {
        socket.emit('request-initial-chunks');
        socket.on('batch-update', resolve);
      })
    );

    const start = Date.now();
    await Promise.all(promises);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(5000); // Should complete in 5 seconds

    // Cleanup
    connections.forEach(socket => socket.close());
  });
});
```

### Memory Testing

```typescript
// __tests__/performance/memory.test.ts
describe('Memory Usage', () => {
  test('should not leak memory during chunk processing', () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Process many chunks
    for (let i = 0; i < 1000; i++) {
      const chunk = createMockChunk(i, i);
      processChunk(chunk);
    }

    // Force garbage collection
    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    // Should not increase by more than 50MB
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
  });
});
```

## End-to-End Testing

### Playwright E2E Tests

```typescript
// __tests__/e2e/minimap.spec.ts
import { test, expect, Page } from '@playwright/test';

test.describe('Minimap E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
  });

  test('should display minimap canvas', async ({ page }) => {
    const canvas = page.locator('#minimap-canvas');
    await expect(canvas).toBeVisible();
  });

  test('should show player position', async ({ page }) => {
    const playerMarker = page.locator('.player-marker');
    await expect(playerMarker).toBeVisible();
  });

  test('should handle zoom controls', async ({ page }) => {
    const zoomIn = page.locator('[data-testid="zoom-in"]');
    const zoomOut = page.locator('[data-testid="zoom-out"]');

    await zoomIn.click();
    await expect(page.locator('[data-testid="zoom-level"]')).toHaveText('2x');

    await zoomOut.click();
    await expect(page.locator('[data-testid="zoom-level"]')).toHaveText('1x');
  });

  test('should toggle ore detection', async ({ page }) => {
    const oreToggle = page.locator('[data-testid="ore-detection-toggle"]');
    
    await oreToggle.click();
    await expect(page.locator('.ore-settings')).toBeVisible();

    await oreToggle.click();
    await expect(page.locator('.ore-settings')).not.toBeVisible();
  });
});
```

## Test Execution

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests for specific package
npm test --workspace packages/shared

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run performance tests
npm run test:performance
```

### CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm test
      
      - name: Run E2E tests
        run: npm run test:e2e
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Test Best Practices

### Writing Good Tests

```typescript
// ✅ Good test structure
describe('ChunkProcessor', () => {
  // Arrange
  const processor = new ChunkProcessor();
  const mockChunk = createMockChunk();

  // Act
  const result = processor.process(mockChunk);

  // Assert
  expect(result.colors).toBeDefined();
  expect(result.colors.length).toBe(16);
});

// ❌ Avoid unclear tests
test('test chunk', () => {
  const chunk = { x: 0, z: 0 };
  expect(processChunk(chunk)).toBeTruthy();
});
```

### Test Organization

- **Group related tests** with `describe` blocks
- **Use descriptive test names** that explain behavior
- **Follow AAA pattern**: Arrange, Act, Assert
- **Mock external dependencies** appropriately
- **Test edge cases** and error conditions

### Mock Strategies

```typescript
// Mock external services
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn()
  }))
}));

// Mock environment variables
const OLD_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...OLD_ENV };
});

afterEach(() => {
  process.env = OLD_ENV;
});
```

This comprehensive testing approach ensures code quality, prevents regressions, and builds confidence in the minimap system's reliability and performance.