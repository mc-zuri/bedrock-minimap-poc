# @minecraft-bedrock-minimap/shared

Shared TypeScript types, utilities, and constants for the Minecraft Bedrock Minimap system.

## Overview

This package provides:
- Core TypeScript interfaces and types
- Socket.io event definitions
- Block color mappings
- Ore detection utilities
- Coordinate conversion functions
- Validation schemas

## Installation

```bash
npm install @minecraft-bedrock-minimap/shared
```

## Usage

```typescript
import type { ChunkData, PlayerPosition } from '@minecraft-bedrock-minimap/shared';
import { getBlockColor, isOreBlock } from '@minecraft-bedrock-minimap/shared';
```

## Documentation

**📚 [Complete Documentation](../../docs/packages/shared.md)**

### Quick Links

- [Architecture Overview](../../docs/architecture/overview.md)
- [Data Models](../../docs/architecture/data-models.md)
- [Block Colors](../../docs/concepts/block-colors.md)
- [Socket.io Events](../../docs/api/socket-events.md)

## Development

```bash
# Build package
npm run build

# Type checking
npm run typecheck

# Run tests
npm test
```

For detailed development setup, see the [Development Setup Guide](../../docs/guides/development-setup.md).