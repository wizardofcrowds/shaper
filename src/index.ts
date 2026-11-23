import { Ajv2020 } from 'ajv/dist/2020.js';
import { isAlias, LineCounter, parseDocument, stringify, visit } from 'yaml';
import schema from '../schema/breadboard.schema.json' with { type: 'json' };
import type { Breadboard } from './model.ts';
import { hasLegacyGroups, importLegacyGroups, legacyGroupDefinition, legacyGroupLayout } from './legacy.ts';

export type * from './model.ts';
export { NODE_COLORS } from './colors.ts';

export const MAX_YAML_BYTES = 1_048_576;
export const MAX_VALUE_DEPTH = 64;

export interface BreadboardIssue {
  code: 'yaml' | 'schema' | 'value' | 'limit';
  /** JSON Pointer, or an empty string for the document root. */
  path: string;
  message: string;
  line?: number;
  column?: number;
}

export class BreadboardError extends Error {
  readonly issues: readonly BreadboardIssue[];

  constructor(issues: BreadboardIssue[]) {
    super(issues.map(issue => `${issue.path || '/'}: ${issue.message}`).join('\n'));
    this.name = 'BreadboardError';
    this.issues = issues;
  }
}

const validator = new Ajv2020({
  allErrors: true,
  strict: true,
  ownProperties: true,
}).compile<Breadboard>(schema);

const legacyValidator = new Ajv2020({ allErrors: true, strict: true, ownProperties: true }).compile({
  ...schema,
  properties: { ...schema.properties, slices: legacyGroupDefinition,
    layout: { ...schema.properties.layout, properties: { ...schema.properties.layout.properties, slices: legacyGroupLayout } },
  },
  $defs: { ...schema.$defs, node: { ...schema.$defs.node, properties: { ...schema.$defs.node.properties, slice: { $ref: '#/$defs/id' } } } },
});

const escapePointer = (key: string): string => key.replace(/~/g, '~0').replace(/\//g, '~1');

function fail(code: BreadboardIssue['code'], path: string, message: string): never {
  throw new BreadboardError([{ code, path, message }]);
}

/** Reject values that YAML/JSON would otherwise coerce, drop, or reinterpret. */
function assertJsonValue(value: unknown, path = '', depth = 0, ancestors = new Set<object>()): void {
  if (depth > MAX_VALUE_DEPTH) fail('limit', path, `Maximum nesting depth is ${MAX_VALUE_DEPTH}.`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('value', path, 'Numbers must be finite.');
    if (Object.is(value, -0)) fail('value', path, 'Use 0 instead of negative zero for a lossless round trip.');
    return;
  }
  if (typeof value !== 'object') fail('value', path, 'Expected a JSON-compatible value.');
  if (ancestors.has(value)) fail('value', path, 'Circular references are not supported.');
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    fail('value', path, 'Expected a plain object, not a class instance.');
  }
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  if (array && keys.length !== value.length + 1) {
    fail('value', path, 'Arrays must be dense and contain no extra properties.');
  }
  for (const key of keys) {
    if (array && key === 'length') continue;
    if (typeof key !== 'string') fail('value', path, 'Symbol keys are not supported.');
    const childPath = `${path}/${escapePointer(key)}`;
    if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) {
      fail('value', childPath, 'Arrays must contain only indexed elements.');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) {
      fail('value', childPath, 'Only enumerable data properties are supported.');
    }
    assertJsonValue(descriptor.value, childPath, depth + 1, ancestors);
  }
  ancestors.delete(value);
}

/** Validate shape without mutating, filling defaults, or checking graph behavior. */
function validateWith(value: unknown, validate: typeof validator | typeof legacyValidator): void {
  assertJsonValue(value);
  if (validate(value)) return;
  throw new BreadboardError((validate.errors ?? []).map(error => {
    let path = error.instancePath;
    if (error.keyword === 'required') path += `/${escapePointer(String(error.params.missingProperty))}`;
    if (error.keyword === 'additionalProperties') path += `/${escapePointer(String(error.params.additionalProperty))}`;
    return { code: 'schema', path, message: error.message ?? 'Schema validation failed.' };
  }));
}

export function validateBreadboard(value: unknown): asserts value is Breadboard {
  validateWith(value, validator);
}

function checkByteLimit(text: string): void {
  // The cheap length check avoids allocating a second large copy of oversized input.
  if (text.length > MAX_YAML_BYTES || new TextEncoder().encode(text).length > MAX_YAML_BYTES) {
    fail('limit', '', `YAML must not exceed ${MAX_YAML_BYTES} UTF-8 bytes.`);
  }
}

/** Read exactly one YAML 1.2 breadboard document and validate its data shape. */
export function parseBreadboard(text: string): Breadboard {
  if (typeof text !== 'string') fail('yaml', '', 'Expected YAML text.');
  checkByteLimit(text);
  const lineCounter = new LineCounter();
  const document = parseDocument(text, {
    version: '1.2', schema: 'core', strict: true, uniqueKeys: true,
    stringKeys: true, lineCounter, prettyErrors: false,
  });
  const diagnostics = [...document.errors, ...document.warnings];
  if (diagnostics.length) {
    throw new BreadboardError(diagnostics.map(error => {
      const pos = lineCounter.linePos(error.pos[0]);
      return { code: 'yaml', path: '', message: error.message, line: pos.line, column: pos.col };
    }));
  }
  if (document.directives?.yaml.version !== '1.2') {
    fail('yaml', '', 'Only YAML 1.2 is supported.');
  }
  visit(document, (_key, node, path) => {
    if (path.length > MAX_VALUE_DEPTH * 2) fail('limit', '', `Maximum nesting depth is ${MAX_VALUE_DEPTH}.`);
    if (isAlias(node)) fail('yaml', '', 'YAML aliases are not supported; write values explicitly.');
  });
  let value: unknown = document.toJS({ maxAliasCount: 0 });
  if (hasLegacyGroups(value)) { validateWith(value, legacyValidator); value = importLegacyGroups(value); }
  validateBreadboard(value);
  return value;
}

/** Validate and write data without losing metadata, scenarios, or layout. */
export function writeBreadboard(value: unknown): string {
  validateBreadboard(value);
  const text = stringify(value, {
    version: '1.2', schema: 'core', indent: 2, lineWidth: 0,
    aliasDuplicateObjects: false,
  });
  checkByteLimit(text);
  return text;
}
