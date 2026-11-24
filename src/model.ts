import type { NodeColor } from './colors.ts';
export type { NodeColor } from './colors.ts';

/** JSON-compatible extension data; JavaScript-only values are not serializable. */
export type JsonValue = null | boolean | number | string | JsonValue[] | {
  [key: string]: JsonValue;
};

export type Metadata = Record<string, JsonValue>;

export interface Annotations { tags?: string[]; notes?: string }

export interface Affordance extends Annotations {
  kind: 'action' | 'input' | 'copy' | 'capability' | 'event';
  label: string;
  connections?: Record<string, Connection>;
  metadata?: Metadata;
}

export interface DataElement { label: string; attributes?: string[]; metadata?: Metadata }
export type Cardinality = '1' | '0..1' | '0..*' | '1..*';
export interface Association {
  from: string;
  to: string;
  label?: string;
  from_cardinality?: Cardinality;
  to_cardinality?: Cardinality;
  metadata?: Metadata;
}

export interface BreadboardNode extends Annotations {
  kind: 'place' | 'component';
  label: string;
  color?: NodeColor;
  area?: string;
  affordances: Record<string, Affordance>;
  affordance_order?: string[];
  data?: Record<string, DataElement>;
  metadata?: Metadata;
}

export interface BreadboardArea { label: string; metadata?: Metadata }

export interface Connection {
  to: string;
  kind: 'navigate' | 'detour' | 'invoke' | 'emit' | 'read' | 'write';
  /** Presence means navigation requires login; via may be left undecided while shaping. */
  login?: { via?: string };
  notes?: string;
  label?: string;
  metadata?: Metadata;
}

export interface Scenario {
  id: string;
  goal: string;
  start: string;
  steps: string[];
  end: string;
  metadata?: Metadata;
}

/** Runtime validation is defined by schema/breadboard.schema.json. */
export interface Breadboard {
  version: '0.1';
  title: string;
  nodes: Record<string, BreadboardNode>;
  areas?: Record<string, BreadboardArea>;
  associations?: Record<string, Association>;
  scenarios?: Scenario[];
  layout?: { associations?: Record<string, { x: number }>; connections?: Record<string, { x: number }>; nodes?: Record<string, { x: number; y: number }> };
  metadata?: Metadata;
}
