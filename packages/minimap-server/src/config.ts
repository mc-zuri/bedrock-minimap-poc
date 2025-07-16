import { config as dotenvConfig } from "dotenv";
import type { OreDetectionConfig } from "@minecraft-bedrock-minimap/shared";
import { OreType, DEFAULT_ORE_DETECTION_CONFIG } from "@minecraft-bedrock-minimap/shared";

// Load environment variables
dotenvConfig();

export const config = {
  // Server configuration
  port: parseInt(process.env.PORT || "3002", 10),
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000").split(","),

  // Proxy server connection
  proxyUrl: process.env.PROXY_URL || "http://localhost:3001",

  // Connection options
  reconnection: process.env.RECONNECTION !== "false",
  reconnectionDelay: parseInt(process.env.RECONNECTION_DELAY || "1000", 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || "info",
  environment: process.env.NODE_ENV || "development",

  // Cache configuration
  cacheSize: parseInt(process.env.CHUNK_CACHE_SIZE || "100000", 10),
};

// Default ore detection configuration (using shared default)
export const defaultOreDetectionConfig: OreDetectionConfig = {
  ...DEFAULT_ORE_DETECTION_CONFIG
};