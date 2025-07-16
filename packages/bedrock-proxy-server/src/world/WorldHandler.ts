import PrismarineRegistry, { type RegistryBedrock } from 'prismarine-registry';
import PrismarineChunk, { BlobEntry, type BedrockChunk } from 'prismarine-chunk';
import { BedrockWorld } from './BedrockWorld.ts';
import assert from 'assert';

const BlobType = {
    ChunkSection: 0,
    Biomes: 1,
}

export class WorldHandler {
    world: BedrockWorld;
    protected cachingEnabled = false;
    ChunkColumn!: typeof BedrockChunk;
    blobStore = new BlobStore();
    sentMiss = false;
    gotMiss = false;
    registry: RegistryBedrock;

    subChunkMissHashes: any[] = [];
    lostSubChunks = 0;
    foundSubChunks = 0;

    data: any;
    keys: any = {};

    states: Record<number, string> = {};
    client: any;
    onData?: (chunkX: number, chunkZ: number) => void;

    constructor(client: any, world: BedrockWorld, version: string, onData?: (chunkX: number, chunkZ: number) => void) {
        this.world = world;
        this.client = client;
        this.onData = onData;
        this.registry = PrismarineRegistry(`bedrock_${version}`) as any;
        this.ChunkColumn = (PrismarineChunk as any)(
            this.registry as any
        ) as typeof BedrockChunk;
    }

    handle_join_packet() {
        this.client.queue("client_cache_status", { enabled: this.cachingEnabled });
    }

    on_update_block(packet: any, fn: (block: any) => void) {
        const chunk = this.world.getLoadedColumnAt(packet.position);
        const newBlock = this.registry.blocksByStateId[packet.block_runtime_id];
        if (chunk) {
            chunk.setBlock(packet.position, {
                ...(newBlock as any),
                stateId: packet.block_runtime_id,
            });
            fn(newBlock);
        }
    }

    async on_level_chunk(packet: any) {
        const cc = new this.ChunkColumn({ x: packet.x, z: packet.z });
        if (!this.cachingEnabled) {
            await cc.networkDecodeNoCache(packet.payload, packet.sub_chunk_count);
        } else if (this.cachingEnabled) {
            const misses = await cc.networkDecode(
                packet.blobs.hashes,
                this.blobStore,
                packet.payload
            );
            if (!packet.blobs.hashes.length) return;

            this.client?.queue("client_cache_blob_status", {
                misses: misses.length,
                haves: 0,
                have: [],
                missing: misses,
            });

            if (packet.sub_chunk_count < 0) {
                // 1.18+
                for (const miss of misses)
                    this.blobStore.addPending(
                        miss,
                        new BlobEntry({ type: BlobType.Biomes, x: packet.x, z: packet.z })
                    );
            } else {
                // 1.17-
                const lastBlob = packet.blobs.hashes[packet.blobs.hashes.length - 1];
                for (const miss of misses) {
                    this.blobStore.addPending(
                        miss,
                        new BlobEntry({
                            type: miss === lastBlob ? BlobType.Biomes : BlobType.ChunkSection,
                            x: packet.x,
                            z: packet.z,
                        })
                    );
                }
                this.sentMiss = true;
            }

            this.blobStore.once(misses, async () => {
                const now = await cc.networkDecode(
                    packet.blobs.hashes,
                    this.blobStore,
                    packet.payload
                );
                assert.strictEqual(now.length, 0);

                this.client.queue("client_cache_blob_status", {
                    misses: 0,
                    haves: packet.blobs.hashes.length,
                    have: packet.blobs.hashes,
                    missing: [],
                });

                this.gotMiss = true;
            });
        }

        if (packet.sub_chunk_count < 0) {
            // 1.18.0+
            const maxSubChunkCount = packet.highest_subchunk_count || 5;

            if (this.registry.version[">="]("1.18.11")) {
                const requests: object[] = [];
                for (let i = 1; i < Math.min(maxSubChunkCount, 5); i++)
                    requests.push({ dx: 0, dz: 0, dy: i });
                this.client?.queue?.("subchunk_request", {
                    origin: { x: packet.x, z: packet.z, y: 0 },
                    requests,
                    dimension: 0,
                });
            } else if (this.registry.version[">="]("1.18")) {
                for (let i = 1; i < Math.min(maxSubChunkCount, 5); i++) {
                    this.client?.queue("subchunk_request", {
                        x: packet.x,
                        z: packet.z,
                        y: i,
                        dimension: 0,
                    });
                }
            }
        }

        await this.world.setColumn(packet.x, packet.z, cc);
        // Notify about new chunk
        this.onData?.(packet.x, packet.z);
    }

    async on_subchunk(packet: any) {
        if (packet.entries) {
            // 1.18.10+ handling
            for (const entry of packet.entries) {
                const x = packet.origin.x + entry.dx;
                const y = packet.origin.y + entry.dy;
                const z = packet.origin.z + entry.dz;
                const cc = this.world.getLoadedColumn(x, z);
                if (entry.result === "success") {
                    this.foundSubChunks++;

                    if (packet.cache_enabled) {
                        await this.loadCached(cc, x, y, z, entry.blob_id, entry.payload);
                    } else {
                        await cc.networkDecodeSubChunkNoCache(y, entry.payload);

                        this.onData?.(cc.x, cc.z);
                    }
                } else {
                    this.lostSubChunks++;
                }
            }
        } else {
            if (packet.request_result !== "success") {
                this.lostSubChunks++;
                return;
            }
            this.foundSubChunks++;
            const cc = this.world.getLoadedColumn(packet.x, packet.z);
            if (packet.cache_enabled) {
                await this.loadCached(
                    cc,
                    packet.x,
                    packet.y,
                    packet.z,
                    packet.blob_id,
                    packet.data
                );
            } else {
                await cc.networkDecodeSubChunkNoCache(packet.y, packet.data);
                this.onData?.(cc.x, cc.z);
            }
        }
    }

    async on_client_cache_miss_response(packet: any) {
        const acks: any = [];
        for (const { hash, payload } of packet.blobs) {
            const name = hash.toString();
            this.blobStore.updatePending(name, { buffer: payload });
            acks.push(hash);
        }

        this.client.queue("client_cache_blob_status", {
            misses: 0,
            haves: acks.length,
            have: [],
            missing: acks,
        });
    }

    async loadCached(
        cc: any,
        x: any,
        y: any,
        z: any,
        blobId: any,
        extraData: any
    ) {
        const misses = await cc.networkDecodeSubChunk(
            [blobId],
            this.blobStore,
            extraData
        );
        this.subChunkMissHashes.push(...misses);

        for (const miss of misses) {
            this.blobStore.addPending(
                miss,
                new BlobEntry({ type: BlobType.ChunkSection, x, z, y })
            );
        }

        if (this.subChunkMissHashes.length >= 10) {
            this.sentMiss = true;
            const r = {
                misses: this.subChunkMissHashes.length,
                haves: 0,
                have: [],
                missing: this.subChunkMissHashes,
            };

            this.client?.queue("client_cache_blob_status", r);
            this.subChunkMissHashes = [];
        }

        if (misses.length) {
            const [missed] = misses;

            this.blobStore.once([missed], async () => {
                this.gotMiss = true;
                const misses = await cc.networkDecodeSubChunk([missed], this.blobStore);
                assert(!misses.length, "Should not have missed anything");
            });
        }
    }

    /**
     * Clean up resources and event listeners
     */
    cleanup() {
        // Clear BlobStore and its listeners
        this.blobStore.wanted = [];
        this.blobStore.pending = {};
        this.blobStore.clear();
        
        // Clear event handlers
        if (this.onData) {
            this.onData = undefined;
        }
        
        // Clear client reference
        this.client = null;
        
        // Clear registry reference
        this.registry = null as any;
        
        // Clear large data structures
        if (this.states) {
            this.states = {};
        }
        if (this.keys) {
            this.keys = {};
        }
        if (this.subChunkMissHashes) {
            this.subChunkMissHashes = [];
        }
        if (this.data) {
            this.data = null;
        }
        
        // Remove all event listeners from world
        if (this.world) {
            this.world.removeAllListeners();
        }
    }

}

export class BlobStore extends Map {
    pending: any = {};
    wanted: any[] = [];

    set(key: any, value: any) {
        const ret = super.set(key.toString(), value);
        this.wanted.forEach(
            (wanted) =>
            (wanted[0] = wanted[0].filter(
                (hash: any) => hash.toString() !== key.toString()
            ))
        );
        for (const i in this.wanted) {
            const [outstandingBlobs, cb] = this.wanted[i];
            if (!outstandingBlobs.length) {
                cb();
                delete this.wanted[i];
            }
        }
        return ret;
    }

    get(key: any) {
        return super.get(key.toString());
    }

    has(key: any) {
        return super.has(key.toString());
    }

    addPending(hash: any, blob: any) {
        this.pending[hash.toString()] = blob;
    }

    updatePending(hash: string, value: any) {
        const name = hash.toString();
        if (this.pending[name]) {
            this.set(name, Object.assign(this.pending[name], value));
        } else {
            throw new Error("No pending blob for hash " + name);
        }
    }

    once(wantedBlobs: any, cb: any) {
        const outstanding: any[] = [];
        for (const wanted of wantedBlobs) {
            if (!this.has(wanted)) outstanding.push(wanted);
        }

        if (outstanding.length) {
            this.wanted.push([outstanding, cb]);
        } else {
            cb();
        }
    }
}