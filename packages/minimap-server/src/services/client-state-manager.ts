import type { ChunkUpdateEntry } from "@minecraft-bedrock-minimap/shared";

/**
 * Client state information
 */
interface ClientState {
  socketId: string;
  clientId: string;
  sentChunks: Map<string, number>; // chunkKey -> timestamp
  pendingUpdates: Map<string, ChunkUpdateEntry>;
  lastBatchId: string;
  connectionTime: number;
}

/**
 * Manages per-client state for chunk tracking and updates
 * Ensures each client receives appropriate chunk updates based on their state
 */
export class ClientStateManager {
  private clients = new Map<string, ClientState>();
  private clientIdToSocketId = new Map<string, string>();

  /**
   * Add a new client to track
   * @param socketId Socket.io connection ID
   * @param clientId Unique client identifier
   */
  addClient(socketId: string, clientId: string): void {
    // Clean up any existing state for this client
    if (this.clientIdToSocketId.has(clientId)) {
      const oldSocketId = this.clientIdToSocketId.get(clientId)!;
      this.clients.delete(oldSocketId);
    }

    const state: ClientState = {
      socketId,
      clientId,
      sentChunks: new Map(),
      pendingUpdates: new Map(),
      lastBatchId: '',
      connectionTime: Date.now()
    };

    this.clients.set(socketId, state);
    this.clientIdToSocketId.set(clientId, socketId);
  }

  /**
   * Remove a client and clean up their state
   * @param socketId Socket.io connection ID
   */
  removeClient(socketId: string): void {
    const client = this.clients.get(socketId);
    if (client) {
      this.clientIdToSocketId.delete(client.clientId);
      this.clients.delete(socketId);
    }
  }

  /**
   * Get client state by socket ID
   * @param socketId Socket.io connection ID
   * @returns Client state or undefined if not found
   */
  getClient(socketId: string): ClientState | undefined {
    return this.clients.get(socketId);
  }

  /**
   * Get client state by client ID
   * @param clientId Unique client identifier
   * @returns Client state or undefined if not found
   */
  getClientByClientId(clientId: string): ClientState | undefined {
    const socketId = this.clientIdToSocketId.get(clientId);
    return socketId ? this.clients.get(socketId) : undefined;
  }

  /**
   * Mark a chunk as sent to a client
   * @param socketId Socket.io connection ID
   * @param chunkKey Chunk identifier
   * @param timestamp When the chunk was sent
   */
  markChunkSent(socketId: string, chunkKey: string, timestamp: number): void {
    const client = this.clients.get(socketId);
    if (client) {
      client.sentChunks.set(chunkKey, timestamp);
      // Remove from pending if it was there
      client.pendingUpdates.delete(chunkKey);
    }
  }

  /**
   * Check if a chunk has been sent to a client
   * @param socketId Socket.io connection ID
   * @param chunkKey Chunk identifier
   * @returns True if chunk has been sent
   */
  hasChunkBeenSent(socketId: string, chunkKey: string): boolean {
    const client = this.clients.get(socketId);
    return client ? client.sentChunks.has(chunkKey) : false;
  }

  /**
   * Get the timestamp when a chunk was sent
   * @param socketId Socket.io connection ID
   * @param chunkKey Chunk identifier
   * @returns Timestamp or undefined
   */
  getChunkSentTime(socketId: string, chunkKey: string): number | undefined {
    const client = this.clients.get(socketId);
    return client ? client.sentChunks.get(chunkKey) : undefined;
  }

  /**
   * Add a pending update for a client
   * @param socketId Socket.io connection ID
   * @param chunkKey Chunk identifier
   * @param update The update to queue
   */
  addPendingUpdate(socketId: string, chunkKey: string, update: ChunkUpdateEntry): void {
    const client = this.clients.get(socketId);
    if (client) {
      client.pendingUpdates.set(chunkKey, update);
    }
  }

  /**
   * Get all pending updates for a client
   * @param socketId Socket.io connection ID
   * @returns Array of pending updates
   */
  getPendingUpdates(socketId: string): ChunkUpdateEntry[] {
    const client = this.clients.get(socketId);
    if (!client) return [];
    
    return Array.from(client.pendingUpdates.values());
  }

  /**
   * Clear pending updates for a client
   * @param socketId Socket.io connection ID
   * @param chunkKeys Optional array of specific chunks to clear
   */
  clearPendingUpdates(socketId: string, chunkKeys?: string[]): void {
    const client = this.clients.get(socketId);
    if (!client) return;

    if (chunkKeys) {
      chunkKeys.forEach(key => client.pendingUpdates.delete(key));
    } else {
      client.pendingUpdates.clear();
    }
  }

  /**
   * Update the last batch ID for a client
   * @param socketId Socket.io connection ID
   * @param batchId The batch identifier
   */
  setLastBatchId(socketId: string, batchId: string): void {
    const client = this.clients.get(socketId);
    if (client) {
      client.lastBatchId = batchId;
    }
  }

  /**
   * Get all sent chunks for a client (for reconnection)
   * @param clientId Unique client identifier
   * @returns Map of chunk keys to timestamps
   */
  getSentChunksForClient(clientId: string): Map<string, number> {
    const client = this.getClientByClientId(clientId);
    return client ? new Map(client.sentChunks) : new Map();
  }

  /**
   * Handle client reconnection by transferring state
   * @param oldSocketId Previous socket ID
   * @param newSocketId New socket ID
   * @param clientId Client identifier
   */
  handleReconnection(oldSocketId: string, newSocketId: string, clientId: string): void {
    const existingState = this.getClientByClientId(clientId);
    
    if (existingState) {
      // Transfer state to new socket
      const newState: ClientState = {
        socketId: newSocketId,
        clientId,
        sentChunks: new Map(existingState.sentChunks),
        pendingUpdates: new Map(existingState.pendingUpdates),
        lastBatchId: existingState.lastBatchId,
        connectionTime: Date.now()
      };

      this.clients.delete(existingState.socketId);
      this.clients.set(newSocketId, newState);
      this.clientIdToSocketId.set(clientId, newSocketId);
    } else {
      // No existing state, treat as new client
      this.addClient(newSocketId, clientId);
    }
  }

  /**
   * Get statistics about client states
   * @returns Object with client statistics
   */
  getStats(): {
    totalClients: number;
    totalChunksSent: number;
    totalPendingUpdates: number;
    clientDetails: Array<{
      clientId: string;
      chunksSent: number;
      pendingUpdates: number;
      connectionDuration: number;
    }>;
  } {
    const clientDetails = Array.from(this.clients.values()).map(client => ({
      clientId: client.clientId,
      chunksSent: client.sentChunks.size,
      pendingUpdates: client.pendingUpdates.size,
      connectionDuration: Date.now() - client.connectionTime
    }));

    return {
      totalClients: this.clients.size,
      totalChunksSent: clientDetails.reduce((sum, c) => sum + c.chunksSent, 0),
      totalPendingUpdates: clientDetails.reduce((sum, c) => sum + c.pendingUpdates, 0),
      clientDetails
    };
  }

  /**
   * Clean up old sent chunk records to prevent memory growth
   * @param maxAge Maximum age in milliseconds (default: 5 minutes)
   */
  cleanupOldChunks(maxAge: number = 5 * 60 * 1000): void {
    const cutoffTime = Date.now() - maxAge;
    
    this.clients.forEach(client => {
      const keysToDelete: string[] = [];
      
      client.sentChunks.forEach((timestamp, key) => {
        if (timestamp < cutoffTime) {
          keysToDelete.push(key);
        }
      });
      
      keysToDelete.forEach(key => client.sentChunks.delete(key));
    });
  }
}