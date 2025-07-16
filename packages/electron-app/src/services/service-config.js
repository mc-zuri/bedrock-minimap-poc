import { app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../../../..');
const packagesDir = path.join(rootDir, 'packages');

const isWindows = process.platform === 'win32';

// In Electron, process.execPath points to the Electron executable
// We need to find the actual Node.js executable
let nodeCommand;
if (process.versions.electron) {
  // When running in Electron, we need to find node on the system
  try {
    if (isWindows) {
      nodeCommand = execSync('where node', { encoding: 'utf8' }).trim().split('\n')[0];
    } else {
      nodeCommand = execSync('which node', { encoding: 'utf8' }).trim();
    }
  } catch (error) {
    // Fallback to just using 'node' and hope it's in PATH
    nodeCommand = 'node';
  }
} else {
  nodeCommand = process.execPath;
}

const npmCliPath = path.join(
  rootDir,
  'node_modules',
  'npm',
  'bin',
  'npm-cli.js'
);

// Check if local npm exists, otherwise use global npm
const useNodeNpm = fs.existsSync(npmCliPath);

// Determine services directory based on whether app is packaged
const isPacked = app.isPackaged;
let servicesDir;

if (isPacked) {
  // In packaged app, services are in the resources directory
  servicesDir = path.join(process.resourcesPath, 'services');
} else {
  // In development, services are in electron-app/services directory
  servicesDir = path.join(__dirname, '../../services');
}

export const services = {
  proxy: {
    name: 'bedrock-proxy-server',
    displayName: 'Minecraft Proxy',
    command: nodeCommand,
    args: [path.join(servicesDir, 'proxy-server', 'index.js')],
    cwd: path.join(servicesDir, 'proxy-server'),
    env: {
      ...process.env,
      MC_SERVER_HOST: process.env.MC_SERVER_HOST || 'localhost',
      MC_SERVER_PORT: process.env.MC_SERVER_PORT || '19132',
      PROXY_PORT: '3001',
      NODE_ENV: 'development'
    },
    port: 3001,
    healthCheck: {
      url: 'http://localhost:3001/health',
      interval: 30000,
      timeout: 5000,
      retries: 3
    }
  },
  minimap: {
    name: 'minimap-server',
    displayName: 'Minimap Server',
    command: nodeCommand,
    args: [path.join(servicesDir, 'minimap-server', 'index.js')],
    cwd: path.join(servicesDir, 'minimap-server'),
    env: {
      ...process.env,
      PORT: '3002',
      PROXY_SERVER_HOST: 'localhost',
      PROXY_SERVER_PORT: '3001',
      NODE_ENV: 'development'
    },
    port: 3002,
    healthCheck: {
      url: 'http://localhost:3002/health',
      interval: 30000,
      timeout: 5000,
      retries: 3
    }
  }
  // Web is served directly by Electron using loadFile()
  // No need for a separate web server process
};

export const getServiceConfig = (serviceName) => {
  return services[serviceName];
};

export const getAllServices = () => {
  return Object.keys(services);
};

export const getServiceStartupOrder = () => {
  return ['proxy', 'minimap']; // Web is served by Electron directly
};

export const getServiceShutdownOrder = () => {
  return ['minimap', 'proxy']; // Reverse order
};