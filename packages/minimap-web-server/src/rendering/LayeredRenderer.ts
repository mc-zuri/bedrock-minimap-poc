import type { RenderLayer, DirtyRegion } from '@minecraft-bedrock-minimap/shared';
import { DirtyRegionTracker } from './DirtyRegionTracker.js';

export type LayerName = 'base' | 'updates' | 'overlay';

export class LayeredRenderer {
  private layers: Map<LayerName, RenderLayer> = new Map();
  private dirtyTrackers: Map<LayerName, DirtyRegionTracker> = new Map();
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.initializeLayers();
  }

  private initializeLayers(): void {
    const layerNames: LayerName[] = ['base', 'updates', 'overlay'];

    for (const name of layerNames) {
      const canvas = document.createElement('canvas');
      canvas.width = this.width;
      canvas.height = this.height;
      
      const ctx = canvas.getContext('2d', { 
        alpha: name === 'overlay', // Only overlay needs transparency
        desynchronized: true // Better performance
      });

      if (!ctx) {
        throw new Error(`Failed to create context for layer ${name}`);
      }

      // Initialize non-transparent layers with black
      if (name !== 'overlay') {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.width, this.height);
      }

      const layer: RenderLayer = {
        name,
        canvas,
        dirty: true, // Start with layers marked as dirty
        dirtyRegions: []
      };

      this.layers.set(name, layer);
      this.dirtyTrackers.set(name, new DirtyRegionTracker());
    }
  }

  resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;

    this.width = width;
    this.height = height;

    // Resize all layers
    for (const [name, layer] of this.layers) {
      const oldCanvas = layer.canvas;
      const newCanvas = document.createElement('canvas');
      newCanvas.width = width;
      newCanvas.height = height;

      const ctx = newCanvas.getContext('2d', {
        alpha: name === 'overlay',
        desynchronized: true
      });

      if (!ctx) {
        throw new Error(`Failed to create context for resized layer ${name}`);
      }

      // Copy old content
      ctx.drawImage(oldCanvas, 0, 0);

      // Fill new areas with appropriate color
      if (name !== 'overlay') {
        ctx.fillStyle = '#000000';
        if (width > oldCanvas.width) {
          ctx.fillRect(oldCanvas.width, 0, width - oldCanvas.width, height);
        }
        if (height > oldCanvas.height) {
          ctx.fillRect(0, oldCanvas.height, width, height - oldCanvas.height);
        }
      }

      layer.canvas = newCanvas;
      layer.dirty = true;
    }

    // Mark all layers for full redraw
    for (const tracker of this.dirtyTrackers.values()) {
      tracker.markFullRedraw();
    }
  }

  getLayer(name: LayerName): RenderLayer | undefined {
    return this.layers.get(name);
  }

  getLayerContext(name: LayerName): CanvasRenderingContext2D | null {
    const layer = this.layers.get(name);
    return layer ? layer.canvas.getContext('2d') : null;
  }

  markLayerDirty(name: LayerName, region?: DirtyRegion): void {
    const layer = this.layers.get(name);
    const tracker = this.dirtyTrackers.get(name);

    if (!layer || !tracker) return;

    layer.dirty = true;

    if (region) {
      tracker.markDirty(region.x, region.y, region.width, region.height);
      layer.dirtyRegions.push(region);
    } else {
      tracker.markFullRedraw();
      layer.dirtyRegions = [];
    }
  }

  updateLayer(
    name: LayerName, 
    renderCallback: (ctx: CanvasRenderingContext2D, regions: DirtyRegion[] | null) => void
  ): void {
    const layer = this.layers.get(name);
    const tracker = this.dirtyTrackers.get(name);

    if (!layer || !tracker || !layer.dirty) return;

    const ctx = layer.canvas.getContext('2d');
    if (!ctx) return;

    const dirtyRegions = tracker.getDirtyRegions();

    // Apply clipping for selective rendering
    if (dirtyRegions && dirtyRegions.length > 0) {
      ctx.save();
      
      // Create clipping path for all dirty regions
      ctx.beginPath();
      for (const region of dirtyRegions) {
        ctx.rect(region.x, region.y, region.width, region.height);
      }
      ctx.clip();

      // Clear clipped areas (important for overlay layer)
      if (name === 'overlay') {
        ctx.clearRect(0, 0, this.width, this.height);
      }

      renderCallback(ctx, dirtyRegions);
      
      ctx.restore();
    } else {
      // Full redraw
      if (name === 'overlay') {
        ctx.clearRect(0, 0, this.width, this.height);
      }
      renderCallback(ctx, null);
    }

    // Clear dirty state
    layer.dirty = false;
    layer.dirtyRegions = [];
    tracker.clear();
  }

  composite(targetCanvas: HTMLCanvasElement): void {
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    // Ensure target canvas is correct size
    if (targetCanvas.width !== this.width || targetCanvas.height !== this.height) {
      targetCanvas.width = this.width;
      targetCanvas.height = this.height;
    }

    // Composite layers in order
    const layerOrder: LayerName[] = ['base', 'updates', 'overlay'];

    for (const layerName of layerOrder) {
      const layer = this.layers.get(layerName);
      if (!layer) continue;

      if (layerName === 'base') {
        // Base layer replaces everything
        ctx.globalCompositeOperation = 'copy';
      } else {
        // Other layers are drawn on top
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.drawImage(layer.canvas, 0, 0);
    }

    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
  }

  compositeToImageBitmap(): Promise<ImageBitmap> {
    // Create temporary canvas for compositing
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.width;
    tempCanvas.height = this.height;
    
    this.composite(tempCanvas);
    
    return createImageBitmap(tempCanvas);
  }

  clear(layerName?: LayerName): void {
    if (layerName) {
      // Clear specific layer
      const layer = this.layers.get(layerName);
      if (layer) {
        const ctx = layer.canvas.getContext('2d');
        if (ctx) {
          if (layerName === 'overlay') {
            ctx.clearRect(0, 0, this.width, this.height);
          } else {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, this.width, this.height);
          }
        }
        layer.dirty = false;
        layer.dirtyRegions = [];
        this.dirtyTrackers.get(layerName)?.clear();
      }
    } else {
      // Clear all layers
      for (const [name, layer] of this.layers) {
        const ctx = layer.canvas.getContext('2d');
        if (ctx) {
          if (name === 'overlay') {
            ctx.clearRect(0, 0, this.width, this.height);
          } else {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, this.width, this.height);
          }
        }
        layer.dirty = false;
        layer.dirtyRegions = [];
      }
      
      for (const tracker of this.dirtyTrackers.values()) {
        tracker.clear();
      }
    }
  }

  hasChanges(): boolean {
    for (const layer of this.layers.values()) {
      if (layer.dirty) return true;
    }
    return false;
  }

  getStats(): {
    [key in LayerName]: {
      dirty: boolean;
      dirtyRegionCount: number;
    };
  } {
    const stats = {} as ReturnType<typeof this.getStats>;

    for (const [name, layer] of this.layers) {
      stats[name] = {
        dirty: layer.dirty,
        dirtyRegionCount: layer.dirtyRegions.length
      };
    }

    return stats;
  }
}