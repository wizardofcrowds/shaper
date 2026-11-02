# Proposed format: 0.1

The file extension is `.breadboard.yaml`. YAML represents a graph, not a rendered
picture. Validate parsed data against `schema/breadboard.schema.json`, then run
reference and scenario checks; JSON Schema alone cannot validate graph topology.

## Semantic elements

- `nodes`: a mapping of stable IDs to places or components.
- `affordances`: named things available at a node. Kinds are `action`, `input`,
  `copy`, `capability`, and `event`.
- Each affordance may have a `connections` mapping of local IDs to directed
  edges to a node or another affordance. Kinds are `navigate`, `invoke`, `emit`, `read`, and `write`.
- `scenarios`: a goal, starting node, ordered affordance references, and ending node.
  These are proposed walkthroughs; they are not proof of successful execution.

IDs contain lowercase letters, digits, hyphens, and underscores, starting with a
letter. Labels can change without changing IDs. Affordance references use
`node_id.affordance_id`; node IDs therefore cannot contain dots. An empty
`affordances: {}` is valid for a destination whose details have not been shaped.

Connections are nested under their source affordance; no `from` field is stored.
Omit `connections` or use `{}` when an affordance has no outgoing paths. Each
connection requires `to` and `kind`, with optional `label` and `metadata`.
Connection IDs are unique within their owning affordance. The editor derives
`node_id.affordance_id.connection_id` to identify an edge across the graph; the
same local ID may appear under another affordance. Multiple entries represent
branching without requiring a particular execution order.

```yaml
nodes:
  home:
    kind: place
    label: Home
    affordances:
      learn_more:
        kind: action
        label: Learn more
        connections:
          show_information:
            to: information
            kind: navigate
  information:
    kind: place
    label: Information
    affordances: {}
```

This is the only supported connection format. Top-level `connections` and nested
`from` fields are rejected; no compatibility reader is provided. The experimental
version remains `0.1`.

A connection's destination may be a whole node or a specific capability, such as
`publishing.publish`. The connection label may clarify the contract. `emit` records the direction of event delivery; it does not imply
that a producer waits for a consumer to finish.

Do not assume that a node is a screen or that every connection is navigation.
Ordering does not define execution order or node positions. A node's optional
`affordance_order` array lists its affordance IDs in displayed row order.
Files without this array initially use mapping-key order; the editor materializes
an explicit array on opening. Sorting mapping keys does not change an explicit
display order. Reordering keeps affordance IDs and connection endpoints intact.

Order entries must be unique IDs. Reference checks report unknown entries and IDs
omitted from an explicit order. The editor displays known listed affordances
first, followed by any omitted affordances; it retains unresolved entries for review.

Deleting a source affordance or node removes the connections it owns. Connections
from other affordances to the deleted target, and scenario references, remain as
unresolved references for checks. Undo can restore the deleted owner and paths.
Changing a connection's source in the inspector moves its record to the new owner.
Its local ID is retained unless already used there; then a numeric suffix avoids
overwriting another path. All connection fields, including metadata, are retained.

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

The initial parser/writer implements the data-shape contract, documented in
`yaml-api.md`. YAML aliases are rejected rather than expanded, and files are
limited to 1 MiB of UTF-8 and 64 levels of data nesting. Graph checks are separate
from I/O: unfinished references do not prevent saving a schema-valid work in
progress. The editor implements reference checks and navigation walkthroughs;
reachability warnings from scenario starts remain planned.

## Checks

1. Parse YAML with duplicate-key detection, bounded input size and no alias expansion,
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
