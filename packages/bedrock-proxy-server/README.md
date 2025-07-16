# @minecraft-bedrock-minimap/bedrock-proxy-server

Minecraft Bedrock Edition proxy server that extracts world data and player information for the minimap system.

## Overview

This package creates a transparent proxy between Minecraft clients and servers, intercepting packets to extract:
- Player position and movement
- Chunk data and block information
- World changes and updates

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Minecraft server details

# Start the proxy server
npm run dev

# Connect Minecraft client to localhost:19134
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MC_SERVER_HOST` | - | Target Minecraft server |
| `MC_SERVER_PORT` | 19132 | Minecraft server port |
| `PORT` | 3001 | Socket.io server port |
| `RELAY_PORT` | 19134 | Minecraft proxy port |

## Documentation

**📚 [Complete Documentation](../../docs/packages/bedrock-proxy-server.md)**

### Quick Links

- [Architecture Overview](../../docs/architecture/overview.md)
- [Socket.io Events](../../docs/api/socket-events.md)
- [Debugging Guide](../../docs/guides/debugging.md)
- [Deployment Guide](../../docs/guides/deployment.md)

## Development

```bash
# Development mode
npm run dev

# Production build
npm run build
npm run start

# Debug mode
ENABLE_DEBUG_LOGGING=true npm run dev
```

## Troubleshooting

- **Connection Issues**: Check firewall settings for ports 3001 and 19134
- **No Chunks**: Verify Minecraft server allows LAN connections
- **Performance**: Monitor memory usage and enable chunk caching

For detailed troubleshooting, see the [Debugging Guide](../../docs/guides/debugging.md).