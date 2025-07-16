import type { DirtyRegion } from '@minecraft-bedrock-minimap/shared';

export class DirtyRegionTracker {
  private dirtyRegions: DirtyRegion[] = [];
  private fullRedraw = false;
  private readonly maxRegions = 50;

  markDirty(x: number, y: number, width: number, height: number): void {
    // If too many regions, mark full redraw
    if (this.dirtyRegions.length >= this.maxRegions) {
      this.fullRedraw = true;
      return;
    }

    this.dirtyRegions.push({ 
      x, 
      y, 
      width, 
      height, 
      timestamp: Date.now() 
    });
  }

  markChunkDirty(chunkX: number, chunkZ: number, blockSize: number): void {
    const x = chunkX * 16 * blockSize;
    const z = chunkZ * 16 * blockSize;
    const size = 16 * blockSize;
    this.markDirty(x, z, size, size);
  }

  markFullRedraw(): void {
    this.fullRedraw = true;
    this.dirtyRegions = [];
  }

  getDirtyRegions(): DirtyRegion[] | null {
    if (this.fullRedraw) {
      return null; // null = redraw everything
    }
    
    if (this.dirtyRegions.length === 0) {
      return [];
    }

    return this.mergeRegions(this.dirtyRegions);
  }

  private mergeRegions(regions: DirtyRegion[]): DirtyRegion[] {
    if (regions.length <= 1) return regions;

    // Sort by x then y for efficient merging
    regions.sort((a, b) => a.x - b.x || a.y - b.y);

    const merged: DirtyRegion[] = [];
    let current = { ...regions[0] };

    for (let i = 1; i < regions.length; i++) {
      const next = regions[i];
      
      if (this.canMerge(current, next)) {
        current = this.merge(current, next);
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    
    merged.push(current);

    // If merging didn't reduce count significantly, try horizontal strips
    if (merged.length > this.maxRegions * 0.7) {
      return this.mergeIntoStrips(merged);
    }

    return merged;
  }

  private mergeIntoStrips(regions: DirtyRegion[]): DirtyRegion[] {
    // Group regions by Y coordinate ranges
    const strips = new Map<string, DirtyRegion>();

    for (const region of regions) {
      const stripKey = `${Math.floor(region.y / 100)}`; // 100px strips
      const existing = strips.get(stripKey);

      if (existing) {
        strips.set(stripKey, this.merge(existing, region));
      } else {
        strips.set(stripKey, { ...region });
      }
    }

    return Array.from(strips.values());
  }

  private canMerge(a: DirtyRegion, b: DirtyRegion): boolean {
    // Calculate overlap with some tolerance
    const tolerance = 10; // pixels
    
    const overlapX = !(a.x + a.width + tolerance < b.x || 
                      b.x + b.width + tolerance < a.x);
    const overlapY = !(a.y + a.height + tolerance < b.y || 
                      b.y + b.height + tolerance < a.y);

    return overlapX && overlapY;
  }

  private merge(a: DirtyRegion, b: DirtyRegion): DirtyRegion {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const right = Math.max(a.x + a.width, b.x + b.width);
    const bottom = Math.max(a.y + a.height, b.y + b.height);
    
    return {
      x,
      y,
      width: right - x,
      height: bottom - y,
      timestamp: Math.max(a.timestamp, b.timestamp)
    };
  }

  clear(): void {
    this.dirtyRegions = [];
    this.fullRedraw = false;
  }

  hasChanges(): boolean {
    return this.fullRedraw || this.dirtyRegions.length > 0;
  }

  getStats(): { 
    regionCount: number; 
    isFullRedraw: boolean; 
    totalArea: number;
  } {
    if (this.fullRedraw) {
      return {
        regionCount: 1,
        isFullRedraw: true,
        totalArea: Infinity
      };
    }

    const merged = this.getDirtyRegions() || [];
    const totalArea = merged.reduce((sum, region) => 
      sum + (region.width * region.height), 0
    );

    return {
      regionCount: merged.length,
      isFullRedraw: false,
      totalArea
    };
  }

  optimizeForPerformance(canvasWidth: number, canvasHeight: number): void {
    // If dirty area covers more than 60% of canvas, do full redraw
    const stats = this.getStats();
    const canvasArea = canvasWidth * canvasHeight;

    if (stats.totalArea > canvasArea * 0.6) {
      this.markFullRedraw();
    }
  }
}