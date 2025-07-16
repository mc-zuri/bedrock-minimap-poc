import { io, Socket } from "socket.io-client";
import type {
  MinimapToWebEvents,
  WebToMinimapEvents
} from "@minecraft-bedrock-minimap/shared";

// Get socket URL from environment or default
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3002";

// Create typed socket instance
export const socket: Socket<MinimapToWebEvents, WebToMinimapEvents> = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 200,
  reconnectionDelayMax: 500,
  timeout: 20000000,
  transports: ["websocket", "polling"],
});


// Initialize socket connection
export function initializeSocket() {
  console.log(`📡 Connecting to minimap server at ${SOCKET_URL}`);

  // Connect to server
  socket.connect();

  // Debug logging in development
  if (import.meta.env.DEV) {
    socket.on("connect", () => {
      console.log(`✅ Socket connected with ID: ${socket.id}`);
    });

    socket.on("disconnect", (reason) => {
      console.log(`❌ Socket disconnected: ${reason}`);
      if (reason === "io server disconnect") {
        // Server disconnected us, try to reconnect
        socket.connect();
      }
    });

    socket.on("connect_error", (error) => {
      console.error("⚠️ Socket connection error:", error);
    });

    socket.io.on("reconnect", (attempt) => {
      console.log(`🔄 Reconnected after ${attempt} attempts`);
    });

    socket.io.on("reconnect_attempt", (attempt) => {
      console.log(`🔄 Reconnection attempt ${attempt}`);
    });

    socket.io.on("reconnect_error", (error) => {
      console.error("⚠️ Reconnection error:", error);
    });

    socket.io.on("reconnect_failed", () => {
      console.error("❌ Failed to reconnect after maximum attempts");
    });
  }
}

// Cleanup function for HMR
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log("🔥 HMR: Disconnecting socket");
    socket.disconnect();
  });

  import.meta.hot.accept(() => {
    console.log("🔥 HMR: Reconnecting socket");
    socket.connect();
  });
}