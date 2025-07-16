import PrismarineRegistry, { type RegistryBedrock } from 'prismarine-registry';
import PrismarineChunk, { type BedrockChunk } from 'prismarine-chunk';


import type { ChunkRequest, ChunkResponse } from '@minecraft-bedrock-minimap/shared';
import { BedrockWorld } from "../world/BedrockWorld.js";

export class ChunkService {
  private registry: RegistryBedrock;
  private ChunkColumn: typeof BedrockChunk;
  private world: BedrockWorld;

  constructor(version: string = '1.21.93', world: BedrockWorld | null = null) {
    this.registry = PrismarineRegistry(`bedrock_${version}`) as RegistryBedrock;
    this.ChunkColumn = (PrismarineChunk as any)(this.registry) as typeof BedrockChunk;
    this.world = world ?? new BedrockWorld(null);
  }

  async processChunkRequest(chunkX: number, chunkZ: number): Promise<ChunkResponse> {
    try {
      let chunk = await this.world.getColumn(chunkX, chunkZ);

      if (!chunk) {
        return {
          chunkX,
          chunkZ,
          data: null,
          success: false,
          error: `Chunk not found at coordinates (${chunkX}, ${chunkZ})`
        };
      }

      // Serialize chunk data using toJson()
      const response: ChunkResponse = {
        chunkX,
        chunkZ,
        data: chunk.toJson(),
        success: true
      };
      return response;
    } catch (error: unknown) {
      // Return error response
      return {
        chunkX,
        chunkZ,
        data: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error processing chunk request'
      };
    }
  }

  // Process multiple chunk requests
  async processChunkRequests(chunks: ChunkRequest[]): Promise<ChunkResponse[]> {
    // Process requests in parallel for performance
    const chunkPromises = chunks.map(({ chunkX, chunkZ }) =>
      this.processChunkRequest(chunkX, chunkZ)
    );

    return Promise.all(chunkPromises);
  }
}