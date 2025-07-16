# @minecraft-bedrock-minimap/electron-app

Desktop application that provides a comprehensive minimap experience with overlay capabilities, process management, and native integrations.

## Overview

This package delivers:
- Desktop application with overlay mode for gaming
- Automatic process management for all services
- Native window controls and context menus
- Log aggregation and health monitoring
- Persistent settings and configuration

## Quick Start

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Build for production
npm run build

# Package for distribution
npm run dist
```

## Features

### Overlay Mode
- **Transparent Window**: Configurable opacity (30-100%)
- **Always on Top**: Perfect for gaming overlay
- **Click-through Support**: When needed
- **Custom Controls**: Native window management

### Process Management
- **Auto-start Services**: Proxy and minimap servers
- **Health Monitoring**: HTTP-based health checks
- **Auto-restart**: Configurable restart strategies
- **Graceful Shutdown**: Proper cleanup on exit

### Native Integration
- **Context Menu**: Right-click for quick settings
- **System Tray**: Minimize to tray (planned)
- **Global Hotkeys**: Show/hide shortcuts (planned)
- **Native Notifications**: Status updates

### Developer Features
- **Log Aggregation**: Centralized logging from all services
- **Performance Monitoring**: Real-time metrics
- **Debug Mode**: Comprehensive debugging tools
- **Settings Management**: Persistent configuration

## Configuration

### Window Settings
```javascript
// Configurable via UI or settings
{
  overlayMode: false,
  opacity: 0.7,
  alwaysOnTop: false,
  frameMode: 'native', // or 'custom'
  windowBounds: { width: 512, height: 512 }
}
```

### Process Configuration
```javascript
// Automatic service management
{
  services: ['proxy', 'minimap'],
  autoRestart: true,
  healthCheckInterval: 30000,
  restartStrategy: 'exponential-backoff'
}
```

## Documentation

**📚 [Complete Documentation](../../docs/packages/electron-app.md)**

### Quick Links

- [Architecture Overview](../../docs/architecture/overview.md)
- [Development Setup](../../docs/guides/development-setup.md)
- [Deployment](../../docs/guides/deployment.md)
- [Testing](../../docs/guides/testing.md)

## Development

```bash
# Development mode with DevTools
npm run dev

# Build main and renderer processes
npm run build

# Run tests
npm test

# Debug main process
npm run debug:main
```

### Development Features

- **Hot Reload**: Automatic reload on changes
- **DevTools**: Chromium developer tools
- **Source Maps**: Full debugging support
- **Process Isolation**: Secure main/renderer separation

## Building and Distribution

### Cross-Platform Builds

```bash
# Build for current platform
npm run dist

# Build for specific platforms
npm run dist:win
npm run dist:mac
npm run dist:linux

# Build for all platforms
npm run dist:all
```

### Auto-Updates

The app includes auto-update functionality:

```javascript
// Checks for updates on startup
autoUpdater.checkForUpdatesAndNotify();

// Downloads and installs updates
autoUpdater.quitAndInstall();
```

## Process Management

The Electron app automatically manages child processes:

- **Proxy Server**: Bedrock protocol proxy
- **Minimap Server**: Chunk processing and caching
- **Health Monitoring**: Periodic health checks
- **Auto-restart**: On service failures
- **Log Collection**: Centralized logging

## IPC Communication

Secure communication between main and renderer processes:

```typescript
// Renderer process
const opacity = await window.electronAPI.overlay.getOpacity();
await window.electronAPI.overlay.setOpacity(0.5);

// Main process handles IPC securely
ipcMain.handle('overlay:set-opacity', (event, value) => {
  mainWindow.setOpacity(value);
});
```

## Troubleshooting

Common issues:

- **Services Not Starting**: Check port conflicts (3001, 3002)
- **Overlay Not Working**: Verify compositor support (Linux)
- **Performance Issues**: Monitor child process memory usage

For detailed troubleshooting, see the [Debugging Guide](../../docs/guides/debugging.md).

## Security

The app implements security best practices:

- **Context Isolation**: Renderer process security
- **No Node Integration**: Secure by default
- **IPC Validation**: All communications validated
- **Content Security Policy**: XSS protection

For security details, see the [Security Documentation](../../docs/packages/electron-app.md#security).