# Block Colors

The block color system is central to the minimap's visual representation. This document explains how blocks are mapped to colors and rendered.

## Block Color Mapping

### Auto-Generated Mappings

The system uses an auto-generated mapping file containing 1,261 Minecraft Bedrock block types:

```typescript
// Example from block-colors.ts
export const BLOCK_COLORS: Record<string, string> = {
  "minecraft:stone": "#707070ff",
  "minecraft:grass_block": "#78A74Dff",
  "minecraft:dirt": "#593D29ff",
  "minecraft:cobblestone": "#7A7A7Aff",
  "minecraft:oak_planks": "#A88754ff",
  "minecraft:water": "#3F76E4ff",
  // ... 1,255 more entries
};
```

### Color Format

All colors use the `#RRGGBBAA` format:
- **RR**: Red component (00-FF)
- **GG**: Green component (00-FF)
- **BB**: Blue component (00-FF)
- **AA**: Alpha component (00-FF)

```typescript
interface ColorComponents {
  r: number;  // 0-255
  g: number;  // 0-255
  b: number;  // 0-255
  a: number;  // 0-255
}

function parseColor(hex: string): ColorComponents {
  const match = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) throw new Error(`Invalid color: ${hex}`);
  
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
    a: parseInt(match[4], 16)
  };
}
```

## Color Categories

### Terrain Blocks

Common terrain blocks with their characteristic colors:

| Block Type | Color | RGB | Visual |
|------------|-------|-----|--------|
| Stone | `#707070ff` | (112, 112, 112) | Gray |
| Grass | `#78A74Dff` | (120, 167, 77) | Green |
| Sand | `#DAD299ff` | (218, 210, 153) | Tan |
| Water | `#3F76E4ff` | (63, 118, 228) | Blue |
| Lava | `#D65800ff` | (214, 88, 0) | Orange |

### Vegetation

Plants and trees with varying shades of green:

```typescript
const VEGETATION_COLORS = {
  "minecraft:oak_leaves": "#3F5B16ff",      // Dark green
  "minecraft:birch_leaves": "#88A94Aff",    // Light green
  "minecraft:spruce_leaves": "#425922ff",   // Pine green
  "minecraft:jungle_leaves": "#3C5C14ff",   // Jungle green
  "minecraft:acacia_leaves": "#4C6519ff",   // Savanna green
  "minecraft:dark_oak_leaves": "#324317ff", // Forest green
};
```

### Special Blocks

Blocks with unique visual properties:

```typescript
const SPECIAL_BLOCKS = {
  // Transparent blocks
  "minecraft:air": "#00000000",           // Fully transparent
  "minecraft:glass": "#FFFFFF40",          // Semi-transparent
  "minecraft:ice": "#7DAEFB80",           // Translucent blue
  
  // Light-emitting blocks
  "minecraft:glowstone": "#FFF144ff",      // Bright yellow
  "minecraft:sea_lantern": "#ACCFCBff",    // Cyan white
  "minecraft:beacon": "#6EE4D2ff",         // Teal
  
  // Redstone components
  "minecraft:redstone_block": "#A70906ff", // Deep red
  "minecraft:redstone_lamp": "#5E3B1Fff",  // Brown (off)
};
```

## Ore Detection Colors

### Ore Highlighting System

When ore detection is enabled, ores are highlighted with specific colors:

![Ore Detection in Action](../images/minimap-diamond-and-iron-ores.png)
*Minimap showing diamond and iron ore detection with cyan highlights*

```typescript
export const ORE_COLORS: Record<OreType, OreColorConfig> = {
  coal: {
    color: "#4A4A4A",      // Dark gray
    priority: 1,
    glow: false
  },
  iron: {
    color: "#D4AF8C",      // Light brown
    priority: 2,
    glow: false
  },
  copper: {
    color: "#FF7F00",      // Orange
    priority: 3,
    glow: true
  },
  gold: {
    color: "#FFD700",      // Gold
    priority: 4,
    glow: true
  },
  redstone: {
    color: "#FF0000",      // Red
    priority: 5,
    glow: true
  },
  lapis: {
    color: "#0080FF",      // Blue
    priority: 6,
    glow: true
  },
  diamond: {
    color: "#00FFFF",      // Cyan
    priority: 7,
    glow: true
  },
  emerald: {
    color: "#00FF00",      // Green
    priority: 8,
    glow: true
  },
  ancient_debris: {
    color: "#8B4513",      // Brown
    priority: 9,
    glow: true
  }
};
```

### Ore Rendering Styles

The ore detection system provides comprehensive configuration options:

![Ore Type Selection](../images/minimap-settings.png)
*Ore type selection panel showing different ore types with Y-level ranges*

![Advanced Ore Settings](../images/minimap-settings-2.png)
*Advanced ore detection settings including highlight style, background dimming, and Y-level scan range*

```typescript
enum OreHighlightStyle {
  OVERLAY = 'overlay',     // Bright color overlay
  REPLACE = 'replace',     // Replace block color
  BORDER = 'border'        // Add colored border
}

function renderOreHighlight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  oreColor: string,
  style: OreHighlightStyle
): void {
  switch (style) {
    case 'overlay':
      // Semi-transparent overlay
      ctx.fillStyle = oreColor + '80';  // 50% opacity
      ctx.fillRect(x, y, size, size);
      break;
      
    case 'replace':
      // Full replacement
      ctx.fillStyle = oreColor;
      ctx.fillRect(x, y, size, size);
      break;
      
    case 'border':
      // Colored border
      ctx.strokeStyle = oreColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
      break;
  }
}
```

## Color Processing

### Height-Based Shading

Blocks are shaded based on their Y-level for depth perception:

```typescript
function applyHeightShading(
  baseColor: ColorComponents,
  height: number
): ColorComponents {
  // Normalize height (-64 to 320) to (0 to 1)
  const normalized = (height + 64) / 384;
  
  // Apply shading (darker = lower, brighter = higher)
  const shadeFactor = 0.7 + (normalized * 0.3);
  
  return {
    r: Math.floor(baseColor.r * shadeFactor),
    g: Math.floor(baseColor.g * shadeFactor),
    b: Math.floor(baseColor.b * shadeFactor),
    a: baseColor.a
  };
}
```

### Biome Tinting

Some blocks change color based on biome:

```typescript
interface BiomeTint {
  grassTint: string;
  foliageTint: string;
  waterTint: string;
}

const BIOME_TINTS: Record<string, BiomeTint> = {
  plains: {
    grassTint: "#79C05A",
    foliageTint: "#59AE30",
    waterTint: "#3F76E4"
  },
  desert: {
    grassTint: "#BFB755",
    foliageTint: "#AEA42A",
    waterTint: "#3F76E4"
  },
  swamp: {
    grassTint: "#6A7039",
    foliageTint: "#6A7039",
    waterTint: "#617B64"
  }
};

function applyBiomeTint(
  blockId: string,
  baseColor: string,
  biome: string
): string {
  const tints = BIOME_TINTS[biome];
  if (!tints) return baseColor;
  
  // Apply tint to grass blocks
  if (blockId.includes('grass')) {
    return blendColors(baseColor, tints.grassTint, 0.5);
  }
  
  // Apply tint to leaves
  if (blockId.includes('leaves')) {
    return blendColors(baseColor, tints.foliageTint, 0.5);
  }
  
  // Apply tint to water
  if (blockId === 'minecraft:water') {
    return tints.waterTint;
  }
  
  return baseColor;
}
```

## Rendering Optimizations

### Color Batching

Group blocks by color to minimize state changes:

```typescript
class ColorBatcher {
  private batches = new Map<string, Array<{x: number, y: number}>>();
  
  addBlock(x: number, y: number, color: string): void {
    if (!this.batches.has(color)) {
      this.batches.set(color, []);
    }
    this.batches.get(color)!.push({x, y});
  }
  
  render(ctx: CanvasRenderingContext2D, blockSize: number): void {
    // Render all blocks of the same color in one batch
    for (const [color, positions] of this.batches) {
      ctx.fillStyle = color;
      
      for (const {x, y} of positions) {
        ctx.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
      }
    }
    
    this.batches.clear();
  }
}
```

### Color Caching

Pre-compute and cache processed colors:

```typescript
class ColorCache {
  private cache = new Map<string, Uint8Array>();
  
  getProcessedColor(
    blockId: string,
    height: number,
    biome?: string
  ): Uint8Array {
    const key = `${blockId}:${height}:${biome || 'default'}`;
    
    if (!this.cache.has(key)) {
      const baseColor = BLOCK_COLORS[blockId] || "#FF00FFff";
      let processed = parseColor(baseColor);
      
      // Apply height shading
      processed = applyHeightShading(processed, height);
      
      // Apply biome tint if applicable
      if (biome) {
        const tinted = applyBiomeTint(blockId, colorToHex(processed), biome);
        processed = parseColor(tinted);
      }
      
      // Store as Uint8Array for efficiency
      this.cache.set(key, new Uint8Array([
        processed.r,
        processed.g,
        processed.b
      ]));
    }
    
    return this.cache.get(key)!;
  }
}
```

## Custom Color Mapping

### User-Defined Colors

Allow users to override default colors:

```typescript
class CustomColorManager {
  private customColors = new Map<string, string>();
  
  setCustomColor(blockId: string, color: string): void {
    // Validate color format
    if (!/^#[0-9a-f]{8}$/i.test(color)) {
      throw new Error(`Invalid color format: ${color}`);
    }
    
    this.customColors.set(blockId, color);
  }
  
  getBlockColor(blockId: string): string {
    // Check custom colors first
    if (this.customColors.has(blockId)) {
      return this.customColors.get(blockId)!;
    }
    
    // Fall back to default
    return BLOCK_COLORS[blockId] || "#FF00FFff";
  }
  
  exportCustomColors(): Record<string, string> {
    return Object.fromEntries(this.customColors);
  }
  
  importCustomColors(colors: Record<string, string>): void {
    for (const [blockId, color] of Object.entries(colors)) {
      this.setCustomColor(blockId, color);
    }
  }
}
```

## Color Accessibility

### Color Blind Modes

Support for different types of color blindness:

```typescript
enum ColorBlindMode {
  NONE = 'none',
  PROTANOPIA = 'protanopia',     // Red-blind
  DEUTERANOPIA = 'deuteranopia', // Green-blind
  TRITANOPIA = 'tritanopia'       // Blue-blind
}

function adjustForColorBlindness(
  color: ColorComponents,
  mode: ColorBlindMode
): ColorComponents {
  switch (mode) {
    case ColorBlindMode.PROTANOPIA:
      // Adjust reds to be more distinguishable
      return {
        r: color.r * 0.567 + color.g * 0.433,
        g: color.r * 0.558 + color.g * 0.442,
        b: color.b,
        a: color.a
      };
      
    case ColorBlindMode.DEUTERANOPIA:
      // Adjust greens
      return {
        r: color.r * 0.625 + color.g * 0.375,
        g: color.r * 0.7 + color.g * 0.3,
        b: color.b,
        a: color.a
      };
      
    case ColorBlindMode.TRITANOPIA:
      // Adjust blues
      return {
        r: color.r,
        g: color.g * 0.95 + color.b * 0.05,
        b: color.g * 0.433 + color.b * 0.567,
        a: color.a
      };
      
    default:
      return color;
  }
}
```

## Best Practices

### Do's
- ✅ Use the predefined color mappings
- ✅ Cache processed colors
- ✅ Batch blocks by color when rendering
- ✅ Support custom color overrides
- ✅ Consider accessibility needs

### Don'ts
- ❌ Parse colors repeatedly
- ❌ Use hard-coded colors
- ❌ Ignore alpha channel
- ❌ Forget biome variations
- ❌ Skip validation of custom colors

The block color system provides a flexible and efficient way to represent the Minecraft world visually while supporting customization and accessibility features.