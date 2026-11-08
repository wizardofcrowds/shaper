import type { CSSProperties } from 'react';
import { NODE_COLORS } from '../colors.ts';

/** Uncolored nodes retain the original appearance without adding data defaults. */
export function nodeColorStyle(color?: string): CSSProperties {
  const tone = NODE_COLORS.find(entry => entry.id === color);
  return tone ? { '--node-accent': tone.accent, '--node-tint': tone.tint } as CSSProperties : {};
}
