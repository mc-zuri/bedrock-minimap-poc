import { initializeSocket, socket } from "./socket.js";
import { isColorArrayChunk } from "@minecraft-bedrock-minimap/shared";
import type { ChunkResponse, ChunkData, InvalidateChunksData, PlayerPosition, BatchUpdateData, ChunkOreData, OreDetectionConfig } from "@minecraft-bedrock-minimap/shared";
import { MinimapRenderer, type MinimapConfig } from "./rendering/MinimapRenderer.js";
import { ChunkViewportManager } from "./rendering/ChunkViewportManager.js";
import type { ViewportBounds } from "./rendering/ViewportTracker.js";
import { OverlayControls } from "./overlay-controls.js";
import { OreDetectionSettings } from "./components/OreDetectionSettings.js";
import { ProxySettingsPanel } from "./components/ProxySettingsPanel.js";

// DOM elements
const statusIndicator = document.getElementById("status-indicator") as HTMLElement;
const statusText = document.getElementById("status-text") as HTMLElement;
const minimapCanvas = document.getElementById("minimap") as HTMLCanvasElement;
const positionInfo = document.getElementById("position-info") as HTMLElement;
const loading = document.getElementById("loading") as HTMLElement;
const zoomInBtn = document.getElementById("zoom-in") as HTMLButtonElement;
const zoomOutBtn = document.getElementById("zoom-out") as HTMLButtonElement;
const refreshBtn = document.getElementById("refresh") as HTMLButtonElement;
const oreSettingsToggleBtn = document.getElementById("ore-settings-toggle") as HTMLButtonElement;
const proxySettingsToggleBtn = document.getElementById("proxy-settings-toggle") as HTMLButtonElement;
const perfMetricsElement = document.getElementById("perf-metrics") as HTMLElement | null;

// State
let currentZoom = 1;
let currentPosition: PlayerPosition | null = null;
let currentChunk: { x: number; z: number } | null = null;
let loadedChunks = new Set<string>();
let pendingChunks = new Set<string>();
let minimapRenderer: MinimapRenderer | null = null;
let chunkViewportManager: ChunkViewportManager | null = null;
let perfMonitorInterval: number | null = null;
let overlayControls: OverlayControls | null = null;
let oreDetectionSettings: OreDetectionSettings | null = null;
let proxySettingsPanel: ProxySettingsPanel | null = null;

// Overlay mode detection
const isOverlayMode = detectOverlayMode();

// Detect overlay mode from URL parameters or Electron context
function detectOverlayMode(): boolean {
  // Check URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('overlay') === 'true') {
    return true;
  }

  // Check if running in Electron with electronAPI
  if (typeof (window as any).electronAPI !== 'undefined') {
    return true;
  }

  return false;
}


// Initialize the application
function init() {
  console.log("🚀 Initializing Minecraft Bedrock Minimap Web Client");
  
  if (isOverlayMode) {
    console.log("🎮 Running in overlay mode");
    setupOverlayMode();
  }

  // Initialize socket connection
  initializeSocket();

  // Make socket available globally for overlay controls
  (window as any).socket = socket;

  // Initialize ore detection settings
  initializeOreDetectionSettings();
  
  // Initialize proxy settings panel
  initializeProxySettings();

  // Setup event listeners
  setupEventListeners();

  // Setup socket event handlers
  setupSocketHandlers();
}

// Setup overlay mode specific functionality
function setupOverlayMode() {
  // Initialize overlay controls
  overlayControls = new OverlayControls();

  // Hide debug elements in overlay mode
  const debugInfo = document.getElementById("debug-info");
  const perfMetrics = document.getElementById("perf-metrics");
  
  if (debugInfo) {
    debugInfo.style.display = "none";
  }
  
  if (perfMetrics) {
    perfMetrics.style.display = "none";
  }

  // Apply overlay-specific styling to body
  document.body.classList.add('overlay-mode');

  console.log("🎮 Overlay mode setup completed");
}

// Initialize ore detection settings
function initializeOreDetectionSettings() {
  // Create ore detection settings instance
  oreDetectionSettings = new OreDetectionSettings();
  
  // Set up config change callback to update minimap renderer
  oreDetectionSettings.setConfigChangeCallback((config: OreDetectionConfig) => {
    console.log('⛏️ Ore detection config changed:', config);
    
    // Update minimap renderer with new config - only enable if ores are selected
    if (minimapRenderer) {
      const shouldEnable = config.highlightedOres.length > 0;
      minimapRenderer.setOreDetectionMode(shouldEnable, config);
    }
  
  });
  
  // Apply initial configuration immediately
  const initialConfig = oreDetectionSettings.getConfig();
  console.log('⛏️ Applying initial ore detection config:', initialConfig);
  
  // Store config for when minimap renderer is ready
  (window as any).initialOreConfig = initialConfig;
  
  // Apply to renderer if it already exists
  if (minimapRenderer) {
    const shouldEnable = initialConfig.highlightedOres.length > 0;
    minimapRenderer.setOreDetectionMode(shouldEnable, initialConfig);
  }
  
  
  console.log('⛏️ Ore detection settings initialized');
}

// Initialize proxy settings panel
function initializeProxySettings() {
  // Create proxy settings panel instance
  proxySettingsPanel = new ProxySettingsPanel();
  
  // Set up save callback to handle settings changes
  proxySettingsPanel.setOnSaveCallback((settings) => {
    console.log('⚙️ Proxy settings changed:', settings);
    
    // If in Electron context, settings will be saved via IPC
    // Otherwise they're saved to localStorage
    
    // Show notification that settings were saved
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      z-index: 10000;
      font-size: 14px;
    `;
    notification.textContent = 'Proxy settings saved. Restart proxy server to apply changes.';
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 5000);
  });
  
  console.log('⚙️ Proxy settings panel initialized');
}

// Setup UI event listeners
function setupEventListeners() {
  // Zoom controls
  zoomInBtn.addEventListener("click", () => {
    currentZoom = Math.min(currentZoom + 0.5, 5);
    updateZoom();
    console.log(`🔍 Zoom changed to ${currentZoom}x`);
  });

  zoomOutBtn.addEventListener("click", () => {
    currentZoom = Math.max(currentZoom - 0.5, 0.5);
    updateZoom();
    console.log(`🔍 Zoom changed to ${currentZoom}x`);
  });

  // Refresh button
  refreshBtn.addEventListener("click", () => {
    console.log("🔄 Requesting minimap update");
    if (currentPosition && minimapRenderer) {
      // Force refresh visible chunks
      const viewportBounds = minimapRenderer.getViewportBounds();
      if (viewportBounds && chunkViewportManager) {
        chunkViewportManager.updateViewport(viewportBounds, currentPosition, true);
      }
    }
  });


  // Ore detection settings button
  if (oreSettingsToggleBtn) {
    oreSettingsToggleBtn.addEventListener("click", () => {
      if (oreDetectionSettings) {
        oreDetectionSettings.toggle();
      }
    });
  }
  
  // Proxy settings button
  if (proxySettingsToggleBtn) {
    proxySettingsToggleBtn.addEventListener("click", () => {
      if (proxySettingsPanel) {
        proxySettingsPanel.toggle();
      }
    });
  }
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + P for proxy settings
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      if (proxySettingsPanel) {
        proxySettingsPanel.toggle();
      }
    }
    
    // Ctrl/Cmd + O for ore detection settings
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      if (oreDetectionSettings) {
        oreDetectionSettings.toggle();
      }
    }
  });

  // Minimap click
  minimapCanvas.addEventListener("click", (event) => {
    const rect = minimapCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Convert to relative coordinates
    const relX = x / rect.width;
    const relY = y / rect.height;

    console.log(`🖱️ Minimap clicked at ${relX.toFixed(2)}, ${relY.toFixed(2)}`);
    socket.emit("minimap-click", { x: relX, y: relY });
  });
}

// Setup socket event handlers
function setupSocketHandlers() {
  // Connection status
  socket.on("connection-status", (status) => {
    console.log("📊 Connection status:", status);
    updateConnectionStatus(status.connected, status.message);
  });

  // Player position updates
  socket.on("player-move", (position) => {
    // console.log(`📍 Player moved to ${position.x.toFixed(2)}, ${position.z.toFixed(2)}, yaw: ${(position as any).yaw?.toFixed(1) || 0}`);
    // Convert to full PlayerPosition interface
    const fullPosition: PlayerPosition = {
      x: position.x,
      y: 0, // Y not used for minimap
      z: position.z,
      pitch: 0,
      yaw: (position as any).yaw || 0
    };
    updatePosition(fullPosition);
  });

  // Batch update handler for performance optimization
  socket.on("batch-update", (data: BatchUpdateData) => {
    // console.log(`📦 Received batch update with ${data.updates.length} chunks`);
    
    // Update player position from batch
    if (data.playerPosition) {
      updatePosition(data.playerPosition);
    }
    
    // Process chunk updates
    if (data.updates.length > 0) {
      const chunkDataArray: ChunkData[] = data.updates.map(update => update.chunk);
      handleChunkResponses(chunkDataArray);
    }
  });

  // Socket connection events
  socket.on("connect", () => {
    console.log("✅ Connected to minimap server");
    updateConnectionStatus(true, "Connected to minimap server");
    initializeMinimap();
    
    // Chunks are now automatically sent by server on connection
  });

  socket.on("disconnect", (reason) => {
    console.log(`❌ Disconnected from minimap server: ${reason}`);
    updateConnectionStatus(false, `Disconnected: ${reason}`);
  });

  socket.on("connect_error", (error) => {
    console.error("⚠️ Connection error:", error.message);
    updateConnectionStatus(false, `Connection error: ${error.message}`);
  });


  // Chunk response handlers
  socket.on("chunk-data", (chunks: (ChunkResponse | ChunkData)[]) => {
    console.log(`📦 Received ${chunks.length} chunk responses`);
    handleChunkResponses(chunks);
  });
}

// Update connection status UI
function updateConnectionStatus(connected: boolean, message: string) {
  // Only update status indicators if not in overlay mode or they exist
  if (!isOverlayMode && statusIndicator && statusText) {
    statusIndicator.classList.toggle("connected", connected);
    statusText.textContent = message;
  } else if (isOverlayMode) {
    // In overlay mode, just log the status
    console.log(`📊 Connection status: ${connected ? 'Connected' : 'Disconnected'} - ${message}`);
  }

  if (!connected) {
    loading.style.display = "flex";
    minimapCanvas.style.display = "none";
    positionInfo.style.display = "none";

    // Reset current chunk tracking
    currentChunk = null;

    // Destroy renderer and chunk manager on disconnect
    if (minimapRenderer) {
      minimapRenderer.destroy();
      minimapRenderer = null;
    }
    if (chunkViewportManager) {
      chunkViewportManager.destroy();
      chunkViewportManager = null;
    }

    // Stop performance monitoring
    stopPerformanceMonitoring();
    
    // Destroy overlay controls if in overlay mode
    if (overlayControls) {
      overlayControls.destroy();
      overlayControls = null;
    }
    
    // Destroy ore detection settings
    if (oreDetectionSettings) {
      oreDetectionSettings.destroy();
      oreDetectionSettings = null;
    }
  }
}

// Initialize minimap renderer
function initializeMinimap() {
  loading.style.display = "none";
  minimapCanvas.style.display = "block";
  positionInfo.style.display = "block";

  // Create renderer if not exists
  if (!minimapRenderer) {
    const config: MinimapConfig = {
      blockSize: currentZoom * 4, // Convert zoom to block size
      renderDistance: 10,
      showGrid: true, //currentZoom >= 2,
      showFps: true
    };

    minimapRenderer = new MinimapRenderer(minimapCanvas, config);
    
    // Apply initial ore detection config if available
    const initialOreConfig = (window as any).initialOreConfig;
    if (initialOreConfig) {
      const shouldEnable = initialOreConfig.highlightedOres.length > 0;
      minimapRenderer.setOreDetectionMode(shouldEnable, initialOreConfig);
      console.log('⛏️ Applied initial ore detection config to renderer');
    }
  }

  // Create chunk viewport manager if not exists
  if (!chunkViewportManager) {
    chunkViewportManager = new ChunkViewportManager(loadedChunks, pendingChunks);
  }

  // Set up viewport change callback
  minimapRenderer.setViewportChangeCallback((bounds: ViewportBounds) => {
    if (currentPosition && chunkViewportManager) {
      chunkViewportManager.updateViewport(bounds, currentPosition);
    }
  });

  // If we have a current position, trigger initial chunk loading
  if (currentPosition) {
    minimapRenderer.updatePlayerPosition(currentPosition);
  }

  // Start performance monitoring
  startPerformanceMonitoring();
}

// Update zoom level
function updateZoom() {
  if (minimapRenderer) {
    minimapRenderer.updateConfig({
      blockSize: currentZoom * 4,
      showGrid: true //currentZoom >= 2
    });
  }
}

// Update position display
function updatePosition(position: PlayerPosition) {
  currentPosition = position;
  // Yaw is already in degrees, normalize to -180 to 180 range
  const normalizedYaw = ((position.yaw % 360) + 360) % 360;
  const displayYaw = normalizedYaw > 180 ? normalizedYaw - 360 : normalizedYaw;
  positionInfo.textContent = `X: ${position.x.toFixed(1)}, Z: ${position.z.toFixed(1)}, Yaw: ${displayYaw.toFixed(1)}°`;

  // Calculate current chunk
  const chunkX = Math.floor(position.x / 16);
  const chunkZ = Math.floor(position.z / 16);

  // Check if player moved to a different chunk
  if (!currentChunk || currentChunk.x !== chunkX || currentChunk.z !== chunkZ) {
    const previousChunk = currentChunk;
    currentChunk = { x: chunkX, z: chunkZ };

    // Log chunk change
    if (previousChunk) {
      // console.log(`🏃 Player moved from chunk (${previousChunk.x}, ${previousChunk.z}) to chunk (${chunkX}, ${chunkZ}`);
    } else {
      // console.log(`🏃 Player entered chunk (${chunkX}, ${chunkZ}`);
    }
  }

  // Update renderer position - this will trigger viewport-based chunk loading
  if (minimapRenderer) {
    minimapRenderer.updatePlayerPosition(position);
  }
}

// Handle chunk responses
function handleChunkResponses(chunks: (ChunkResponse | ChunkData)[]) {
  const validChunks: (ChunkResponse | ChunkData)[] = [];
  const oreChunks: ChunkOreData[] = [];

  chunks.forEach(chunk => {
    // Handle both old and new formats
    let key: string;

    if (isColorArrayChunk(chunk)) {
      // New color array format
      key = `${chunk.x},${chunk.z}`;

      // Remove from pending
      pendingChunks.delete(key);

      // Add to loaded and valid chunks
      loadedChunks.add(key);
      validChunks.push(chunk);
      
      // Extract ore data - always create entry when ore detection is enabled
      // so that chunks without ores still show their dimmed surface
      if (chunk.ores) {
        oreChunks.push({
          chunkX: chunk.x,
          chunkZ: chunk.z,
          dimension: chunk.dimension || 0,
          ores: chunk.ores,
          surfaceColors: chunk.colors
        });
      }
      // console.log(`✅ Loaded chunk ${key} (color format)`);
    } else {
      // Old format - ChunkResponse
      const response = chunk as ChunkResponse;
      key = `${response.chunkX},${response.chunkZ}`;

      // Remove from pending
      pendingChunks.delete(key);

      if (response.success && response.data) {
        loadedChunks.add(key);
        validChunks.push(response);
        // console.log(`✅ Loaded chunk ${key}`);
      } else {
        console.error(`❌ Failed to load chunk ${key}: ${response.error}`);
      }
    }
  });

  // Send valid chunks to renderer
  if (minimapRenderer && validChunks.length > 0) {
    // Separate chunks by type to satisfy TypeScript
    const chunkDataArray: ChunkData[] = [];
    const chunkResponseArray: ChunkResponse[] = [];

    validChunks.forEach(chunk => {
      if (isColorArrayChunk(chunk)) {
        chunkDataArray.push(chunk as ChunkData);
      } else {
        chunkResponseArray.push(chunk as ChunkResponse);
      }
    });

    // Add each type separately
    if (chunkDataArray.length > 0) {
      minimapRenderer.addChunks(chunkDataArray);
    }
    if (chunkResponseArray.length > 0) {
      minimapRenderer.addChunks(chunkResponseArray);
    }
    
    // Add ore chunks if any
    if (oreChunks.length > 0) {
      minimapRenderer.addOreChunks(oreChunks);
      console.log(`⛏️ Processed ore data from ${oreChunks.length} chunks`);
    }
  }

  // Update status with chunk count
  const chunkStatus = ` | Chunks: ${loadedChunks.size}`;
  statusText.textContent = statusText.textContent?.split('|')[0].trim() + chunkStatus;
}


// Start performance monitoring
function startPerformanceMonitoring() {
  if (perfMonitorInterval) {
    clearInterval(perfMonitorInterval);
  }

  perfMonitorInterval = window.setInterval(() => {
    if (!minimapRenderer || !chunkViewportManager) return;

    const rendererStats = minimapRenderer.getStats();
    const chunkStats = chunkViewportManager.getStats();
    const viewportBounds = minimapRenderer.getViewportBounds();

    const visibleChunks = viewportBounds ?
      (viewportBounds.maxChunkX - viewportBounds.minChunkX + 1) *
      (viewportBounds.maxChunkZ - viewportBounds.minChunkZ + 1) : 0;

    // In overlay mode, don't show performance metrics UI but still monitor
    if (!isOverlayMode && perfMetricsElement) {
      perfMetricsElement.innerHTML = `
        <div>Performance Metrics:</div>
        <div>- Visible Chunks: ${visibleChunks}</div>
        <div>- Loaded Chunks: ${chunkStats.loadedChunks}</div>
        <div>- Pending Requests: ${chunkStats.pendingChunks}</div>
        <div>- Cache Hit Rate: ${rendererStats.cacheHitRate.toFixed(1)}%</div>
        <div>- FPS: ${rendererStats.fps.toFixed(0)}</div>
        <div>- Velocity: X:${chunkStats.velocity.x.toFixed(1)} Z:${chunkStats.velocity.z.toFixed(1)} blocks/s</div>
      `;
    } else if (isOverlayMode) {
      // In overlay mode, only log performance occasionally (every 10 seconds)
      if (Date.now() % 10000 < 1000) {
        console.log(`📊 Performance: FPS:${rendererStats.fps.toFixed(0)} Chunks:${chunkStats.loadedChunks} Cache:${rendererStats.cacheHitRate.toFixed(1)}%`);
      }
    }
  }, 1000); // Update every second
}

// Stop performance monitoring
function stopPerformanceMonitoring() {
  if (perfMonitorInterval) {
    clearInterval(perfMonitorInterval);
    perfMonitorInterval = null;
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}