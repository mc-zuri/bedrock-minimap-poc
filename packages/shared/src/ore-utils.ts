/**
 * Ore Detection Utilities
 * Functions and constants for ore detection and highlighting
 */

import { OreType } from './types.js';

/**
 * Y-level ranges where each ore type can be found
 * Based on Minecraft Bedrock Edition ore distribution
 */
export const ORE_Y_RANGES: Record<OreType, { min: number; max: number; optimal?: number }> = {
  [OreType.COAL]: { min: 0, max: 320, optimal: 96 },
  [OreType.IRON]: { min: -64, max: 320, optimal: 16 },
  [OreType.COPPER]: { min: -16, max: 112, optimal: 48 },
  [OreType.GOLD]: { min: -64, max: 32, optimal: -16 },
  [OreType.REDSTONE]: { min: -64, max: 15, optimal: -59 },
  [OreType.LAPIS]: { min: -64, max: 64, optimal: 0 },
  [OreType.DIAMOND]: { min: -64, max: 16, optimal: -59 },
  [OreType.EMERALD]: { min: -16, max: 320, optimal: 236 }, // Only in mountains
  [OreType.QUARTZ]: { min: 10, max: 117, optimal: 64 }, // Nether only
  [OreType.NETHER_GOLD]: { min: 10, max: 117, optimal: 64 }, // Nether only
  [OreType.ANCIENT_DEBRIS]: { min: 8, max: 119, optimal: 15 } // Nether only
};

/**
 * Ore highlight colors for ore detection mode
 * Each ore type gets a distinct, easily recognizable color
 */
export const ORE_HIGHLIGHT_COLORS: Record<OreType, string> = {
  [OreType.COAL]: '#4A4A4A',      // Dark gray
  [OreType.IRON]: '#D4AF8C',      // Light brown/tan
  [OreType.COPPER]: '#FF7F00',    // Orange
  [OreType.GOLD]: '#FFD700',      // Gold
  [OreType.REDSTONE]: '#FF0000',  // Red
  [OreType.LAPIS]: '#0080FF',     // Blue
  [OreType.DIAMOND]: '#00FFFF',   // Cyan
  [OreType.EMERALD]: '#00FF00',   // Green
  [OreType.QUARTZ]: '#FFFFFF',    // White
  [OreType.NETHER_GOLD]: '#FFAA00', // Dark gold
  [OreType.ANCIENT_DEBRIS]: '#8B4513' // Brown
};

/**
 * Set of all ore block names for efficient lookup
 */
export const ORE_BLOCKS = new Set([
  // Regular ores
  'coal_ore',
  'iron_ore', 
  'copper_ore',
  'gold_ore',
  'redstone_ore',
  'lapis_ore',
  'diamond_ore',
  'emerald_ore',
  
  // Deepslate variants (below Y=0)
  'deepslate_coal_ore',
  'deepslate_iron_ore',
  'deepslate_copper_ore', 
  'deepslate_gold_ore',
  'deepslate_redstone_ore',
  'deepslate_lapis_ore',
  'deepslate_diamond_ore',
  'deepslate_emerald_ore',
  
  // Nether ores
  'nether_gold_ore',
  'quartz_ore',
  'ancient_debris'
]);

/**
 * Mapping from block names to ore types
 */
export const BLOCK_TO_ORE_MAP = new Map<string, OreType>([
  // Regular ores
  ['coal_ore', OreType.COAL],
  ['iron_ore', OreType.IRON],
  ['copper_ore', OreType.COPPER],
  ['gold_ore', OreType.GOLD],
  ['redstone_ore', OreType.REDSTONE],
  ['lapis_ore', OreType.LAPIS],
  ['diamond_ore', OreType.DIAMOND],
  ['emerald_ore', OreType.EMERALD],
  
  // Deepslate variants
  ['deepslate_coal_ore', OreType.COAL],
  ['deepslate_iron_ore', OreType.IRON],
  ['deepslate_copper_ore', OreType.COPPER],
  ['deepslate_gold_ore', OreType.GOLD],
  ['deepslate_redstone_ore', OreType.REDSTONE],
  ['deepslate_lapis_ore', OreType.LAPIS],
  ['deepslate_diamond_ore', OreType.DIAMOND],
  ['deepslate_emerald_ore', OreType.EMERALD],
  
  // Nether ores
  ['nether_gold_ore', OreType.NETHER_GOLD],
  ['quartz_ore', OreType.QUARTZ],
  ['ancient_debris', OreType.ANCIENT_DEBRIS]
]);

/**
 * Get the highlight color for a specific ore type
 */
export function getOreHighlightColor(oreType: OreType): string {
  return ORE_HIGHLIGHT_COLORS[oreType] || '#FFFFFF';
}

/**
 * Check if a block name represents an ore block
 */
export function isOreBlock(blockName: string): boolean {
  // Remove minecraft: namespace if present
  const cleanName = blockName.replace('minecraft:', '');
  return ORE_BLOCKS.has(cleanName);
}

/**
 * Get the ore type for a given block name
 */
export function getOreType(blockName: string): OreType | null {
  // Remove minecraft: namespace if present
  const cleanName = blockName.replace('minecraft:', '');
  return BLOCK_TO_ORE_MAP.get(cleanName) || null;
}

/**
 * Check if an ore type can spawn at a given Y-level
 */
export function canOreSpawnAtY(oreType: OreType, y: number): boolean {
  const range = ORE_Y_RANGES[oreType];
  return y >= range.min && y <= range.max;
}

/**
 * Get ore types that can spawn at a given Y-level
 */
export function getOresAtY(y: number): OreType[] {
  return Object.values(OreType).filter(oreType => canOreSpawnAtY(oreType, y));
}

/**
 * Format Y-range for display
 */
export function formatYRange(oreType: OreType): string {
  const range = ORE_Y_RANGES[oreType];
  return `Y${range.min} to Y${range.max}`;
}