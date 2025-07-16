# @minecraft-bedrock-minimap/minimap-server

Intelligent bridge server that manages chunk caching, batching, and state synchronization between the proxy server and web clients.

## Overview

This package serves as the central hub for:
- Chunk caching and processing with LRU eviction
- Intelligent batching that reduces network traffic by 80%
- Per-client state tracking
- Performance monitoring and optimization

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Start the minimap server
npm run dev

# Web clients can connect to http://localhost:3002
```

## Features

- **Smart Caching**: LRU cache with configurable size limits
- **Batch Processing**: Groups chunk updates for efficiency
- **Client Management**: Tracks state per connected client
- **Performance**: Network reduction and cache optimization
- **Monitoring**: Comprehensive metrics and statistics

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | 3002 | Server port |
| `PROXY_URL` | http://localhost:3001 | Proxy server URL |
| `CHUNK_CACHE_SIZE` | 100000 | Maximum cached chunks |
| `CHUNK_BATCH_SIZE` | 50 | Chunks per batch |

## Documentation

**📚 [Complete Documentation](../../docs/packages/minimap-server.md)**

### Quick Links

- [Architecture Overview](../../docs/architecture/overview.md)
- [Performance](../../docs/architecture/performance.md)
- [Socket.io Events](../../docs/api/socket-events.md)
- [Testing Guide](../../docs/guides/testing.md)

## Development

```bash
# Development mode
npm run dev

# Production build
npm run build
npm run start

# With performance monitoring
LOG_LEVEL=debug npm run dev
```

## Performance

The minimap server implements several optimizations:

- **80% Network Reduction**: Through intelligent batching
- **95%+ Cache Hit Rate**: With LRU eviction strategy
- **Per-Client Optimization**: Prevents redundant updates
- **Memory Management**: Configurable limits and cleanup

For performance details, see the [Performance Documentation](../../docs/architecture/performance.md).