/** JSON-compatible extension data; JavaScript-only values are not serializable. */
export type JsonValue = null | boolean | number | string | JsonValue[] | {
  [key: string]: JsonValue;
};

export type Metadata = Record<string, JsonValue>;

export interface Affordance {
  kind: 'action' | 'input' | 'copy' | 'capability' | 'event';
  label: string;
  connections?: Record<string, Connection>;
  metadata?: Metadata;
}

export interface BreadboardNode {
  kind: 'place' | 'component';
  label: string;
  affordances: Record<string, Affordance>;
  affordance_order?: string[];
  metadata?: Metadata;
}

export interface Connection {
  to: string;
  kind: 'navigate' | 'invoke' | 'emit' | 'read' | 'write';
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
  scenarios?: Scenario[];
  layout?: { nodes?: Record<string, { x: number; y: number }> };
  metadata?: Metadata;
}
