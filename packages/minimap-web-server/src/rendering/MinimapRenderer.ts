/**
 * Main minimap renderer class with performance optimizations
 */

import { isColorArrayChunk } from "@minecraft-bedrock-minimap/shared";
import type { ChunkResponse, ChunkData, PlayerPosition, RenderingConfig, ChunkOreData, OreDetectionConfig } from "@minecraft-bedrock-minimap/shared";
import { ChunkCache } from "./ChunkCache.js";
import { ChunkRenderer, createChunkCanvas, getChunkSize, renderChunkGrid, createOreChunkCanvas, renderChunkOres } from "./ChunkRenderer.js";
import { MegaTileRenderer } from "./MegaTileRenderer.js";
import { DirtyRegionTracker } from "./DirtyRegionTracker.js";
import { LayeredRenderer } from "./LayeredRenderer.js";
import { RenderingConfigManager, createPerformanceMonitor, type PerformanceMetrics } from "./RenderingConfig.js";
import { FpsTracker } from "../utils/performance.js";
import { ViewportTracker, type ViewportBounds } from "./ViewportTracker.js";

export interface MinimapConfig {
  blockSize: number;
  renderDistance: number;
  showGrid: boolean;
  showFps: boolean;
  renderingMode?: 'optimized' | 'legacy';
}

export class MinimapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private chunks: Map<string, ChunkData | ChunkResponse> = new Map();
  private oreChunks: Map<string, ChunkOreData> = new Map();
  private loadedChunks: Set<string> = new Set();
  private pendingChunks: Set<string> = new Set();
  
  // Ore detection state
  private oreDetectionEnabled: boolean = false;
  private oreDetectionConfig: OreDetectionConfig = {
    highlightedOres: [],
    highlightStyle: 'bright',
    backgroundDimming: 0.3,
    showOreLabels: false,
    yLevelOffsets: { minY: -10, maxY: 5 }
  };
  
  // Legacy rendering components
  private chunkCache: ChunkCache;
  private fpsTracker: FpsTracker;
  
  // Optimized rendering components
  private chunkRenderer: ChunkRenderer;
  private megaTileRenderer: MegaTileRenderer;
  private dirtyRegionTracker: DirtyRegionTracker;
  private layeredRenderer: LayeredRenderer | null = null;
  private renderingConfigManager: RenderingConfigManager;
  private performanceMonitor: ReturnType<typeof createPerformanceMonitor>;
  
  // Configuration and state
  private playerPosition: PlayerPosition | null = null;
  private config: MinimapConfig;
  private animationId: number | null = null;
  private drawCallCount = 0;
  
  // Smooth movement
  private targetOffset = { x: 0, z: 0 };
  private smoothOffset = { x: 0, z: 0 };
  private baseSmoothingFactor = 0.15;
  private smoothAnimationId: number | null = null;
  
  // UI elements
  private fpsElement: HTMLElement | null = null;
  private performanceElement: HTMLElement | null = null;
  
  // Event handlers
  private resizeHandler: () => void;
  
  // Viewport tracking
  private viewportTracker: ViewportTracker;
  private viewportChangeCallback: ((bounds: ViewportBounds) => void) | null = null;
  
  constructor(canvas: HTMLCanvasElement, config: MinimapConfig) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context not available');
    
    this.ctx = ctx;
    this.config = { renderingMode: 'optimized', ...config };
    
    // Initialize rendering systems
    this.initializeRenderingSystems();
    
    // Get UI elements
    this.fpsElement = document.getElementById('fps-counter');
    this.performanceElement = document.getElementById('performance-stats');
    
    // Bind resize handler
    this.resizeHandler = this.resize.bind(this);
    
    // Initialize viewport tracker
    this.viewportTracker = new ViewportTracker(canvas, (bounds) => {
      this.onViewportChange(bounds);
    });
    
    // Initial setup
    this.resize();
    window.addEventListener('resize', this.resizeHandler);
    
    // Start rendering
    this.startRendering();
  }

  private initializeRenderingSystems(): void {
    // Legacy components (always needed for fallback)
    this.chunkCache = new ChunkCache(150, 100); // 150 entries, 100MB limit
    this.fpsTracker = new FpsTracker();
    
    // Optimized components (used when renderingMode is 'optimized')
    this.chunkRenderer = new ChunkRenderer();
    this.megaTileRenderer = new MegaTileRenderer();
    this.dirtyRegionTracker = new DirtyRegionTracker();
    this.renderingConfigManager = new RenderingConfigManager();
    this.performanceMonitor = createPerformanceMonitor();
    
    // Initialize layered renderer (will be created on first resize)
    this.layeredRenderer = null;
  }

  private shouldUseOptimizedRendering(): boolean {
    return this.config.renderingMode === 'optimized';
  }
  
  /**
   * Resize canvas to match container
   */
  private resize(): void {
    const container = this.canvas.parentElement;
    if (!container) {
      return;
    }
    
    const { width, height } = container.getBoundingClientRect();
    const newWidth = Math.floor(width);
    const newHeight = Math.floor(height);
    
    // Only update if size actually changed
    if (this.canvas.width !== newWidth || this.canvas.height !== newHeight) {
      // Set both canvas resolution and display size to match exactly
      this.canvas.width = newWidth;
      this.canvas.height = newHeight;
      this.canvas.style.width = `${newWidth}px`;
      this.canvas.style.height = `${newHeight}px`;
      
      // Initialize or resize layered renderer for optimized mode
      if (this.shouldUseOptimizedRendering()) {
        if (this.layeredRenderer) {
          this.layeredRenderer.resize(newWidth, newHeight);
        } else {
          this.layeredRenderer = new LayeredRenderer(newWidth, newHeight);
        }
        
        // Mark everything as dirty for full redraw
        this.dirtyRegionTracker.markFullRedraw();
      }
      
      // Update viewport after resize
      if (this.playerPosition) {
        this.viewportTracker.updateViewport(this.playerPosition, this.config.blockSize);
      }
      
      // Force an immediate render after resize
      this.draw();
    }
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<MinimapConfig>): void {
    const oldBlockSize = this.config.blockSize;
    this.config = { ...this.config, ...config };
    
    // Clear cache if block size changed significantly
    if (oldBlockSize !== this.config.blockSize) {
      this.chunkCache.invalidateByBlockSize(this.config.blockSize);
      
      // Update viewport with new block size
      if (this.playerPosition) {
        this.viewportTracker.updateViewport(this.playerPosition, this.config.blockSize);
      }
    }
    
    // Update FPS display visibility
    if (this.fpsElement) {
      this.fpsElement.style.display = this.config.showFps ? 'block' : 'none';
    }
    
    // Force immediate render after config update
    this.draw();
  }
  
  /**
   * Update player position
   */
  updatePlayerPosition(position: PlayerPosition): void {
    this.playerPosition = position;
    
    // For a real-time minimap, we don't want smooth animation
    // The player should appear at their actual position immediately
    this.targetOffset = { x: 0, z: 0 };
    this.smoothOffset = { x: 0, z: 0 };
    
    // Cancel any ongoing smooth animation
    if (this.smoothAnimationId) {
      cancelAnimationFrame(this.smoothAnimationId);
      this.smoothAnimationId = null;
    }
    
    // Update viewport bounds
    this.viewportTracker.updateViewport(position, this.config.blockSize);
  }
  
  /**
   * Set ore detection mode
   */
  setOreDetectionMode(enabled: boolean, config?: OreDetectionConfig): void {
    this.oreDetectionEnabled = enabled;
    if (config) {
      // Check if ore-related settings changed that require cache invalidation
      const yOffsetsChanged = config.yLevelOffsets && 
        (config.yLevelOffsets.minY !== this.oreDetectionConfig.yLevelOffsets?.minY ||
         config.yLevelOffsets.maxY !== this.oreDetectionConfig.yLevelOffsets?.maxY);
      
      const highlightedOresChanged = 
        JSON.stringify(config.highlightedOres) !== JSON.stringify(this.oreDetectionConfig.highlightedOres);
      
      const needsCacheInvalidation = yOffsetsChanged || highlightedOresChanged;
      
      this.oreDetectionConfig = { ...config };
      
      // Invalidate ore chunk cache if settings changed
      if (needsCacheInvalidation) {
        // Clear ore-specific cached canvases
        const keysToInvalidate: string[] = [];
        for (const [key] of this.oreChunks) {
          const oreCacheKey = `ore:${key}:${this.config.blockSize}`;
          keysToInvalidate.push(oreCacheKey);
        }
        if (keysToInvalidate.length > 0) {
          this.chunkCache.invalidate(keysToInvalidate);
        }
      }
    }
    
    // Don't clear cache - just trigger a re-render with new settings
    if (this.layeredRenderer) {
      this.layeredRenderer.markLayerDirty('base');
    }
    
    this.requestRender();
  }

  /**
   * Add ore chunk data to the renderer
   */
  addOreChunks(oreChunks: ChunkOreData[]): void {
    oreChunks.forEach((oreChunk) => {
      const chunkKey = `${oreChunk.chunkX},${oreChunk.chunkZ}`;
      this.oreChunks.set(chunkKey, oreChunk);
      
      // Mark as loaded
      this.loadedChunks.add(chunkKey);
      this.pendingChunks.delete(chunkKey);
      
      // Track dirty regions for optimized rendering
      if (this.shouldUseOptimizedRendering()) {
        this.dirtyRegionTracker.markChunkDirty(oreChunk.chunkX, oreChunk.chunkZ, this.config.blockSize);
        
        // Mark base layer as dirty when chunks are added
        if (this.layeredRenderer) {
          this.layeredRenderer.markLayerDirty('base');
        }
        
        // Invalidate any mega-tiles that include this chunk
        this.megaTileRenderer.invalidateChunk(chunkKey);
      }
    });
    
    this.requestRender();
  }

  /**
   * Add chunks to the renderer
   */
  addChunks(chunks: ChunkResponse[] | ChunkData[]): void {
    chunks.forEach((chunk: ChunkResponse | ChunkData) => {
      let chunkKey: string;
      let chunkX: number, chunkZ: number;
      
      // Handle different chunk formats
      if (isColorArrayChunk(chunk)) {
        chunkX = chunk.x;
        chunkZ = chunk.z;
        chunkKey = `${chunkX},${chunkZ}`;
        this.chunks.set(chunkKey, chunk as any);
        
        // Extract ore data - always create entry when ore detection is enabled
        // so that chunks without ores still show their dimmed surface
        if (chunk.ores) {
          this.oreChunks.set(chunkKey, {
            chunkX: chunk.x,
            chunkZ: chunk.z,
            dimension: chunk.dimension || 0,
            ores: chunk.ores,
            surfaceColors: chunk.colors
          });
        }
      } else {
        // Existing ChunkResponse handling
        const response = chunk as ChunkResponse;
        chunkX = response.chunkX;
        chunkZ = response.chunkZ;
        chunkKey = `${chunkX},${chunkZ}`;
        this.chunks.set(chunkKey, response);
      }
      
      // CRITICAL FIX: Invalidate cached canvas for this chunk
      // This ensures the updated chunk data gets re-rendered
      this.chunkCache.invalidate([chunkKey]);
      
      // Also invalidate bitmap cache for optimized rendering
      if (this.shouldUseOptimizedRendering()) {
        this.chunkRenderer.invalidateBitmap(chunkKey);
      }
      
      // Also invalidate ore cache if ore detection is enabled
      if (this.oreDetectionEnabled) {
        const oreCacheKey = `ore:${chunkKey}:${this.config.blockSize}`;
        this.chunkCache.invalidate([oreCacheKey]);
      }
      
      // Mark as loaded
      this.loadedChunks.add(chunkKey);
      this.pendingChunks.delete(chunkKey);
      
      // Track dirty regions for optimized rendering
      if (this.shouldUseOptimizedRendering()) {
        this.dirtyRegionTracker.markChunkDirty(chunkX, chunkZ, this.config.blockSize);
        
        // Mark base layer as dirty when chunks are added
        if (this.layeredRenderer) {
          this.layeredRenderer.markLayerDirty('base');
        }
        
        // Invalidate any mega-tiles that include this chunk
        this.megaTileRenderer.invalidateChunk(chunkKey);
      }
    });
    
    this.requestRender();
  }
  
  /**
   * Remove a specific chunk from the renderer
   * @param x Chunk X coordinate
   * @param z Chunk Z coordinate
   */
  removeChunk(x: number, z: number): void {
    const chunkKey = `${x},${z}`;
    
    // Remove from all internal data structures
    this.chunks.delete(chunkKey);
    this.oreChunks.delete(chunkKey);
    this.loadedChunks.delete(chunkKey);
    this.pendingChunks.delete(chunkKey);
    
    // Invalidate cache entries
    this.chunkCache.invalidate([chunkKey]);
    
    // Invalidate cache entries for ore chunks
    if (this.oreDetectionEnabled) {
      const oreCacheKey = `ore:${chunkKey}:${this.config.blockSize}`;
      this.chunkCache.invalidate([oreCacheKey]);
    }
    
    // Track dirty regions for optimized rendering
    if (this.shouldUseOptimizedRendering()) {
      this.dirtyRegionTracker.markChunkDirty(x, z, this.config.blockSize);
      
      // Mark base layer as dirty when chunks are removed
      if (this.layeredRenderer) {
        this.layeredRenderer.markLayerDirty('base');
      }
      
      // Invalidate any mega-tiles that include this chunk
      this.megaTileRenderer.invalidateChunk(chunkKey);
    }
    
    // Request a re-render to clear the removed chunk
    this.requestRender();
  }
  
  /**
   * Clear all chunks
   */
  clearChunks(): void {
    this.chunks.clear();
    this.loadedChunks.clear();
    this.pendingChunks.clear();
    this.chunkCache.clear();
    this.render();
  }
  
  /**
   * Invalidate specific chunks
   */
  invalidateChunks(chunks: Array<{ x: number, z: number }>): void {
    const keys = chunks.map(chunk => `${chunk.x},${chunk.z}`);
    
    // Remove from chunk data
    keys.forEach(key => this.chunks.delete(key));
    
    // Invalidate cache
    this.chunkCache.invalidate(keys);
    
    this.render();
  }
  
  /**
   * Start the rendering loop
   */
  private startRendering(): void {
    const render = () => {
      this.draw();
      this.animationId = requestAnimationFrame(render);
    };
    
    render();
  }
  
  /**
   * Start smooth movement animation
   */
  private startSmoothAnimation(): void {
    const animate = () => {
      // Update smooth offset
      const dx = this.targetOffset.x - this.smoothOffset.x;
      const dz = this.targetOffset.z - this.smoothOffset.z;
      
      // Adjust smoothing factor based on zoom level
      // Higher zoom (larger blockSize) = faster smoothing to match visual speed
      const zoomAdjustedFactor = this.baseSmoothingFactor * Math.min(2, this.config.blockSize / 4);
      
      this.smoothOffset.x += dx * zoomAdjustedFactor;
      this.smoothOffset.z += dz * zoomAdjustedFactor;
      
      // Stop animation when close enough
      if (Math.abs(dx) < 0.5 && Math.abs(dz) < 0.5) {
        this.smoothOffset = { x: 0, z: 0 };
        this.targetOffset = { x: 0, z: 0 };
        this.smoothAnimationId = null;
      } else {
        this.smoothAnimationId = requestAnimationFrame(animate);
      }
    };
    
    animate();
  }
  
  /**
   * Handle viewport change
   */
  private onViewportChange(bounds: ViewportBounds): void {
    // Trigger external callback if set
    if (this.viewportChangeCallback) {
      this.viewportChangeCallback(bounds);
    }
    
    // Request render
    this.requestRender();
  }
  
  /**
   * Set viewport change callback
   */
  setViewportChangeCallback(callback: (bounds: ViewportBounds) => void): void {
    this.viewportChangeCallback = callback;
  }
  
  /**
   * Get current viewport bounds
   */
  getViewportBounds(): ViewportBounds | null {
    return this.viewportTracker.getViewportBounds();
  }
  
  /**
   * Main drawing function
   */
  private draw(): void {
    // Start performance monitoring
    this.performanceMonitor.startFrame();
    this.drawCallCount = 0;
    
    // Track frame for FPS (legacy tracker)
    const fps = this.fpsTracker.trackFrame();
    
    if (this.shouldUseOptimizedRendering()) {
      this.drawOptimized();
    } else {
      this.drawLegacy();
    }
    
    // Record performance metrics
    if (this.shouldUseOptimizedRendering()) {
      const visibleChunks = this.getVisibleChunkCount();
      const performanceMetrics = this.performanceMonitor.endFrame(this.drawCallCount, visibleChunks);
      this.renderingConfigManager.recordPerformanceMetrics(performanceMetrics);
      this.updatePerformanceDisplay(performanceMetrics);
    } else {
      // Update legacy FPS display
      if (this.config.showFps && this.fpsElement) {
        this.fpsElement.textContent = `FPS: ${Math.round(fps)}`;
      }
    }
    
    // Performance tracking completed
  }

  /**
   * Optimized rendering path with layered rendering and dirty region tracking
   */
  private drawOptimized(): void {
    if (!this.playerPosition) {
      return;
    }

    // For now, fall back to simplified optimized rendering
    // The layered renderer has compositing issues that need more debugging
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Render terrain directly to main canvas
    this.renderFullView(this.ctx);
    
    // Draw player marker and UI
    if (this.config.showGrid) {
      this.drawCenterGuides(this.ctx);
    }
    this.drawPlayerMarker(this.canvas.width / 2, this.canvas.height / 2, this.ctx);
    
    this.drawCallCount = 1; // One full render call
  }

  /**
   * Update base layer (static terrain)
   */
  private updateBaseLayer(): void {
    if (!this.layeredRenderer || !this.playerPosition) return;

    // Always mark base layer as dirty initially or when chunks change
    this.layeredRenderer.markLayerDirty('base');

    this.layeredRenderer.updateLayer('base', (ctx, dirtyRegions) => {
      // Always render full view for now to ensure chunks appear
      // TODO: Optimize with selective rendering once working
      this.renderFullView(ctx);
    });
  }

  /**
   * Update updates layer (recent changes)
   */
  private updateUpdatesLayer(): void {
    if (!this.layeredRenderer || !this.playerPosition) return;

    this.layeredRenderer.updateLayer('updates', () => {
      // This layer handles chunks that have been recently updated
      // For now, we'll keep it simple and not use it
    });
  }

  /**
   * Update overlay layer (player, grid, UI)
   */
  private updateOverlayLayer(): void {
    if (!this.layeredRenderer || !this.playerPosition) return;

    // Always mark overlay as dirty since player position changes
    this.layeredRenderer.markLayerDirty('overlay');
    
    this.layeredRenderer.updateLayer('overlay', (ctx) => {
      // Clear the overlay
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      
      // Draw center guides
      if (this.config.showGrid) {
        this.drawCenterGuides(ctx);
      }
      
      // Draw player marker
      this.drawPlayerMarker(this.canvas.width / 2, this.canvas.height / 2, ctx);
    });
  }

  /**
   * Legacy rendering path (original implementation)
   */
  private drawLegacy(): void {
    // Update FPS display
    if (this.config.showFps && this.fpsElement) {
      const fps = this.fpsTracker.getMetrics().currentFps;
      this.fpsElement.textContent = `FPS: ${Math.round(fps)}`;
    }
    
    // Clear canvas
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // No player position yet
    if (!this.playerPosition) {
      return;
    }
    
    // Calculate center position (player is always centered)
    const centerX = this.canvas.width / 2;
    const centerZ = this.canvas.height / 2;
    this.updateDebugInfo(centerX, centerZ);
    
    this.renderFullView(this.ctx);
    
    // Draw center guides
    if (this.config.showGrid) {
      this.drawCenterGuides(this.ctx);
    }
    
    // Draw player marker (always centered)
    this.drawPlayerMarker(this.canvas.width / 2, this.canvas.height / 2, this.ctx);
  }
  
  /**
   * Render all visible chunks to the given context
   */
  private renderFullView(ctx: CanvasRenderingContext2D): void {
    if (!this.playerPosition) return;

    const centerX = this.canvas.width / 2;
    const centerZ = this.canvas.height / 2;
    
    // Calculate visible chunk range
    const halfWidth = this.canvas.width / 2;
    const halfHeight = this.canvas.height / 2;
    
    const minChunkX = Math.floor((this.playerPosition.x - halfWidth / this.config.blockSize) / 16) - 1;
    const maxChunkX = Math.ceil((this.playerPosition.x + halfWidth / this.config.blockSize) / 16) + 1;
    const minChunkZ = Math.floor((this.playerPosition.z - halfHeight / this.config.blockSize) / 16) - 1;
    const maxChunkZ = Math.ceil((this.playerPosition.z + halfHeight / this.config.blockSize) / 16) + 1;

    // For optimized mode, force individual chunk rendering for now
    // Mega-tiles have async issues that need debugging
    this.renderWithIndividualChunks(ctx, minChunkX, maxChunkX, minChunkZ, maxChunkZ, centerX, centerZ);
  }

  /**
   * Render using mega-tiles for better performance
   */
  private renderWithMegaTiles(
    ctx: CanvasRenderingContext2D,
    minChunkX: number, maxChunkX: number,
    minChunkZ: number, maxChunkZ: number,
    centerX: number, centerZ: number
  ): void {
    const renderingConfig = this.renderingConfigManager.getConfig();
    const megaTileSize = renderingConfig.megaTileSize;
    
    // Iterate through mega-tile grid
    const minTileX = Math.floor(minChunkX / megaTileSize) * megaTileSize;
    const maxTileX = Math.ceil(maxChunkX / megaTileSize) * megaTileSize;
    const minTileZ = Math.floor(minChunkZ / megaTileSize) * megaTileSize;
    const maxTileZ = Math.ceil(maxChunkZ / megaTileSize) * megaTileSize;

    for (let tileX = minTileX; tileX < maxTileX; tileX += megaTileSize) {
      for (let tileZ = minTileZ; tileZ < maxTileZ; tileZ += megaTileSize) {
        this.renderMegaTile(ctx, tileX, tileZ, megaTileSize, centerX, centerZ);
      }
    }
  }

  /**
   * Render a single mega-tile
   */
  private async renderMegaTile(
    ctx: CanvasRenderingContext2D,
    tileX: number, tileZ: number, tileSize: number,
    centerX: number, centerZ: number
  ): Promise<void> {
    if (!this.playerPosition) return;

    // Calculate center of mega-tile
    const centerTileX = tileX + Math.floor(tileSize / 2);
    const centerTileZ = tileZ + Math.floor(tileSize / 2);

    try {
      // Filter chunks to only include ChunkData (color array format)
      const colorChunks = new Map<string, ChunkData>();
      for (const [key, chunk] of this.chunks) {
        if (isColorArrayChunk(chunk)) {
          colorChunks.set(key, chunk as ChunkData);
        }
      }

      const megaTile = await this.megaTileRenderer.getOrCreateMegaTile(
        centerTileX, centerTileZ, colorChunks, this.config.blockSize, 0, tileSize as 3 | 5
      );

      if (megaTile && megaTile.bitmap) {
        // Calculate screen position
        const screenX = Math.floor(centerX + (tileX * 16 - this.playerPosition.x) * this.config.blockSize);
        const screenZ = Math.floor(centerZ + (tileZ * 16 - this.playerPosition.z) * this.config.blockSize);
        const renderSize = tileSize * 16 * this.config.blockSize;

        // Check if mega-tile is visible
        if (this.isRectVisible(screenX, screenZ, renderSize, renderSize)) {
          ctx.drawImage(megaTile.bitmap, screenX, screenZ, renderSize, renderSize);
          this.drawCallCount++;
        }
      }
    } catch (error) {
      console.error('Failed to render mega-tile:', error);
      // Fallback to individual chunk rendering for this area
      this.renderIndividualChunksInArea(ctx, tileX, tileX + tileSize, tileZ, tileZ + tileSize, centerX, centerZ);
    }
  }

  /**
   * Render using individual chunks (legacy method)
   */
  private renderWithIndividualChunks(
    ctx: CanvasRenderingContext2D,
    minChunkX: number, maxChunkX: number,
    minChunkZ: number, maxChunkZ: number,
    centerX: number, centerZ: number
  ): void {
    this.renderIndividualChunksInArea(ctx, minChunkX, maxChunkX, minChunkZ, maxChunkZ, centerX, centerZ);
  }

  /**
   * Render individual chunks in a specified area
   */
  private renderIndividualChunksInArea(
    ctx: CanvasRenderingContext2D,
    minChunkX: number, maxChunkX: number,
    minChunkZ: number, maxChunkZ: number,
    centerX: number, centerZ: number
  ): void {
    if (!this.playerPosition) return;

    // Render visible chunks
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
      for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ++) {
        const key = `${chunkX},${chunkZ}`;
        
        // Calculate screen position
        const screenX = Math.floor(centerX + (chunkX * 16 - this.playerPosition.x) * this.config.blockSize);
        const screenZ = Math.floor(centerZ + (chunkZ * 16 - this.playerPosition.z) * this.config.blockSize);
        const chunkSize = getChunkSize(this.config.blockSize);
        
        // Check if chunk is visible
        if (this.isRectVisible(screenX, screenZ, chunkSize, chunkSize)) {
          // Always render the base terrain chunk first
          const chunk = this.chunks.get(key);
          if (chunk) {
            this.renderChunk(chunk, screenX, screenZ, ctx);
          }
          
          // If ore detection is enabled, render ore overlay on top
          if (this.oreDetectionEnabled) {
            const oreChunk = this.oreChunks.get(key);
            if (oreChunk) {
              this.renderOreChunk(oreChunk, screenX, screenZ, ctx);
            }
          }
        }
      }
    }
  }

  /**
   * Render a specific region (for dirty region updates)
   */
  private renderRegion(ctx: CanvasRenderingContext2D, region: { x: number; y: number; width: number; height: number }): void {
    if (!this.playerPosition) return;

    // Convert screen coordinates to chunk coordinates
    const centerX = this.canvas.width / 2;
    const centerZ = this.canvas.height / 2;
    
    const startWorldX = this.playerPosition.x + (region.x - centerX) / this.config.blockSize;
    const startWorldZ = this.playerPosition.z + (region.y - centerZ) / this.config.blockSize;
    const endWorldX = this.playerPosition.x + (region.x + region.width - centerX) / this.config.blockSize;
    const endWorldZ = this.playerPosition.z + (region.y + region.height - centerZ) / this.config.blockSize;

    const minChunkX = Math.floor(startWorldX / 16);
    const maxChunkX = Math.ceil(endWorldX / 16);
    const minChunkZ = Math.floor(startWorldZ / 16);
    const maxChunkZ = Math.ceil(endWorldZ / 16);

    this.renderIndividualChunksInArea(ctx, minChunkX, maxChunkX, minChunkZ, maxChunkZ, centerX, centerZ);
  }

  /**
   * Check if a rectangle is visible on screen
   */
  private isRectVisible(x: number, z: number, width: number, height: number): boolean {
    return x + width > 0 && 
           x < this.canvas.width && 
           z + height > 0 && 
           z < this.canvas.height;
  }

  /**
   * Get count of visible chunks
   */
  private getVisibleChunkCount(): number {
    if (!this.playerPosition) return 0;

    const halfWidth = this.canvas.width / 2;
    const halfHeight = this.canvas.height / 2;
    
    const minChunkX = Math.floor((this.playerPosition.x - halfWidth / this.config.blockSize) / 16) - 1;
    const maxChunkX = Math.ceil((this.playerPosition.x + halfWidth / this.config.blockSize) / 16) + 1;
    const minChunkZ = Math.floor((this.playerPosition.z - halfHeight / this.config.blockSize) / 16) - 1;
    const maxChunkZ = Math.ceil((this.playerPosition.z + halfHeight / this.config.blockSize) / 16) + 1;

    return (maxChunkX - minChunkX + 1) * (maxChunkZ - minChunkZ + 1);
  }

  /**
   * Update performance display
   */
  private updatePerformanceDisplay(metrics: PerformanceMetrics): void {
    if (!this.config.showFps) return;

    if (this.fpsElement) {
      this.fpsElement.textContent = `FPS: ${metrics.fps}`;
    }

    if (this.performanceElement) {
      const memoryMB = (metrics.memoryUsage / (1024 * 1024)).toFixed(1);
      this.performanceElement.textContent = 
        `Chunks: ${metrics.visibleChunks} | Draws: ${metrics.drawCalls} | Mem: ${memoryMB}MB`;
    }
  }
  
  /**
   * Render a single chunk
   */
  private renderChunk(chunk: ChunkData | ChunkResponse, screenX: number, screenZ: number, ctx?: CanvasRenderingContext2D): void {
    const renderContext = ctx || this.ctx;
    
    // Get chunk key based on format
    const key = isColorArrayChunk(chunk) 
      ? `${chunk.x},${chunk.z}`
      : `${(chunk as ChunkResponse).chunkX},${(chunk as ChunkResponse).chunkZ}`;
    
    const chunkSize = getChunkSize(this.config.blockSize);
    
    // Use optimized rendering if available
    if (this.shouldUseOptimizedRendering()) {
      const renderingConfig = this.renderingConfigManager.getConfig();
      
      if (renderingConfig.useImageBitmap) {
        // Try to use bitmap first
        const bitmap = this.chunkRenderer.getCachedBitmap(key);
        if (bitmap) {
          renderContext.drawImage(bitmap, screenX, screenZ, chunkSize, chunkSize);
          this.drawCallCount++;
          return;
        }
        
        // Create bitmap asynchronously
        this.chunkRenderer.createChunkBitmap(chunk, this.config.blockSize, key)
          .then(bitmap => {
            if (bitmap) {
              // Re-render when bitmap is ready
              this.requestRender();
            }
          });
      }
    }
    
    // Fallback to canvas rendering
    const cachedCanvas = this.chunkCache.getOrCreate(
      key,
      this.config.blockSize,
      () => {
        this.fpsTracker.recordCacheMiss();
        return createChunkCanvas(chunk, this.config.blockSize);
      }
    );
    
    if (cachedCanvas) {
      this.fpsTracker.recordCacheHit();
      
      // Enable/disable image smoothing based on zoom level
      renderContext.imageSmoothingEnabled = this.config.blockSize < 4;
      
      // Draw the cached chunk
      renderContext.drawImage(
        cachedCanvas,
        0, 0, cachedCanvas.width, cachedCanvas.height,
        screenX, screenZ, chunkSize, chunkSize
      );
      
      this.drawCallCount++;
    }
    
    // Draw chunk grid if enabled
    if (this.config.showGrid /*&& this.config.blockSize >= 4*/) {
      renderChunkGrid(renderContext, screenX, screenZ, chunkSize);
    }
  }

  /**
   * Render a single ore chunk with highlighting
   */
  private renderOreChunk(oreChunk: ChunkOreData, screenX: number, screenZ: number, ctx?: CanvasRenderingContext2D): void {
    const renderContext = ctx || this.ctx;
    const chunkKey = `${oreChunk.chunkX},${oreChunk.chunkZ}`;
    const chunkSize = getChunkSize(this.config.blockSize);
    
    // Create ore-specific cache key to avoid conflicts with normal chunks
    const oreCacheKey = `ore:${chunkKey}:${this.config.blockSize}`;
    
    // Try to get cached ore canvas
    const cachedCanvas = this.chunkCache.getOrCreate(
      oreCacheKey,
      this.config.blockSize,
      () => {
        this.fpsTracker.recordCacheMiss();
        return createOreChunkCanvas(oreChunk, this.config.blockSize, this.oreDetectionConfig, this.playerPosition?.y);
      }
    );
    
    if (cachedCanvas) {
      this.fpsTracker.recordCacheHit();
      
      // CRITICAL: Disable image smoothing for crisp ore markers
      renderContext.imageSmoothingEnabled = false;
      
      // Draw the cached ore chunk
      renderContext.drawImage(
        cachedCanvas,
        0, 0, cachedCanvas.width, cachedCanvas.height,
        screenX, screenZ, chunkSize, chunkSize
      );
      
      this.drawCallCount++;
    } else {
      // Fallback: render directly to context
      renderContext.save();
      renderContext.translate(screenX, screenZ);
      renderContext.scale(chunkSize / (16 * this.config.blockSize), chunkSize / (16 * this.config.blockSize));
      
      renderChunkOres(renderContext, oreChunk, this.config.blockSize, this.oreDetectionConfig, this.playerPosition?.y);
      
      renderContext.restore();
      this.drawCallCount++;
    }
    
    // Draw chunk grid if enabled
    if (this.config.showGrid) {
      renderChunkGrid(renderContext, screenX, screenZ, chunkSize);
    }
  }
  
  /**
   * Draw center guides to make centering visible
   */
  private drawCenterGuides(ctx?: CanvasRenderingContext2D): void {
    const renderContext = ctx || this.ctx;
    const centerX = this.canvas.width / 2;
    const centerZ = this.canvas.height / 2;
    
    renderContext.save();
    renderContext.strokeStyle = '#444444';
    renderContext.lineWidth = 1;
    renderContext.setLineDash([5, 5]);
    
    // Draw center crosshairs
    renderContext.beginPath();
    // Horizontal line
    renderContext.moveTo(0, centerZ);
    renderContext.lineTo(this.canvas.width, centerZ);
    // Vertical line
    renderContext.moveTo(centerX, 0);
    renderContext.lineTo(centerX, this.canvas.height);
    renderContext.stroke();
    
    // Draw center circle
    renderContext.setLineDash([]);
    renderContext.strokeStyle = '#666666';
    renderContext.lineWidth = 2;
    renderContext.beginPath();
    renderContext.arc(centerX, centerZ, 15, 0, 2 * Math.PI);
    renderContext.stroke();
    
    renderContext.restore();
  }

  /**
   * Draw player marker
   */
  private drawPlayerMarker(x: number, z: number, ctx?: CanvasRenderingContext2D): void {
    if (!this.playerPosition) return;
    
    const renderContext = ctx || this.ctx;
    
    // Save the current context state
    renderContext.save();
    
    // Translate to player position
    renderContext.translate(x, z);
    
    // Rotate based on yaw
    const yawRadians = (this.playerPosition.yaw + 180) * Math.PI / 180;
    renderContext.rotate(yawRadians);
    
    // Draw player triangle pointing up (before rotation)
    renderContext.fillStyle = '#FF0000';
    renderContext.strokeStyle = '#FFFFFF';
    renderContext.lineWidth = 2;
    
    renderContext.beginPath();
    renderContext.moveTo(0, -8);
    renderContext.lineTo(-6, 6);
    renderContext.lineTo(6, 6);
    renderContext.closePath();
    
    renderContext.fill();
    renderContext.stroke();
    
    // Restore the context state
    renderContext.restore();
  }
  
  /**
   * Force a render
   */
  render(): void {
    this.draw();
  }
  
  /**
   * Request a render on the next animation frame
   */
  private requestRender(): void {
    if (!this.animationId) {
      this.animationId = requestAnimationFrame(() => {
        this.draw();
        this.animationId = null;
      });
    }
  }
  
  /**
   * Update debug information in the UI
   */
  private updateDebugInfo(centerX: number, centerZ: number): void {
    const container = this.canvas.parentElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    
    // Update debug info elements
    const canvasSize = document.getElementById('canvas-size');
    const containerSize = document.getElementById('container-size');
    const cssSize = document.getElementById('css-size');
    const playerPos = document.getElementById('player-pos');
    const centerCalc = document.getElementById('center-calc');
    const windowSize = document.getElementById('window-size');

    if (canvasSize) canvasSize.textContent = `${this.canvas.width}x${this.canvas.height}`;
    if (containerSize) containerSize.textContent = `${containerRect.width.toFixed(1)}x${containerRect.height.toFixed(1)}`;
    if (cssSize) cssSize.textContent = `${this.canvas.style.width} x ${this.canvas.style.height}`;
    if (playerPos && this.playerPosition) {
      playerPos.textContent = `${this.playerPosition.x.toFixed(1)}, ${this.playerPosition.z.toFixed(1)}`;
    }
    if (centerCalc) centerCalc.textContent = `${centerX}, ${centerZ}`;
    if (windowSize) windowSize.textContent = `${window.innerWidth}x${window.innerHeight}`;
  }

  /**
   * Destroy the renderer and clean up resources
   */
  destroy(): void {
    // Cancel animation frames
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    if (this.smoothAnimationId) {
      cancelAnimationFrame(this.smoothAnimationId);
      this.smoothAnimationId = null;
    }
    
    // Remove event listeners
    window.removeEventListener('resize', this.resizeHandler);
    
    // Destroy viewport tracker
    this.viewportTracker.destroy();
    
    // Clean up optimized rendering components
    if (this.chunkRenderer) {
      this.chunkRenderer.clearBitmapCache();
    }
    
    if (this.megaTileRenderer) {
      this.megaTileRenderer.clear();
    }
    
    if (this.layeredRenderer) {
      this.layeredRenderer.clear();
    }
    
    // Clear data
    this.chunks.clear();
    this.chunkCache.clear();
  }
  
  /**
   * Get current statistics
   */
  getStats(): {
    chunksLoaded: number;
    cacheSize: number;
    cacheHitRate: number;
    fps: number;
    renderingMode: string;
    optimizedStats?: {
      megaTiles: number;
      bitmapCache: number;
      memoryUsage: string;
      drawCalls: number;
      layerStats: any;
    };
  } {
    const metrics = this.fpsTracker.getMetrics();
    const baseStats = {
      chunksLoaded: this.chunks.size,
      cacheSize: this.chunkCache.size(),
      cacheHitRate: metrics.chunkCacheHits / (metrics.chunkCacheHits + metrics.chunkCacheMisses) * 100 || 0,
      fps: metrics.currentFps,
      renderingMode: this.config.renderingMode || 'legacy'
    };

    if (this.shouldUseOptimizedRendering()) {
      const chunkStats = this.chunkRenderer.getCacheStats();
      
      return {
        ...baseStats,
        optimizedStats: {
          megaTiles: this.megaTileRenderer.getCacheSize(),
          bitmapCache: chunkStats.cachedBitmaps,
          memoryUsage: this.chunkCache.getMemoryUsageString(),
          drawCalls: this.drawCallCount,
          layerStats: this.layeredRenderer ? this.layeredRenderer.getStats() : null
        }
      };
    }

    return baseStats;
  }

  /**
   * Get rendering configuration
   */
  getRenderingConfig(): any {
    if (this.shouldUseOptimizedRendering()) {
      return {
        current: this.renderingConfigManager.getConfig(),
        deviceCapabilities: this.renderingConfigManager.getDeviceCapabilities(),
        performanceStats: this.renderingConfigManager.getPerformanceStats()
      };
    }
    return null;
  }

  /**
   * Update rendering configuration
   */
  updateRenderingConfig(updates: Partial<RenderingConfig>): void {
    if (this.shouldUseOptimizedRendering()) {
      this.renderingConfigManager.updateConfig(updates);
      
      // Mark everything as dirty for re-render
      this.dirtyRegionTracker.markFullRedraw();
      this.requestRender();
    }
  }

  /**
   * Switch rendering mode
   */
  setRenderingMode(mode: 'optimized' | 'legacy'): void {
    this.config.renderingMode = mode;
    
    // Clear caches when switching modes
    this.chunkCache.clear();
    if (this.chunkRenderer) {
      this.chunkRenderer.clearBitmapCache();
    }
    if (this.megaTileRenderer) {
      this.megaTileRenderer.clear();
    }
    
    // Reinitialize layered renderer if switching to optimized
    if (mode === 'optimized') {
      this.layeredRenderer = new LayeredRenderer(this.canvas.width, this.canvas.height);
      this.dirtyRegionTracker.markFullRedraw();
    }
    
    // Force full redraw
    this.requestRender();
  }
}
