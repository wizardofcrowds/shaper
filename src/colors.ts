/** Stable palette IDs stored in YAML; tones are presentation-only. */
export const NODE_COLORS = [
  { id: 'slate', label: 'Slate', accent: '#475569', tint: '#eef1f5' },
  { id: 'gray', label: 'Gray', accent: '#626262', tint: '#f1f1ef' },
  { id: 'brown', label: 'Brown', accent: '#805b3f', tint: '#f5eee7' },
  { id: 'red', label: 'Red', accent: '#b83d3d', tint: '#fceeed' },
  { id: 'orange', label: 'Orange', accent: '#b05b18', tint: '#fff1e5' },
  { id: 'amber', label: 'Amber', accent: '#996715', tint: '#fff5df' },
  { id: 'yellow', label: 'Yellow', accent: '#81701a', tint: '#fbf8db' },
  { id: 'lime', label: 'Lime', accent: '#637b25', tint: '#f2f7df' },
  { id: 'green', label: 'Green', accent: '#3f713f', tint: '#edf5e9' },
  { id: 'emerald', label: 'Emerald', accent: '#277555', tint: '#e7f5ec' },
  { id: 'teal', label: 'Teal', accent: '#26766d', tint: '#e7f5f2' },
  { id: 'cyan', label: 'Cyan', accent: '#26738b', tint: '#e8f5fa' },
  { id: 'blue', label: 'Blue', accent: '#365fb0', tint: '#eaf0fc' },
  { id: 'indigo', label: 'Indigo', accent: '#5553a7', tint: '#efedfc' },
  { id: 'violet', label: 'Violet', accent: '#8651a6', tint: '#f6edfb' },
  { id: 'pink', label: 'Pink', accent: '#a94676', tint: '#fcecf4' },
] as const;

export type NodeColor = typeof NODE_COLORS[number]['id'];
