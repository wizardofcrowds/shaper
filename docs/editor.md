# Local editor

## Architecture

```text
YAML file -> parse + validate -> semantic model <-> tldraw adapter
                                     |
                                graph checks
                                     |
                           findings / walkthroughs

image -> extraction draft + review notes -> reviewed semantic model
```

The semantic model is authoritative. Canvas actions update the model by stable
IDs. Save serializes that model and its optional layout. Native drawing snapshots
are supplementary, not a substitute for the semantic file.

Use a custom place/component shape with an underlined heading and identifiable
affordance rows. Bind outgoing connections to affordance IDs, not row indices or
coordinates. Reordering or renaming a row must not rewire its connections.

Use React/TypeScript for the first app. Put model I/O and checks in a canvas-free
module. Use explicit Open, Save/Download, and Check actions initially; a live YAML
editor can follow once synchronization and error recovery are defined.

Invalid input must leave the current drawing intact. Show a useful field path or
line location. Never overwrite the source file while importing. Downloading a new
file works without requiring direct filesystem access or a backend.

## First milestone

- Open `examples/two-paths.breadboard.yaml`.
- Display Home with two affordances and their destination places.
- Edit a label, move a node, and reconnect an affordance.
- Add/delete places, affordances, and connections. Deletion must surface affected
  connections and scenarios rather than silently leaving an apparently valid graph.
- Download YAML and reopen it, preserving meaning, stable IDs, scenarios,
  metadata, and positions.
- Show schema/reference errors and an invalid scenario path clearly.

The example uses placeholders deliberately. The real names and destinations of
Hover's two paths have not yet been supplied.

## Subsequent milestones

1. Reviewed hand-drawn import, following `image-import.md`.
2. Scenario walkthroughs and checks with findings attached to graph IDs.
3. Component contracts and explicit state/outcome semantics as real examples demand.

Before implementing image extraction, choose an image-capable provider and how
credentials are supplied. A hosted provider requires a backend or a local proxy;
never bundle a secret API key into a browser app. Do not claim automatic image
recognition without a working integration.

## Verification priorities

- Parse -> serialize -> parse preserves semantic equality.
- Rename/reorder does not change connection identity.
- Invalid YAML/schema versions/duplicate keys cannot replace a valid document.
- Missing endpoints and invalid scenario steps produce actionable findings.
- Image extraction uncertainty remains visible until resolved by review.
- Browser verification covers the complete first milestone, not just rendering.
