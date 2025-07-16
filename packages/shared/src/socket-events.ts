import type { 
  ChunkData, 
  PlayerPosition, 
  ChunkResponse, 
  InvalidateChunksData,
  BatchUpdateData,
  OreDetectionConfig
} from "./types.js";

// Events from Proxy Server to Minimap Server
export interface ProxyToMinimapEvents {
  "player-position": (data: PlayerPosition) => void;
  "world-reset": () => void;
  "connection-status": (status: { connected: boolean; playerId?: string }) => void;
  "chunk-data": (chunks: ChunkResponse[]) => void;
}

// Events from Minimap Server to Proxy Server
export interface MinimapToProxyEvents {
  subscribe: (playerId: string) => void;
  unsubscribe: (playerId: string) => void;
}

// Events from Minimap Server to Web Client
export interface MinimapToWebEvents {
  "minimap-update": (imageData: string) => void;
  "player-move": (position: { x: number; z: number }) => void;
  "connection-status": (status: { connected: boolean; message: string }) => void;
  "chunk-data": (chunks: (ChunkResponse | ChunkData)[]) => void;
  "batch-update": (data: BatchUpdateData) => void;
}

// Events from Web Client to Minimap Server
export interface WebToMinimapEvents {
  "minimap-click": (position: { x: number; y: number }) => void;
  "request-initial-chunks": () => void;
}

// Socket data attached to connections
export interface SocketData {
  clientId: string;
  connectionTime: Date;
  playerId?: string;
}