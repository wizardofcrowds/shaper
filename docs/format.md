# Proposed format: 0.1

The file extension is `.breadboard.yaml`. YAML represents a graph, not a rendered
picture. Validate parsed data against `schema/breadboard.schema.json`, then run
reference and scenario checks; JSON Schema alone cannot validate graph topology.

## Semantic elements

- `nodes`: a mapping of stable IDs to places or components.
- `affordances`: named things available at a node. Kinds are `action`, `input`,
  `copy`, `capability`, and `event`.
- `connections`: explicitly typed directed edges from an affordance to a node or
  another affordance. Kinds are `navigate`, `invoke`, `emit`, `read`, and `write`.
- `scenarios`: a goal, starting node, ordered affordance references, and ending node.
  These are proposed walkthroughs; they are not proof of successful execution.

IDs contain lowercase letters, digits, hyphens, and underscores, starting with a
letter. Labels can change without changing IDs. Affordance references use
`node_id.affordance_id`; node IDs therefore cannot contain dots. An empty
`affordances: {}` is valid for a destination whose details have not been shaped.

Each connection starts at an affordance. Its destination may be a whole node or a
specific capability, such as `publishing.publish`. The connection label may clarify
the contract. `emit` records the direction of event delivery; it does not imply
that a producer waits for a consumer to finish.

Do not assume that a node is a screen or that every connection is navigation.
Likewise, ordering in the YAML file does not define layout or execution order.

## Presentation and extensions

`layout.nodes` stores optional x/y positions keyed by node ID. Missing positions
receive an initial automatic arrangement. Semantic checks ignore positions.

`metadata` may hold application-specific information. Preserve it and all
undisplayed scenarios when saving. Unknown keys outside `metadata` are validation
errors, so misspellings do not silently disappear.

An optional `.tldr` sidecar can preserve freehand notes and native canvas details.
The YAML remains sufficient to reconstruct the structured graph. Sidecar data
must be reconciled by stable semantic IDs; it cannot override YAML structure.

Initial serialization guarantees semantic round trips, not identical whitespace,
comments, or YAML anchor syntax. If preserving comments becomes necessary, use a
YAML document-tree editor and make that guarantee explicit.

## Checks

1. Parse YAML with duplicate-key detection, bounded input size/alias expansion,
   and no custom executable tags.
2. Validate the schema version and all field types.
3. Resolve every edge, scenario, and layout reference. Report missing references
   without deleting them or silently inventing replacements.
4. Warn about nodes unreachable from scenario starts. With no declared starts,
   report that reachability has not been assessed. A terminal node is not an error.
5. Walk each scenario using `navigate` edges. Referenced affordances must be
   available at the current place; local input/copy steps remain there. Every
   traversed action must have one unambiguous navigation destination and the final
   place must match `end`. An unconnected action or branching transition is
   inconclusive until the scenario specifies its outcome; it is not silently
   treated as a successful transition.

Scenario traversal across `invoke`, `emit`, `read`, or `write` requires explicit
execution, completion, and state semantics that this version does not define.
Validate their references, but report behavioral checks as not evaluated. Add
those semantics when a real component scenario needs them.

Use-case fit remains a reasoned assessment against the scenario's `goal` and any
requirements supplied alongside it. A connected graph alone does not establish fit.
