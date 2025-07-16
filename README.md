# Minecraft Bedrock Minimap

**⚠️ PROTOTYPE PROJECT - EXPERIMENTAL ONLY**

This project was created as an experiment in AI-assisted development and context engineering using Claude Code. It serves as a proof-of-concept for building complex, multi-package applications through AI collaboration.

**This is a prototype and will not be maintained, updated, or officially supported.**

## Overview

A real-time minimap system for Minecraft Bedrock Edition featuring:
- Real-time chunk visualization
- Ore detection with configurable highlighting
- Desktop overlay mode via Electron
- Performance-optimized rendering pipeline
- Comprehensive Socket.io-based architecture

## Architecture

The system consists of 5 integrated packages:

- **bedrock-proxy-server**: Minecraft protocol proxy for data extraction
- **minimap-server**: Intelligent caching and state management
- **minimap-web-server**: High-performance web-based renderer
- **electron-app**: Desktop application with overlay capabilities
- **shared**: Common types and utilities

## Documentation

📚 **[Complete Documentation](./docs/index.md)**

Comprehensive documentation covering architecture, development, and deployment.

## Quick Start

```bash
# Install dependencies
npm install

# Start all services
npm run dev

# Build for production
npm run build
```

## BUILD app from windows 11

- npm i 
- npm run build
- npm run build:all
- edit packages\electron-app\services\web\index.html remove `/` src attribute,  // `<script type="module" crossorigin src="/assets/index-DpYk7OVs.js"></script>`
- npm run make:electron:win
- npm run package:electron
 
- zip output packages\electron-app\out\make\zip\win32\x64
- unpacked output packages\electron-app\out\Minecraft Bedrock Minimap-win32-x64
- copy profiles to resources\services\proxy-server\profiles to avoid 2fa

## Experimental Nature

This codebase demonstrates:
- AI-assisted software architecture
- Comprehensive documentation generation
- Real-time data processing patterns
- Performance optimization techniques
- TypeScript monorepo management

**Use at your own risk. No warranty or support provided.**

## License

This experimental project is provided as-is for educational and research purposes.