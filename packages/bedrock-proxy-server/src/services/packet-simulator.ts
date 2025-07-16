import { PacketDumpReader } from "../utils/packet-dump-reader.js";
import EventEmitter from "events";

export interface PacketData {
  time: bigint;
  type: 'S' | 'C';
  buffer: Buffer;
  data: any;
}

export class PacketSimulator extends EventEmitter {
  private reader: PacketDumpReader | null = null;
  private running = false;
  private startTime: bigint | undefined;

  constructor() {
    super();
  }

  /**
   * Start simulating packets from a dump file
   * @param dumpFile Path to the packet dump file
   */
  async start(dumpFile: string) {
    await this.sleep(1000n);
    if (this.running) {
      console.warn("⚠️ Packet simulator is already running");
      return;
    }

    try {
      this.reader = new PacketDumpReader(dumpFile);
      this.running = true;
      this.startTime = undefined;

      console.log(`📦 Starting packet simulation from: ${dumpFile}`);
      
      await this.simulatePackets();
    } catch (error) {
      console.error("❌ Error starting packet simulator:", error);
      this.stop();
      throw error;
    }
  }

  /**
   * Stop the packet simulation
   */
  stop() {
    this.running = false;
    
    if (this.reader) {
      this.reader.close();
      this.reader = null;
      console.log("📦 Packet simulator stopped");
    }
  }

  /**
   * Main packet simulation loop
   */
  private async simulatePackets() {
    if (!this.reader) return;

    let packet: PacketData | null;
    
    while (this.running && (packet = this.reader.read())) {
      const now = process.hrtime.bigint();
      
      if (this.startTime === undefined) {
        // Initialize start time on the first read
        this.startTime = now - packet.time;
      }
      
      // Calculate timing difference for realistic playback
      const timeDiff = (packet.time + this.startTime) - now;
      
      if (timeDiff > 0) {
        await this.sleep(timeDiff / 1000000n);
      }
      
      // Emit packet event for processing
      this.emit('packet', packet);
    }
    
    // Simulation complete
    console.log("✅ Packet simulation complete");
    this.stop();
    this.emit('complete');
  }

  /**
   * Sleep for specified milliseconds
   */
  private async sleep(ms: bigint): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Number(ms)));
  }

  /**
   * Check if simulator is running
   */
  isRunning(): boolean {
    return this.running;
  }
}