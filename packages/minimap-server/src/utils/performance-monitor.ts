import type { ChunkUpdateBatcher } from "../services/chunk-update-batcher.js";
import type { ClientStateManager } from "../services/client-state-manager.js";
import type { ChunkCacheService } from "../services/chunk-cache.js";

/**
 * Performance metrics for the chunk batching system
 */
export interface PerformanceMetrics {
  // Network metrics
  totalEventsSent: number;
  batchEventsSent: number;
  chunksInBatches: number;
  networkBytesReduced: number;
  averageChunksPerBatch: number;
  
  // Cache metrics
  cacheHitRate: number;
  cacheSize: number;
  staleChunks: number;
  
  // Client metrics
  activeClients: number;
  totalChunksSentToClients: number;
  averageChunksPerClient: number;
  
  // Timing metrics
  averageBatchInterval: number;
  lastBatchTime: number;
  
  // System metrics
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
}

/**
 * Monitors performance of the chunk batching system
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private batchTimestamps: number[] = [];
  private readonly maxTimestampHistory = 100;
  
  constructor(
    private batcher: ChunkUpdateBatcher,
    private clientManager: ClientStateManager,
    private chunkCache: ChunkCacheService
  ) {
    this.metrics = this.initializeMetrics();
  }
  
  /**
   * Initialize metrics with default values
   */
  private initializeMetrics(): PerformanceMetrics {
    return {
      totalEventsSent: 0,
      batchEventsSent: 0,
      chunksInBatches: 0,
      networkBytesReduced: 0,
      averageChunksPerBatch: 0,
      cacheHitRate: 0,
      cacheSize: 0,
      staleChunks: 0,
      activeClients: 0,
      totalChunksSentToClients: 0,
      averageChunksPerClient: 0,
      averageBatchInterval: 0,
      lastBatchTime: 0,
      memoryUsage: {
        heapUsed: 0,
        heapTotal: 0,
        rss: 0
      }
    };
  }
  
  /**
   * Record a batch event being sent
   * @param batchSize Number of chunks in the batch
   * @param bytesSaved Estimated bytes saved by batching
   */
  recordBatchSent(batchSize: number, bytesSaved: number = 0): void {
    this.metrics.batchEventsSent++;
    this.metrics.chunksInBatches += batchSize;
    this.metrics.networkBytesReduced += bytesSaved;
    
    // Update average chunks per batch
    this.metrics.averageChunksPerBatch = 
      this.metrics.batchEventsSent > 0 
        ? this.metrics.chunksInBatches / this.metrics.batchEventsSent 
        : 0;
    
    // Track batch timing
    const now = Date.now();
    this.batchTimestamps.push(now);
    this.metrics.lastBatchTime = now;
    
    // Keep only recent timestamps
    if (this.batchTimestamps.length > this.maxTimestampHistory) {
      this.batchTimestamps.shift();
    }
    
    // Calculate average interval between batches
    if (this.batchTimestamps.length > 1) {
      let totalInterval = 0;
      for (let i = 1; i < this.batchTimestamps.length; i++) {
        totalInterval += this.batchTimestamps[i] - this.batchTimestamps[i - 1];
      }
      this.metrics.averageBatchInterval = totalInterval / (this.batchTimestamps.length - 1);
    }
  }
  
  /**
   * Record a regular (non-batched) event being sent
   */
  recordRegularEventSent(): void {
    this.metrics.totalEventsSent++;
  }
  
  /**
   * Update metrics from dependent services
   */
  updateMetrics(): void {
    // Update cache metrics
    const cacheStats = this.chunkCache.getStats();
    this.metrics.cacheHitRate = cacheStats.hitRate * 100;
    this.metrics.cacheSize = cacheStats.size;
    
    // Count stale chunks (simplified - would need cache modification to track)
    this.metrics.staleChunks = 0; // TODO: Implement stale chunk counting
    
    // Update client metrics
    const clientStats = this.clientManager.getStats();
    this.metrics.activeClients = clientStats.totalClients;
    this.metrics.totalChunksSentToClients = clientStats.totalChunksSent;
    this.metrics.averageChunksPerClient = 
      clientStats.totalClients > 0 
        ? clientStats.totalChunksSent / clientStats.totalClients 
        : 0;
    
    // Update memory metrics
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss
    };
  }
  
  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }
  
  /**
   * Get formatted metrics for logging
   */
  getFormattedMetrics(): string {
    const metrics = this.getMetrics();
    
    const reductionPercent = metrics.totalEventsSent > 0
      ? ((1 - (metrics.batchEventsSent / metrics.totalEventsSent)) * 100).toFixed(1)
      : '0.0';
    
    const memoryMB = {
      heapUsed: (metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(1),
      heapTotal: (metrics.memoryUsage.heapTotal / 1024 / 1024).toFixed(1),
      rss: (metrics.memoryUsage.rss / 1024 / 1024).toFixed(1)
    };
    
    return `
📊 Performance Metrics:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Network:
  • Total Events: ${metrics.totalEventsSent}
  • Batch Events: ${metrics.batchEventsSent}
  • Reduction: ${reductionPercent}%
  • Avg Chunks/Batch: ${metrics.averageChunksPerBatch.toFixed(1)}
  • Bytes Saved: ${(metrics.networkBytesReduced / 1024).toFixed(1)} KB
  
Cache:
  • Hit Rate: ${metrics.cacheHitRate.toFixed(1)}%
  • Size: ${metrics.cacheSize}/${this.chunkCache.getStats().maxSize}
  • Stale Chunks: ${metrics.staleChunks}
  
Clients:
  • Active: ${metrics.activeClients}
  • Total Chunks Sent: ${metrics.totalChunksSentToClients}
  • Avg Chunks/Client: ${metrics.averageChunksPerClient.toFixed(1)}
  
Timing:
  • Avg Batch Interval: ${metrics.averageBatchInterval.toFixed(0)}ms
  • Pending Updates: ${this.batcher.getPendingCount()}
  
Memory:
  • Heap Used: ${memoryMB.heapUsed} MB
  • Heap Total: ${memoryMB.heapTotal} MB
  • RSS: ${memoryMB.rss} MB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = this.initializeMetrics();
    this.batchTimestamps = [];
  }
  
  /**
   * Start periodic logging of metrics
   * @param intervalMs Interval in milliseconds (default: 60 seconds)
   * @returns Function to stop the periodic logging
   */
  startPeriodicLogging(intervalMs: number = 60000): () => void {
    const interval = setInterval(() => {
      console.log(this.getFormattedMetrics());
    }, intervalMs);
    
    return () => clearInterval(interval);
  }
}