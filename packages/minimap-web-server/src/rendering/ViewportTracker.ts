/**
 * ViewportTracker - Manages viewport bounds and visibility calculations
 */

import type { PlayerPosition } from "@minecraft-bedrock-minimap/shared";

export interface ViewportBounds {
  minChunkX: number;
  maxChunkX: number;
  minChunkZ: number;
  maxChunkZ: number;
  screenWidth: number;
  screenHeight: number;
  zoom: number;
  centerWorldX: number;
  centerWorldZ: number;
}

export class ViewportTracker {
  private canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver | null = null;
  private viewportBounds: ViewportBounds | null = null;
  private updateCallback: (bounds: ViewportBounds) => void;
  private resizeDebounceTimer: number | null = null;
  private devicePixelRatio: number = 1;

  constructor(canvas: HTMLCanvasElement, updateCallback: (bounds: ViewportBounds) => void) {
    this.canvas = canvas;
    this.updateCallback = updateCallback;
    this.devicePixelRatio = window.devicePixelRatio || 1;

    // Setup ResizeObserver for efficient size tracking
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(entries => {
        this.handleResize(entries);
      });
      this.resizeObserver.observe(canvas);
    } else {
      // Fallback to window resize event
      window.addEventListener('resize', () => this.handleWindowResize());
    }

    // Initial viewport calculation
    this.updateCanvasSize();
  }

  private handleResize(entries: ResizeObserverEntry[]): void {
    for (const entry of entries) {
      if (entry.target === this.canvas) {
        // Debounce resize events
        if (this.resizeDebounceTimer !== null) {
          clearTimeout(this.resizeDebounceTimer);
        }

        this.resizeDebounceTimer = window.setTimeout(() => {
          this.updateCanvasSize();
          this.resizeDebounceTimer = null;
        }, 100);
      }
    }
  }

  private handleWindowResize(): void {
    // Fallback handler with debouncing
    if (this.resizeDebounceTimer !== null) {
      clearTimeout(this.resizeDebounceTimer);
    }

    this.resizeDebounceTimer = window.setTimeout(() => {
      this.updateCanvasSize();
      this.resizeDebounceTimer = null;
    }, 100);
  }

  private updateCanvasSize(): void {
    // Do not update canvas size here - let MinimapRenderer handle it
    // Just trigger viewport update if we have position data
    if (this.viewportBounds) {
      this.updateViewport(
        { x: this.viewportBounds.centerWorldX, y: 0, z: this.viewportBounds.centerWorldZ, pitch: 0, yaw: 0 },
        this.viewportBounds.zoom
      );
    }
  }

  updateViewport(playerPos: PlayerPosition, blockSize: number): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    // Calculate visible area in world coordinates
    const visibleWidthBlocks = width / blockSize;
    const visibleHeightBlocks = height / blockSize;

    // Add buffer for smooth scrolling (1-2 chunks based on zoom)
    const bufferChunks = Math.max(2, Math.ceil(16 / blockSize));

    // Calculate chunk bounds
    const minChunkX = Math.floor((playerPos.x - visibleWidthBlocks / 2) / 16) - bufferChunks;
    const maxChunkX = Math.ceil((playerPos.x + visibleWidthBlocks / 2) / 16) + bufferChunks;
    const minChunkZ = Math.floor((playerPos.z - visibleHeightBlocks / 2) / 16) - bufferChunks;
    const maxChunkZ = Math.ceil((playerPos.z + visibleHeightBlocks / 2) / 16) + bufferChunks;

    this.viewportBounds = {
      minChunkX,
      maxChunkX,
      minChunkZ,
      maxChunkZ,
      screenWidth: width,
      screenHeight: height,
      zoom: blockSize,
      centerWorldX: playerPos.x,
      centerWorldZ: playerPos.z
    };

    this.updateCallback(this.viewportBounds);
  }

  getViewportBounds(): ViewportBounds | null {
    return this.viewportBounds;
  }

  isChunkVisible(chunkX: number, chunkZ: number): boolean {
    if (!this.viewportBounds) return false;

    return chunkX >= this.viewportBounds.minChunkX - 1 &&
           chunkX <= this.viewportBounds.maxChunkX + 1 &&
           chunkZ >= this.viewportBounds.minChunkZ - 1 &&
           chunkZ <= this.viewportBounds.maxChunkZ + 1;
  }

  getChunkDistance(chunkX: number, chunkZ: number, playerPos: PlayerPosition): number {
    const chunkCenterX = chunkX * 16 + 8;
    const chunkCenterZ = chunkZ * 16 + 8;
    
    return Math.sqrt(
      Math.pow(chunkCenterX - playerPos.x, 2) +
      Math.pow(chunkCenterZ - playerPos.z, 2)
    );
  }

  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.resizeDebounceTimer !== null) {
      clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = null;
    }
  }
}