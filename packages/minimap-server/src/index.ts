import { io as ioClient } from "socket.io-client";
import { Server } from "socket.io";
import type {
  WebToMinimapEvents,
  MinimapToWebEvents,
  SocketData,
  ChunkData,
  ChunkResponse,
  InvalidateChunksData,
  BatchUpdateData,
  ChunkUpdateEntry,
  ChunkOreData,
  PlayerPosition
} from "@minecraft-bedrock-minimap/shared";
import PrismarineRegistry from 'prismarine-registry';
import PrismarineChunk, { type BedrockChunk } from 'prismarine-chunk';
import { config } from "./config.js";
import { ChunkCacheService } from "./services/chunk-cache.js";
import { ChunkProcessor } from "./services/chunk-processor.js";
import { ChunkUpdateBatcher } from "./services/chunk-update-batcher.js";
import { ClientStateManager } from "./services/client-state-manager.js";
import { PerformanceMonitor } from "./utils/performance-monitor.js";
import { BedrockWorld } from "./world/BedrockWorld.ts";

console.log(`🚀 Minimap Server starting...`);

// Connect to proxy server as client
const proxySocket = ioClient(config.proxyUrl, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity
});

// Health check for connection status
let lastConnectionState = false;
const healthCheckInterval = setInterval(() => {
  const currentState = proxySocket.connected;

  // Only emit status if state changed
  if (currentState !== lastConnectionState) {
    lastConnectionState = currentState;

    if (currentState) {
      console.log(`✅ Connected to proxy server`);
      // Subscribe to player updates
      proxySocket.emit("subscribe", "player_1");
    } else {
      console.log(`❌ Disconnected from proxy server`);
    }

    // Notify all web clients
    webServer.emit("connection-status", {
      connected: currentState,
      message: currentState ? "Connected to proxy server" : "Disconnected from proxy server"
    });
  }
}, 1000); // Check every second

// Create server for web clients
const webServer = new Server<WebToMinimapEvents, MinimapToWebEvents, {}, SocketData>(config.port, {
  cors: {
    origin: config.corsOrigins,
    credentials: true
  }
});

// Track socket cleanup functions
const socketCleanup = new Map<string, () => void>();
const registry = PrismarineRegistry(`bedrock_1.21.93`) as any;
const ChunkColumn = (PrismarineChunk as any)(registry as any) as typeof BedrockChunk;
const world = new BedrockWorld(null, null);

// Initialize chunk cache service
const chunkCache = new ChunkCacheService(config.cacheSize || 1000, world);
// Initialize chunk processor
const chunkProcessor = new ChunkProcessor();
// Initialize chunk update batcher
const chunkUpdateBatcher = new ChunkUpdateBatcher();
// Initialize client state manager
const clientStateManager = new ClientStateManager();
// Initialize performance monitor
const performanceMonitor = new PerformanceMonitor(chunkUpdateBatcher, clientStateManager, chunkCache);

// Start performance logging (every 60 seconds)
const stopPerfLogging = performanceMonitor.startPeriodicLogging(60000);
console.log("📊 Performance monitoring started (logs every 60 seconds)");

// Minimap state
let currentPlayerPosition: PlayerPosition = { x: 0, y: 64, z: 0, pitch: 0, yaw: 0 };
// Legacy minimapData removed

// Chunk storage for minimap generation
const chunkStorage = new Map<string, ChunkData>();
const oreChunkStorage = new Map<string, ChunkOreData>();

// Helper function to get chunk key
function getChunkKey(x: number, z: number): string {
  return `${x},${z}`;
}

// Helper function to generate batch IDs
function generateBatchId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

console.log(`📡 Connecting to proxy server at ${config.proxyUrl}`);
console.log(`🌐 Web server listening on port ${config.port}`);

// Connection handling is now done via health check interval

// Handle proxy server events
proxySocket.on("player-position", (data) => {
  const epsilon = 0.01;
  const positionChanged = Math.abs(currentPlayerPosition.x - data.x) > epsilon ||
    Math.abs(currentPlayerPosition.y - data.y) > epsilon ||
    Math.abs(currentPlayerPosition.z - data.z) > epsilon ||
    Math.abs(currentPlayerPosition.pitch - data.pitch) > epsilon ||
    Math.abs(currentPlayerPosition.yaw - data.yaw) > epsilon;

  if (positionChanged) {
    // Update current position with all coordinates
    currentPlayerPosition = {
      x: data.x,
      y: data.y,
      z: data.z,
      pitch: data.pitch,
      yaw: data.yaw
    };
  }

  // Get pending chunk updates from batcher
  const batchSize = parseInt(process.env.CHUNK_BATCH_SIZE || '50');
  const updates = chunkUpdateBatcher.getBatch(batchSize);

  // If we have updates or position changed, broadcast to all clients
  if (updates.length > 0 || positionChanged) {
    const batchData: BatchUpdateData = {
      updates: updates,
      playerPosition: {
        x: data.x,
        y: data.y,
        z: data.z,
        pitch: data.pitch,
        yaw: data.yaw
      },
      batchId: generateBatchId(),
      timestamp: Date.now()
    };

    // Broadcast to all connected clients
    webServer.emit('batch-update', batchData);

    // Track performance metrics
    if (updates.length > 0) {
      const estimatedBytes = JSON.stringify(batchData).length;
      const savedBytes = updates.length * 500; // Estimate 500 bytes per individual chunk event
      performanceMonitor.recordBatchSent(updates.length, savedBytes - estimatedBytes);
    }
  }
});

// Legacy chunkUpdate handler removed - chunks now come through chunk-data event

proxySocket.on("world-reset", () => {
  console.log(`🔄 World reset received`);

  // Clear all caches
  chunkCache.clear();
  chunkProcessor.clearCache();

  // Reset minimap state
  currentPlayerPosition = { x: 0, y: 64, z: 0, pitch: 0, yaw: 0 };
  chunkStorage.clear();
  // Notify web clients
  webServer.emit("player-move", currentPlayerPosition);
});

proxySocket.on("connection-status", (status) => {
  console.log(`📊 Connection status from proxy:`, status);

  // Forward to web clients
  webServer.emit("connection-status", {
    connected: status.connected,
    message: status.connected
      ? `Connected to game (Player: ${status.playerId})`
      : "Disconnected from game"
  });
});

// Handle chunk data responses from proxy
proxySocket.on("chunk-data", (chunks: ChunkResponse[]) => {
  for (const chunk of chunks) {
    chunkProcessor.invalidateChunks([{ x: chunk.chunkX, z: chunk.chunkZ }])
    chunkCache.set(chunk.chunkX, chunk.chunkZ, chunk);

    if (chunk.success && chunk.data) {
      const chunkJson = ChunkColumn.fromJson(chunk.data) as unknown as BedrockChunk;
      world.setColumn(chunk.chunkX, chunk.chunkZ, chunkJson);

      // Process chunk completely (colors + ores in one pass)
      const processed = chunkProcessor.processChunkComplete(chunk);

      if (processed.chunkData) {
        const processedData: ChunkData = {
          x: processed.chunkData.chunkX,
          z: processed.chunkData.chunkZ,
          colors: processed.chunkData.colors,
          heights: processed.chunkData.heights,
          ores: processed.oreData?.ores || []
        };

        // Always add to update batcher for proactive sending
        const chunkKey = getChunkKey(processed.chunkData.chunkX, processed.chunkData.chunkZ);
        chunkUpdateBatcher.addUpdate(chunkKey, processedData, 'full');

        // Store ore data separately for quick lookup if needed
        if (processed.oreData) {
          oreChunkStorage.set(getChunkKey(chunk.chunkX, chunk.chunkZ), processed.oreData);
        }
      } else if (chunkJson && (chunkJson as any).sections && (chunkJson as any).sections.length == 0) {
        const chunkKey = getChunkKey(chunk.chunkX, chunk.chunkZ);
        chunkCache.invalidate([{x: chunk.chunkX, z: chunk.chunkZ}])
        chunkProcessor.invalidateChunks([{ x: chunk.chunkX, z: chunk.chunkZ }])
        oreChunkStorage.delete(chunkKey);
        chunkUpdateBatcher.addUpdate(chunkKey, {
          x: chunk.chunkX,
          z: chunk.chunkZ,
          colors: [],
          heights: [],
          ores: []
        }, 'full');
      }
    }
  }
});

// Handle web client connections
webServer.on("connection", (socket) => {
  console.log(`✅ Web client connected: ${socket.id}`);

  // Add client to state manager for performance tracking
  clientStateManager.addClient(socket.id, socket.id);

  // Define cleanup function for this socket
  const cleanup = () => {
    socket.removeAllListeners();
    socketCleanup.delete(socket.id);
    clientStateManager.removeClient(socket.id);
  };
  socketCleanup.set(socket.id, cleanup);

  // Send current state to new client
  socket.emit("connection-status", {
    connected: true,
    message: "Connected to minimap server"
  });

  // Always emit player position
  socket.emit("player-move", currentPlayerPosition);

  // Send all cached chunks to new client as a batch update
  const allChunks: ChunkUpdateEntry[] = [];

  chunkCache.getCachedChunkKeys().forEach(key => {
    const [x, z] = key.split(',').map(Number);
    const cached = chunkCache.get(x, z);

    if (cached && cached.success && cached.data) {
      const processed = chunkProcessor.processChunkComplete(cached);

      if (processed.chunkData) {
        const chunkData: ChunkData = {
          x: processed.chunkData.chunkX,
          z: processed.chunkData.chunkZ,
          colors: processed.chunkData.colors,
          heights: processed.chunkData.heights,
          ores: processed.oreData?.ores || []
        };

        allChunks.push({
          chunk: chunkData,
          timestamp: Date.now(),
          updateType: 'full'
        });
      }
    }
  });

  if (allChunks.length > 0) {
    // Send initial chunks as a batch update
    const initialBatch: BatchUpdateData = {
      updates: allChunks,
      playerPosition: currentPlayerPosition,
      batchId: generateBatchId(),
      timestamp: Date.now()
    };

    socket.emit('batch-update', initialBatch);
    console.log(`✅ Sent ${allChunks.length} cached chunks to new client ${socket.id}`);
  }

  // Handle client events
  socket.on("minimap-click", (position) => {
    console.log(`🖱️  Minimap clicked at ${position.x}, ${position.y} by ${socket.id}`);

    // In a real implementation, this might teleport or focus the player
    // For now, just log it
  });

  // Handle disconnect
  socket.on("disconnect", (reason) => {
    console.log(`❌ Web client disconnected: ${socket.id} (${reason})`);
    // Execute cleanup
    const cleanupFn = socketCleanup.get(socket.id);
    if (cleanupFn) {
      cleanupFn();
    }
  });
});

// Legacy generateMinimapImage function removed - now handled by web client

// Graceful shutdown
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function shutdown() {
  console.log("\n🛑 Shutting down Minimap Server...");

  // Stop performance logging
  stopPerfLogging();
  console.log("📊 Final performance metrics:");
  console.log(performanceMonitor.getFormattedMetrics());

  // Clear health check interval
  clearInterval(healthCheckInterval);

  // Cleanup all socket connections
  console.log(`🧹 Cleaning up ${socketCleanup.size} socket connections...`);
  socketCleanup.forEach(cleanup => cleanup());

  // Disconnect from proxy
  proxySocket.disconnect();

  // Close web server
  await new Promise<void>((resolve) => {
    webServer.close(() => {
      console.log("✅ Web server closed");
      resolve();
    });
  });

  process.exit(0);
}

console.log(`✅ Minimap Server ready - Web clients can connect on port ${config.port}`);