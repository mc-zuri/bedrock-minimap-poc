import { app, BrowserWindow, ipcMain, Menu, protocol, net } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config as dotenvConfig } from "dotenv";
import { OverlayConfig } from "./overlay-config.js";
import { ProxyConfig } from "./proxy-config.js";
import { createContextMenu } from "./context-menu.js";
import { processManager } from "./services/process-manager.js";
import { logAggregator } from "./services/log-aggregator.js";
import { healthMonitor } from "./services/health-monitor.js";

// Load environment variables
dotenvConfig();

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const WEB_URL = process.env.WEB_URL || "http://localhost:3000";
const DEV_MODE = process.env.NODE_ENV !== "production";

let mainWindow = null;
let overlayConfig = null;
let proxyConfig = null;
let contextMenu = null;

function createWindow() {
  console.log(`🚀 Creating Electron overlay window for ${WEB_URL}`);
  
  // Initialize overlay configuration
  overlayConfig = new OverlayConfig();
  const settings = overlayConfig.getAll();
  
  // Initialize proxy configuration
  proxyConfig = new ProxyConfig();
  
  // Platform-specific transparency checks
  if (process.platform === 'linux') {
    console.log(`🐧 Linux detected - checking for transparency support`);
    console.log(`   DISPLAY: ${process.env.DISPLAY || 'not set'}`);
    console.log(`   WAYLAND_DISPLAY: ${process.env.WAYLAND_DISPLAY || 'not set'}`);
  }
  
  // Create the browser window with overlay settings
  const windowOptions = {
    ...settings.windowBounds,
    alwaysOnTop: settings.alwaysOnTop,
    frame: !settings.frameless,
    resizable: true,
    minWidth: 200,
    minHeight: 200,
    maxWidth: 800,
    maxHeight: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      preload: join(__dirname, 'preload.js')
    },
    title: "Minecraft Bedrock Minimap - Overlay",
    icon: undefined, // Add icon path if available
    show: false, // Don't show until ready
  };

  // Add opacity/transparency options based on platform
  if (process.platform === 'win32' || process.platform === 'darwin') {
    // Windows and macOS support opacity directly
    windowOptions.opacity = settings.opacity;
  } else if (process.platform === 'linux') {
    // Linux may need transparent background for opacity to work
    if (process.env.WAYLAND_DISPLAY) {
      console.log(`🌊 Wayland detected - opacity may be limited`);
      // Don't set transparent on Wayland as it can cause issues
      windowOptions.opacity = settings.opacity;
    } else {
      console.log(`🖥️ X11 detected - enabling transparency`);
      windowOptions.transparent = true;
      windowOptions.opacity = settings.opacity;
    }
  }

  mainWindow = new BrowserWindow(windowOptions);
  
  // Hide the default menu bar for overlay mode
  //mainWindow.setMenuBarVisibility(false);
  
  // Create context menu
  contextMenu = createContextMenu(mainWindow, overlayConfig);
  
  // Setup context menu on right-click
  mainWindow.webContents.on('context-menu', (event, params) => {
    contextMenu.popup({ window: mainWindow, x: params.x, y: params.y });
  });
  
  // Load the built HTML file directly from filesystem
  let builtWebPath, builtWebDir;
  
  if (app.isPackaged) {
    // In packaged app, web assets are in resources/services/web
    builtWebPath = join(process.resourcesPath, 'services/web/index.html');
    builtWebDir = join(process.resourcesPath, 'services/web');
  } else {
    // In development, web assets are in electron-app/services/web
    builtWebPath = join(__dirname, '../services/web/index.html');
    builtWebDir = join(__dirname, '../services/web');
  }
  
  // Load the file with proper base URL for assets
  mainWindow.loadFile(builtWebPath, {
    baseURLForDataURL: `file://${builtWebDir}/`
  });
  
  // Show window when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    
    // Set opacity after window is shown (required on some platforms)
    setTimeout(() => {
      try {
        // Try setting opacity multiple times for problematic platforms
        mainWindow.setOpacity(settings.opacity);
        
        // Wait a bit and try again if it didn't work
        setTimeout(() => {
          const actualOpacity = mainWindow.getOpacity();
          if (Math.abs(actualOpacity - settings.opacity) > 0.01) {
            console.log(`🔄 Retrying opacity setting...`);
            mainWindow.setOpacity(settings.opacity);
          }
          
          console.log("✅ Electron overlay window ready and visible");
          console.log(`   📊 Opacity: ${(settings.opacity * 100).toFixed(0)}% (actual: ${(mainWindow.getOpacity() * 100).toFixed(0)}%)`);
          console.log(`   📌 Always on top: ${settings.alwaysOnTop}`);
          console.log(`   🖼️ Frameless: ${settings.frameless}`);
          console.log(`   🖥️ Platform: ${process.platform}`);
          
          // Show a warning if opacity isn't working
          if (Math.abs(mainWindow.getOpacity() - settings.opacity) > 0.01) {
            console.warn(`⚠️ Opacity not applied correctly. This may be due to window manager limitations on ${process.platform}.`);
            if (process.platform === 'linux') {
              console.warn(`   Try enabling transparency in your window manager or use X11 instead of Wayland.`);
            }
          }
        }, 200);
        
      } catch (error) {
        console.warn("⚠️ Failed to set opacity:", error.message);
        console.log("✅ Electron overlay window ready and visible (opacity not supported)");
      }
    }, 100);
  });
  
  // Open DevTools in development
  if (DEV_MODE) {
    //mainWindow.webContents.openDevTools();
  }
  
  // Handle window close request
  mainWindow.on('close', async (event) => {
    if (!isCleaningUp) {
      event.preventDefault();
      isCleaningUp = true;
      
      await performCleanup();
      
      mainWindow.destroy();
    }
  });
  
  // Handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
    overlayConfig = null;
    contextMenu = null;
  });
  
  // Persist window bounds on resize/move
  mainWindow.on('bounds-changed', () => {
    if (overlayConfig) {
      overlayConfig.setWindowBounds(mainWindow.getBounds());
    }
  });
  
  // Handle navigation - prevent navigation to external URLs
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(WEB_URL)) {
      event.preventDefault();
      console.warn(`⚠️ Prevented navigation to: ${url}`);
    }
  });
  
  // Handle new window requests - prevent external popups
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
  
  // Log any errors
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    console.error(`❌ Failed to load: ${errorDescription} (${errorCode})`);
  });
  
  // Log successful load
  mainWindow.webContents.on("did-finish-load", () => {
    console.log("✅ Web content loaded successfully");
  });
}

// Remove duplicate whenReady() - keeping only the one at the bottom

// Flag to track if we're already cleaning up
let isCleaningUp = false;

// Comprehensive cleanup function with timeout
async function performCleanup() {
  console.log('🛑 Starting comprehensive cleanup...');
  
  return new Promise(async (resolve) => {
    // Set maximum cleanup time
    const cleanupTimeout = setTimeout(() => {
      console.warn('⚠️ Cleanup timeout reached, forcing exit...');
      resolve();
    }, 10000); // 10 second maximum
    
    try {
      // Stop all services with process tree cleanup
      await processManager.stopAllServices();
      console.log('✅ All services stopped successfully');
      
      // Clear any remaining intervals or timers
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.removeAllListeners();
      }
      
      clearTimeout(cleanupTimeout);
      resolve();
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
      clearTimeout(cleanupTimeout);
      resolve();
    }
  });
}

// Single handler for app quit
app.on('before-quit', async (event) => {
  if (!isCleaningUp) {
    event.preventDefault();
    isCleaningUp = true;
    
    await performCleanup();
    
    // Force quit after cleanup
    app.exit(0);
  }
});

// Quit when all windows are closed
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Security: Prevent new window creation
app.on("web-contents-created", (event, contents) => {
  contents.on("new-window", (event) => {
    event.preventDefault();
  });
});

// Handle certificate errors
app.on("certificate-error", (event, webContents, url, error, certificate, callback) => {
  if (DEV_MODE) {
    // Ignore certificate errors in development
    event.preventDefault();
    callback(true);
  } else {
    // Use default behavior in production
    callback(false);
  }
});

// Log app info
console.log(`📍 Electron: ${process.versions.electron}`);
console.log(`📍 Node: ${process.versions.node}`);
console.log(`📍 Chrome: ${process.versions.chrome}`);
console.log(`📍 Web URL: ${WEB_URL}`);

// IPC handlers for overlay functionality
function setupIpcHandlers() {
  // Opacity controls
  ipcMain.handle('set-opacity', (event, opacity) => {
    if (overlayConfig && mainWindow) {
      const actualOpacity = overlayConfig.setOpacity(opacity);
      mainWindow.setOpacity(actualOpacity);
      return actualOpacity;
    }
    return null;
  });

  ipcMain.handle('get-opacity', () => {
    return overlayConfig ? overlayConfig.getOpacity() : null;
  });

  ipcMain.handle('adjust-opacity', (event, delta) => {
    if (overlayConfig && mainWindow) {
      const currentOpacity = overlayConfig.getOpacity();
      const newOpacity = currentOpacity + delta;
      const actualOpacity = overlayConfig.setOpacity(newOpacity);
      mainWindow.setOpacity(actualOpacity);
      return actualOpacity;
    }
    return null;
  });

  // Window controls
  ipcMain.handle('set-always-on-top', (event, enabled) => {
    if (overlayConfig && mainWindow) {
      overlayConfig.set('alwaysOnTop', enabled);
      mainWindow.setAlwaysOnTop(enabled);
      return enabled;
    }
    return null;
  });

  ipcMain.handle('toggle-always-on-top', () => {
    if (overlayConfig && mainWindow) {
      const newValue = overlayConfig.toggleAlwaysOnTop();
      mainWindow.setAlwaysOnTop(newValue);
      return newValue;
    }
    return null;
  });

  ipcMain.handle('set-frameless', (event, enabled) => {
    if (overlayConfig) {
      overlayConfig.set('frameless', enabled);
      // Note: Frame changes require restart
      return enabled;
    }
    return null;
  });

  ipcMain.handle('toggle-frameless', () => {
    if (overlayConfig) {
      const newValue = overlayConfig.toggleFrameless();
      // Note: Frame changes require restart
      return newValue;
    }
    return null;
  });

  // Overlay mode
  ipcMain.handle('set-overlay-mode', (event, enabled) => {
    if (overlayConfig) {
      overlayConfig.set('overlayMode', enabled);
      return enabled;
    }
    return null;
  });

  ipcMain.handle('toggle-overlay-mode', () => {
    if (overlayConfig) {
      const newValue = overlayConfig.toggleOverlayMode();
      return newValue;
    }
    return null;
  });

  ipcMain.handle('get-overlay-mode', () => {
    return overlayConfig ? overlayConfig.get('overlayMode') : null;
  });

  // Window management
  ipcMain.handle('minimize-window', () => {
    if (mainWindow) {
      mainWindow.minimize();
      return true;
    }
    return false;
  });

  ipcMain.handle('close-window', () => {
    if (mainWindow) {
      mainWindow.close();
      return true;
    }
    return false;
  });

  ipcMain.handle('maximize-window', () => {
    if (mainWindow) {
      mainWindow.maximize();
      return true;
    }
    return false;
  });

  ipcMain.handle('unmaximize-window', () => {
    if (mainWindow) {
      mainWindow.unmaximize();
      return true;
    }
    return false;
  });

  ipcMain.handle('is-maximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  // Settings
  ipcMain.handle('get-settings', () => {
    return overlayConfig ? overlayConfig.getAll() : null;
  });

  ipcMain.handle('reset-settings', () => {
    if (overlayConfig && mainWindow) {
      overlayConfig.reset();
      const settings = overlayConfig.getAll();
      
      // Apply reset settings to window
      mainWindow.setOpacity(settings.opacity);
      mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
      mainWindow.setBounds(settings.windowBounds);
      
      return settings;
    }
    return null;
  });
  
  // Proxy settings handlers
  ipcMain.handle('proxy-settings:get-all', () => {
    return proxyConfig ? proxyConfig.getAll() : null;
  });
  
  ipcMain.handle('proxy-settings:set-all', (event, settings) => {
    if (proxyConfig) {
      try {
        const updatedSettings = proxyConfig.setAll(settings);
        
        // Notify all windows about the change
        BrowserWindow.getAllWindows().forEach(window => {
          window.webContents.send('proxy-settings:changed', updatedSettings);
        });
        
        return { success: true, settings: updatedSettings };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: 'Proxy config not initialized' };
  });
  
  ipcMain.handle('proxy-settings:reset', () => {
    if (proxyConfig) {
      const settings = proxyConfig.reset();
      
      // Notify all windows about the change
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('proxy-settings:changed', settings);
      });
      
      return { success: true, settings };
    }
    return { success: false, error: 'Proxy config not initialized' };
  });
  
  let previousConfig = null;
  
  ipcMain.handle('proxy-settings:restart-proxy', async () => {
    if (proxyConfig) {
      try {
        // Save current config for rollback
        previousConfig = proxyConfig.getAll();
        
        const env = proxyConfig.getProxyEnvironment();
        
        // Stop the proxy service if it's running
        await processManager.stopService('proxy');
        
        // Start it with new environment variables
        const startResult = await processManager.startService('proxy', { env });
        
        if (startResult.status !== 'running') {
          // Rollback to previous config
          proxyConfig.setAll(previousConfig);
          await processManager.startService('proxy', { env: proxyConfig.getProxyEnvironment() });
          
          return { 
            success: false, 
            error: 'Failed to start with new config, rolled back to previous settings' 
          };
        }
        
        previousConfig = null;
        return { success: true, message: 'Proxy server restarted with new settings' };
        
      } catch (error) {
        if (previousConfig) {
          // Rollback on error
          proxyConfig.setAll(previousConfig);
          try {
            await processManager.startService('proxy', { env: proxyConfig.getProxyEnvironment() });
          } catch (rollbackError) {
            console.error('Failed to rollback after error:', rollbackError);
          }
        }
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: 'Proxy config not initialized' };
  });
  
  // Configuration reload handler
  ipcMain.handle('proxy:reload-config', async () => {
    try {
      const config = proxyConfig.getAll();
      
      // Send SIGHUP to proxy process to reload config
      if (processManager.services.proxy?.process) {
        processManager.services.proxy.process.kill('SIGHUP');
        return { success: true };
      }
      
      return { success: false, error: 'Proxy process not running' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  // Process control handlers
  ipcMain.handle('process:start', async (event, serviceName) => {
    try {
      await processManager.startService(serviceName);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('process:stop', async (event, serviceName) => {
    try {
      await processManager.stopService(serviceName);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('process:restart', async (event, serviceName) => {
    try {
      await processManager.restartService(serviceName);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('process:startAll', async () => {
    try {
      const results = await processManager.startAllServices();
      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('process:stopAll', async () => {
    try {
      await processManager.stopAllServices();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('process:getStatus', () => {
    return processManager.getAllServiceStates();
  });
  
  ipcMain.handle('process:getLogs', (event, options = {}) => {
    const { service, limit = 100 } = options;
    if (service) {
      return logAggregator.getServiceLogs(service, limit);
    }
    return logAggregator.getAllLogs(limit);
  });
  
  ipcMain.handle('process:searchLogs', (event, query, options = {}) => {
    return logAggregator.searchLogs(query, options);
  });
  
  ipcMain.handle('process:getHealth', () => {
    return healthMonitor.getAllServiceHealth();
  });
}

// Setup process monitoring
function setupProcessMonitoring() {
  // Log process events
  processManager.on('status-change', ({ service, status }) => {
    console.log(`[ProcessManager] ${service}: ${status}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('process:status-change', { service, status });
    }
  });
  
  processManager.on('error', ({ service, error }) => {
    console.error(`[ProcessManager] ${service} error:`, error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('process:error', { service, error: error.message });
    }
  });
  
  processManager.on('exit', ({ service, code, signal }) => {
    console.log(`[ProcessManager] ${service} exited with code ${code}, signal ${signal}`);
  });
  
  processManager.on('restart-scheduled', ({ service, delay, restartCount }) => {
    console.log(`[ProcessManager] ${service} restart scheduled in ${delay}ms (attempt ${restartCount})`);
  });
  
  // Log aggregator events
  logAggregator.on('log', (log) => {
    console.log(`[${log.service}] ${log.message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('process:log', log);
    }
  });
  
  // Health monitor events
  healthMonitor.on('health-check', (result) => {
    if (result.status === 'unhealthy') {
      console.warn(`[HealthMonitor] ${result.service} is unhealthy (${result.consecutiveFailures} consecutive failures)`);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('process:health-check', result);
    }
  });
}

// Setup IPC handlers when app is ready
app.whenReady().then(async () => {
  console.log("🎮 Minecraft Bedrock Minimap Electron App starting...");
  
  setupIpcHandlers();
  setupProcessMonitoring();
  createWindow();
  
  // Handle macOS activate
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  
  // Start all services after window is created
  console.log('🚀 Starting all minimap services...');
  try {
     await processManager.startService('minimap')
    //const results = await processManager.startAllServices();
    // console.log('✅ Services started:', results);
  } catch (error) {
    console.error('❌ Failed to start services:', error);
  }
});

// Handle Windows shutdown events
if (process.platform === 'win32') {
  // Windows-specific shutdown handling
  app.on('before-quit', () => {
    console.log('⚠️ Windows shutdown detected');
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught exception:', error);
  performCleanup().then(() => {
    app.exit(1);
  });
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
});