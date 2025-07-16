import { config as dotenvConfig } from "dotenv";
import { settingsLoader } from "./settings-loader.js";

// Load environment variables
dotenvConfig();

// Get proxy settings
const proxySettings = settingsLoader.getSettings();

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3002").split(","),
  logLevel: process.env.LOG_LEVEL || "info",
  environment: process.env.NODE_ENV || "development",
  proxySettings,
  settingsLoader
};