import { Server } from "socket.io";
import { PacketDumpReader } from "./utils/packet-dump-reader.ts";
import { PacketSimulator } from "./services/packet-simulator.js";
import type {
  MinimapToProxyEvents,
  ProxyToMinimapEvents,
  SocketData,
  PlayerPosition,
  ChunkData,
  InvalidateChunksData,
  ChunkCoordinate,
  BedrockClient
} from "@minecraft-bedrock-minimap/shared";
import { chunkCoordsToKey, getAffectedChunks, type ChunkRequest } from "@minecraft-bedrock-minimap/shared";
import { config } from "./config.js";
import { ChunkService } from "./services/chunk-service.js";
import { WorldHandler } from "./world/WorldHandler.ts";
import EventEmitter from "events";
import { BedrockWorld } from "./world/BedrockWorld.ts";
import { Relay } from "bedrock-protocol";
import { createLogger } from "./utils/logger.js";
import { SettingsLoader } from "./settings-loader.js";

// Create logger
const logger = createLogger("ProxyServer");

// Create Socket.io server with typed events
const io = new Server<MinimapToProxyEvents, ProxyToMinimapEvents, {}, SocketData>(config.port, {
  cors: {
    origin: config.corsOrigins,
    credentials: true
  }
});

// Initialize relay only if enabled
let relay: any = null;
if (config.settingsLoader.isRelayEnabled()) {
  relay = new Relay(config.settingsLoader.getRelayConfig() as any);
}


// Track connected minimap servers
const connectedClients = new Map<string, SocketData>();

// Track socket cleanup functions
const socketCleanup = new Map<string, () => void>();

// Packet simulator instance will be initialized after server setup
let packetSimulator: PacketSimulator;

// Initialize ChunkService
const world = new BedrockWorld(null, null);
const worldHandler = new WorldHandler(
  new EventEmitter() as BedrockClient,
  world,
  config.proxySettings.minecraft.version,
  async (chunkX: number, chunkZ: number) => {
    try {
      const chunkResponses = await chunkService.processChunkRequests([{ chunkX, chunkZ }]);
      io.emit("chunk-data", chunkResponses);
    }
    catch (error) {
      console.error(`❌ Error getting column ${chunkX},${chunkZ}:`, error);
    }
  }
);
const chunkService = new ChunkService(config.proxySettings.minecraft.version, world);

// Simulated player data for testing
let playerPosition: PlayerPosition = { x: 0, y: 64, z: 0, pitch: 0, yaw: 0 };

console.log(`🚀 Bedrock Proxy Server starting on port ${config.port}`);
console.log(`📡 Accepting connections from: ${config.corsOrigins.join(", ")}`);

// Log loaded settings
config.settingsLoader.logSettings();

io.on("connection", (socket) => {
  console.log(`✅ Minimap server connected: ${socket.id}`);

  // Store client data
  const clientData: SocketData = {
    clientId: socket.id,
    connectionTime: new Date()
  };
  connectedClients.set(socket.id, clientData);

  // Define cleanup function for this socket
  const cleanup = () => {
    socket.removeAllListeners();
    connectedClients.delete(socket.id);
    socketCleanup.delete(socket.id);
  };
  socketCleanup.set(socket.id, cleanup);

  // Send initial connection status
  socket.emit("connection-status", {
    connected: true,
    playerId: `player_${socket.id.substring(0, 8)}`
  });

  // Handle subscription to player updates
  socket.on("subscribe", (playerId) => {
    console.log(`📊 Client ${socket.id} subscribed to player ${playerId}`);
    clientData.playerId = playerId;
    socket.emit("player-position", playerPosition);
  });

  // Handle unsubscribe
  socket.on("unsubscribe", (playerId) => {
    console.log(`🚫 Client ${socket.id} unsubscribed from player ${playerId}`);
  });


  // Handle disconnect
  socket.on("disconnect", (reason) => {
    console.log(`❌ Minimap server disconnected: ${socket.id} (${reason})`);

    // Execute cleanup
    const cleanupFn = socketCleanup.get(socket.id);
    if (cleanupFn) {
      cleanupFn();
    }
  });

  // Error handling
  socket.on("error", (error) => {
    console.error(`⚠️  Socket error for ${socket.id}:`, error);
  });
});

// Graceful shutdown
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Configuration reload handler (SIGHUP)
process.on("SIGHUP", () => {
  logger.info("Received SIGHUP, reloading configuration...");
  reloadConfiguration();
});

function reloadConfiguration() {
  try {
    // Reload settings from environment variables
    const newSettingsLoader = new SettingsLoader();
    
    // Update runtime settings that can be changed without restart
    updateRuntimeSettings(newSettingsLoader);
    
    logger.info("Configuration reloaded successfully");
  } catch (error) {
    logger.error("Failed to reload configuration:", error);
  }
}

function updateRuntimeSettings(newSettingsLoader: any) {
  // Update settings that can be changed without full restart
  const newSettings = newSettingsLoader.getSettings();
  const currentSettings = config.settingsLoader.getSettings();
  
  // Update debug logging
  if (newSettings.advanced.enableDebugLogging !== currentSettings.advanced.enableDebugLogging) {
    config.proxySettings.advanced.enableDebugLogging = newSettings.advanced.enableDebugLogging;
    logger.info(`Debug logging ${newSettings.advanced.enableDebugLogging ? 'enabled' : 'disabled'}`);
  }
  
  // Update performance settings
  if (newSettings.performance.enableChunkCaching !== currentSettings.performance.enableChunkCaching) {
    config.proxySettings.performance.enableChunkCaching = newSettings.performance.enableChunkCaching;
    logger.info(`Chunk caching ${newSettings.performance.enableChunkCaching ? 'enabled' : 'disabled'}`);
  }
  
  // Note: Some settings like ports, relay enable/disable, and server hosts require full restart
  // Log if such settings have changed
  if (newSettings.relay.enabled !== currentSettings.relay.enabled ||
      newSettings.relay.host !== currentSettings.relay.host ||
      newSettings.relay.port !== currentSettings.relay.port ||
      newSettings.minecraft.serverHost !== currentSettings.minecraft.serverHost ||
      newSettings.minecraft.serverPort !== currentSettings.minecraft.serverPort) {
    logger.warn("Some settings (relay, ports, hosts) require a full restart to take effect");
  }
}

async function shutdown() {
  console.log("\n🛑 Shutting down Bedrock Proxy Server...");

  // Stop packet simulator
  // if (packetSimulator?.isRunning()) {
  //   console.log("🛑 Stopping packet simulator...");
  //   packetSimulator.stop();
  // }

  if(relay) {
    console.log("🛑 Closing relay connection...");
    relay.close();
  }

  // Cleanup all socket connections
  console.log(`🧹 Cleaning up ${socketCleanup.size} socket connections...`);
  socketCleanup.forEach(cleanup => cleanup());

  // Cleanup world resources
  if (worldHandler) {
    console.log("🌍 Cleaning up world handler...");
    worldHandler.cleanup();
  }

  // Cleanup world
  if (world) {
    console.log("🗺️ Cleaning up world data...");
    await world.cleanup();
  }

  // Close Socket.io server
  await new Promise<void>((resolve) => {
    io.close(() => {
      console.log("✅ Socket.io server closed");
      resolve();
    });
  });

  process.exit(0);
}

console.log(`✅ Bedrock Proxy Server listening on port ${config.port}`);

// // Create packet simulator
// packetSimulator = new PacketSimulator();

// // Handle packet events
// packetSimulator.on('packet', async (packet) => {
//   if (packet.type === 'C') {
//     switch (packet.data.data.name) {
//       case "join":
//         worldHandler.handle_join_packet();
//         break;
//       case "start_game":
//         worldHandler.registry.handleStartGame({ ...packet.data.data.params, itemstates: [] });
//         break;
//       case "client_cache_miss_response":
//         worldHandler.on_client_cache_miss_response(packet.data.data.params);
//         break;
//       case "level_chunk":
//         await worldHandler.on_level_chunk(packet.data.data.params);
//         break;
//       case "subchunk":
//         await worldHandler.on_subchunk(packet.data.data.params);

//         const entries = packet.data.data.params.entries;
//         const origin = packet.data.data.params.origin;
//         const chunkRequestsMap = new Map<string, ChunkRequest>();

//         for (const entry of entries) {
//           const chunkX = origin.x + entry.dx;
//           const chunkZ = origin.z + entry.dz;
//           const key = `${chunkX},${chunkZ}`;
//           if (!chunkRequestsMap.has(key)) {
//             chunkRequestsMap.set(key, { chunkX, chunkZ });
//           }
//         }

//         const chunkResponses = await chunkService.processChunkRequests(Array.from(chunkRequestsMap.values()));
//         io.emit("chunk-data", chunkResponses);

//         break;
//       case "update_block":
//         worldHandler.on_update_block(packet.data.data.params, async () => {
//           const { x, y, z } = packet.data.data.params.position;
//           const affectedChunks = getAffectedChunks(x, z);

//           const chunkRequestsMap = new Map<string, ChunkRequest>();
//           for (const entry of affectedChunks) {
//             const chunkX = entry.x;
//             const chunkZ = entry.z;
//             const key = `${chunkX},${chunkZ}`;
//             if (!chunkRequestsMap.has(key)) {
//               chunkRequestsMap.set(key, { chunkX, chunkZ });
//             }
//           }

//           const chunkResponses = await chunkService.processChunkRequests(Array.from(chunkRequestsMap.values()));
//           io.emit("chunk-data", chunkResponses);
//         });
//         break;
//     }
//   } else if (packet.type === 'S' && packet.data.data.name === "player_auth_input") {
//     playerPosition = {
//       x: packet.data.data.params.position.x,
//       y: packet.data.data.params.position.y,
//       z: packet.data.data.params.position.z,
//       pitch: packet.data.data.params.pitch,
//       yaw: packet.data.data.params.yaw,
//     };

//     io.emit("player-position", playerPosition);
//   }



// });

// // Handle simulation complete
// packetSimulator.on('complete', () => {
//   console.log("🎬 Packet simulation complete");
// });

// // Start the simulation
// packetSimulator.start('dumps/1.21.93-1752173152902.bin').catch(error => {
//   console.error("❌ Failed to start packet simulation:", error);
//   shutdown();
// });





if (relay) {
  relay.on('connect', (player: any) => {
  player.on('clientbound', async (_: any, des: any) => {
    switch (des.data.name) {
      case "join":
        worldHandler.handle_join_packet();
        break;
      case "start_game":
        worldHandler.registry.handleStartGame({ ...des.data.params, itemstates: [] });
        break;
      case "client_cache_miss_response":
        worldHandler.on_client_cache_miss_response(des.data.params);
        break;
      case "level_chunk":
        await worldHandler.on_level_chunk(des.data.params);
        break;
      case "subchunk":
        await worldHandler.on_subchunk(des.data.params);

        const entries = des.data.params.entries;
        const origin = des.data.params.origin;
        const chunkRequestsMap = new Map<string, ChunkRequest>();

        for (const entry of entries) {
          const chunkX = origin.x + entry.dx;
          const chunkZ = origin.z + entry.dz;
          const key = `${chunkX},${chunkZ}`;
          if (!chunkRequestsMap.has(key)) {
            chunkRequestsMap.set(key, { chunkX, chunkZ });
          }
        }

        const chunkResponses = await chunkService.processChunkRequests(Array.from(chunkRequestsMap.values()));
        io.emit("chunk-data", chunkResponses);

        break;
      case "update_block":
        worldHandler.on_update_block(des.data.params, async () => {
          const { x, y, z } = des.data.params.position;
          const affectedChunks = getAffectedChunks(x, z);

          const chunkRequestsMap = new Map<string, ChunkRequest>();
          for (const entry of affectedChunks) {
            const chunkX = entry.x;
            const chunkZ = entry.z;
            const key = `${chunkX},${chunkZ}`;
            if (!chunkRequestsMap.has(key)) {
              chunkRequestsMap.set(key, { chunkX, chunkZ });
            }
          }

          const chunkResponses = await chunkService.processChunkRequests(Array.from(chunkRequestsMap.values()));
          io.emit("chunk-data", chunkResponses);
        });
        break;
    }
  });

  (player as any).on('serverbound', (_:any, des: any) => {
    if (des.data.name === "player_auth_input") {
      playerPosition = {
        x: des.data.params.position.x,
        y: des.data.params.position.y,
        z: des.data.params.position.z,
        pitch: des.data.params.pitch,
        yaw: des.data.params.yaw,
      };

      io.emit("player-position", playerPosition);
    }

  })
  });

  relay.listen();
  console.log(`✅ Relay listening on ${config.proxySettings.relay.host}:${config.proxySettings.relay.port}`);
} else {
  console.log("⚠️  Relay is disabled in settings");
}