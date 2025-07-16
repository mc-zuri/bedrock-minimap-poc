# Development Setup

This guide walks through setting up a development environment for the Minecraft Bedrock Minimap project.

## Prerequisites

### System Requirements

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Git**: For version control
- **Minecraft Bedrock Edition**: For testing

### Recommended Tools

- **Visual Studio Code**: With TypeScript and ESLint extensions
- **Windows Terminal** or **iTerm2**: For better terminal experience
- **Postman** or **Insomnia**: For API testing

## Initial Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd minecraft-bedrock-minimap
```

### 2. Install Dependencies

```bash
# Install all dependencies for the monorepo
npm install

# Verify installation
npm run typecheck
```

### 3. Environment Configuration

Create environment files:

```bash
# Copy example files
cp .env.example .env
cp packages/bedrock-proxy-server/.env.example packages/bedrock-proxy-server/.env
cp packages/minimap-server/.env.example packages/minimap-server/.env
```

### 4. Configure Minecraft Connection

Edit `.env` or package-specific environment files:

```bash
# Minecraft server connection
MC_SERVER_HOST=your.minecraft.server.com
MC_SERVER_PORT=19132

# For local testing
MC_SERVER_HOST=localhost
MC_SERVER_PORT=19132
```

## Development Workflow

### Quick Start

```bash
# Start all services for development
npm run dev

# Or start specific services
npm run dev:proxy      # Proxy server only
npm run dev:minimap    # Minimap server only
npm run dev:web        # Web client only
npm run dev:electron   # Electron app only

# Start all including Electron
npm run dev:all
```

### Package Scripts Overview

```bash
# Core development
npm run dev             # All services except Electron
npm run dev:all         # All services including Electron
npm run build           # Build all packages
npm run clean           # Clean build artifacts

# Type checking
npm run typecheck       # Check all packages
npm run typecheck:watch # Watch mode

# Testing
npm run test            # Run all tests
npm run test:watch      # Watch mode

# Utilities
npm run lint            # ESLint
npm run format          # Prettier
```

## IDE Configuration

### Visual Studio Code

#### Recommended Extensions

```json
// .vscode/extensions.json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-json"
  ]
}
```

#### Settings

```json
// .vscode/settings.json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true
}
```

#### Launch Configuration

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Proxy Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/packages/bedrock-proxy-server/src/index.ts",
      "outFiles": ["${workspaceFolder}/packages/bedrock-proxy-server/dist/**/*.js"],
      "runtimeArgs": ["--loader", "tsx/esm"],
      "env": {
        "NODE_ENV": "development"
      }
    },
    {
      "name": "Debug Minimap Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/packages/minimap-server/src/index.ts",
      "runtimeArgs": ["--loader", "tsx/esm"]
    }
  ]
}
```

## Package Development

### Working with the Shared Package

When modifying shared types:

```bash
# Build shared package first
npm run build -w packages/shared

# Then build dependent packages
npm run build -w packages/minimap-server
npm run build -w packages/bedrock-proxy-server
```

### Adding New Dependencies

```bash
# Add to specific package
npm install --workspace packages/shared socket.io-client

# Add to root (affects all packages)
npm install --save-dev typescript

# Add devDependency to specific package
npm install --workspace packages/minimap-web-server --save-dev vite
```

### Testing Changes

```bash
# Test specific package
npm test --workspace packages/shared

# Test with watch mode
npm run test:watch --workspace packages/minimap-server

# Run integration tests
npm run test:integration
```

## Common Development Tasks

### Adding a New Feature

1. **Plan the Change**:
   - Update types in `packages/shared/src/types.ts`
   - Consider Socket.io events in `socket-events.ts`

2. **Implement**:
   - Start with shared types and utilities
   - Add server-side logic
   - Implement client-side features

3. **Test**:
   - Unit tests for new functions
   - Integration tests for components
   - Manual testing with real Minecraft

### Debugging Connection Issues

```bash
# Check service status
npm run dev

# Verify ports are open
netstat -an | grep 3001  # Proxy server
netstat -an | grep 3002  # Minimap server
netstat -an | grep 5173  # Web client

# Test Socket.io connections
curl http://localhost:3001/socket.io/
curl http://localhost:3002/socket.io/
```

### Performance Profiling

```bash
# Enable performance monitoring
NODE_ENV=development npm run dev:minimap

# Use Chrome DevTools for web client
# Open http://localhost:5173
# Press F12 → Performance tab
```

## Docker Development (Optional)

### Dockerfile for Development

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3001 3002 5173 19134

CMD ["npm", "run", "dev"]
```

### Docker Compose

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  minimap:
    build: .
    ports:
      - "3001:3001"
      - "3002:3002"
      - "5173:5173"
      - "19134:19134"
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - MC_SERVER_HOST=host.docker.internal
```

## Troubleshooting

### Common Issues

#### "Module not found" errors
```bash
# Clean and reinstall
npm run clean
rm -rf node_modules package-lock.json
npm install
```

#### TypeScript compilation errors
```bash
# Check TypeScript configuration
npm run typecheck

# Rebuild shared package
npm run build -w packages/shared
```

#### Port conflicts
```bash
# Kill processes using ports
lsof -ti:3001 | xargs kill -9
lsof -ti:3002 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

#### Socket.io connection failures
```bash
# Enable debug logging
DEBUG=socket.io* npm run dev:minimap

# Check CORS settings
# Update CORS_ORIGINS in environment
```

### Environment Debugging

```bash
# Check Node.js version
node --version  # Should be 18.0.0+

# Verify npm workspaces
npm ls --workspaces

# Check environment variables
printenv | grep MC_
```

## Best Practices

### Code Organization

- **Types First**: Define types in shared package before implementation
- **Single Responsibility**: Each package has a clear purpose
- **Consistent Naming**: Use kebab-case for files, camelCase for variables
- **Import Order**: External dependencies, then internal imports

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/new-ore-detection

# Make commits with clear messages
git commit -m "feat: add ancient debris detection"

# Keep commits focused and atomic
# Use conventional commit format
```

### Performance Considerations

- **Hot Module Replacement**: Vite provides instant updates for web client
- **TypeScript Project References**: Enables incremental compilation
- **npm Workspaces**: Efficient dependency management

### Testing Strategy

- **Unit Tests**: For utility functions and pure logic
- **Integration Tests**: For component interactions
- **E2E Tests**: For complete user workflows
- **Manual Testing**: With real Minecraft servers

This development setup provides a robust foundation for contributing to the Minecraft Bedrock Minimap project while maintaining code quality and developer productivity.