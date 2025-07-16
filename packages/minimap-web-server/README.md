# @minecraft-bedrock-minimap/minimap-web-server

Web-based minimap visualization client with advanced rendering capabilities, ore detection, and real-time updates.

## Overview

This package provides:
- High-performance canvas-based minimap rendering
- Advanced features like ore detection and MegaTile optimization
- Real-time chunk updates via Socket.io
- Configurable UI with proxy settings
- Support for both web and Electron environments

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173
```

## Features

### Rendering Engine
- **Multi-Resolution Caching**: Optimized for different zoom levels
- **MegaTile Rendering**: Groups chunks for 89-96% fewer draw calls
- **Viewport Culling**: Only renders visible chunks
- **GPU Acceleration**: ImageBitmap support for hardware acceleration

### Advanced Features
- **Ore Detection**: Highlights valuable ores with configurable styles
- **Real-time Updates**: Smooth chunk and player position updates
- **Performance Monitoring**: Built-in FPS and memory tracking
- **Overlay Mode**: Transparent minimap for Electron

### User Interface
- **Proxy Settings**: Dynamic configuration panel
- **Ore Configuration**: Comprehensive ore detection settings
- **Debug Overlay**: Performance metrics and statistics

## Configuration

The web client auto-detects its environment and adjusts features accordingly:

```typescript
// Automatic environment detection
const isElectron = !!window.electronAPI;
const isOverlayMode = window.electronAPI?.isOverlay?.();
```

## Documentation

**📚 [Complete Documentation](../../docs/packages/minimap-web-server.md)**

### Quick Links

- [Rendering Pipeline](../../docs/concepts/rendering-pipeline.md)
- [Ore Detection](../../docs/concepts/block-colors.md#ore-detection-system)
- [Performance](../../docs/architecture/performance.md)
- [Socket.io Events](../../docs/api/socket-events.md)

## Development

```bash
# Development server (Vite)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run typecheck
```

### Debug Features

Press `F3` to toggle debug overlay showing:
- FPS and frame timing
- Cache hit rates
- Visible/loaded chunks
- Memory usage
- Network latency

## Performance Optimizations

The web client implements multiple optimization strategies:

- **Viewport Management**: Only processes visible chunks
- **Multi-Tier Caching**: 64px, 128px, 256px resolution tiers
- **Batch Processing**: Handles multiple chunk updates efficiently
- **Adaptive Quality**: Automatically adjusts based on performance
- **Memory Management**: Automatic cache eviction under pressure

For detailed performance information, see the [Performance Guide](../../docs/architecture/performance.md).

## Troubleshooting

Common issues and solutions:

- **Black Minimap**: Check Socket.io connection and chunk data
- **Poor Performance**: Reduce render distance or block size
- **Connection Issues**: Verify minimap server is running on port 3002

For comprehensive troubleshooting, see the [Debugging Guide](../../docs/guides/debugging.md).