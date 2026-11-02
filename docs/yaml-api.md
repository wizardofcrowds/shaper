# YAML read/write API

The first implementation is a TypeScript module with no filesystem, camera, UI,
or model-provider dependency. It runs in Node and can be bundled for a browser.
The checked-in JSON Schema defines the experimental breadboard format.

```ts
import { parseBreadboard, writeBreadboard, validateBreadboard } from './src/index.ts';

const model = parseBreadboard(yamlText);
model.nodes.home.label = 'Welcome';
const updatedYaml = writeBreadboard(model);

// Also accepts unknown data, e.g. a draft produced by image extraction.
validateBreadboard(candidate); // throws BreadboardError if invalid
```

- `parseBreadboard(text): Breadboard` parses one YAML 1.2 document and validates it.
- `writeBreadboard(value: unknown): string` validates before producing YAML.
- `validateBreadboard(value: unknown): asserts value is Breadboard` validates data
  without mutating it, adding defaults, or converting field types.
- `BreadboardError.issues` provides an error code, JSON Pointer, message, and, for
  parser diagnostics, a one-based source line and column.

Save is an application concern: these functions accept and return strings. A CLI
can read/write files, and the future browser editor can open/download them.

## Contract

Parsing and writing preserve the meaning of metadata, scenarios, and layout.
Comments, whitespace, and quoting style are not preserved. Shared object values
are written explicitly, not as aliases. Neither function mutates the model.

Files must be at most 1 MiB of UTF-8 and data may be nested at most 64 levels.
Duplicate keys, multiple documents, YAML 1.1 directives, aliases, and unresolved
tags are errors. Values must be JSON-compatible: no non-finite numbers, negative
zero, class instances, functions, undefined, cycles, accessors, sparse arrays,
non-enumerable fields, or symbol keys. Use ordinary `0` for negative zero.

Schema validation is separate from graph and use-case checks. A missing destination
can be saved while a diagram is being shaped, as long as the reference has valid
syntax. The editor's separate `src/editor/model.ts` module checks references and
navigation scenarios. Reachability and fit assessment remain future work;
successful parsing does not mean graph or use-case checks have passed.

Keep the TypeScript model declarations aligned with the runtime schema when
changing this experimental format. The JSON Schema is authoritative at runtime.

## Development

Use Node 22.18+ (Node 24 recommended) and pnpm. No build step is needed to run
TypeScript tests because supported Node versions strip erasable type syntax.

```sh
pnpm install
pnpm typecheck
pnpm test
```

The tests include both checked-in examples, semantic and stable serialization
round trips, schema failures, YAML errors, metadata preservation, and input limits.
