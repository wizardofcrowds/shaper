# Proposed format: 0.1

The file extension is `.breadboard.yaml`. YAML represents a graph, not a rendered
picture. Validate parsed data against `schema/breadboard.schema.json`, then run
reference and scenario checks; JSON Schema alone cannot validate graph topology.

## Semantic elements

- `nodes`: a mapping of stable IDs to places or components.
- `areas`: an optional mapping of stable IDs to named areas. A node’s optional
  `area` field assigns it to one area; omission means unassigned.
- `affordances`: named things available at a node. Kinds are `action`, `input`,
  `copy`, `capability`, and `event`.
- Each affordance may have a `connections` mapping of local IDs to directed
  edges to a node or another affordance. Kinds are `navigate`, `detour`, `invoke`, `emit`, `read`, and `write`.
- `scenarios`: a goal, starting node, ordered affordance references, and ending node.
  These are proposed walkthroughs; they are not proof of successful execution.

IDs contain lowercase letters, digits, hyphens, and underscores, starting with a
letter. Labels can change without changing IDs. Affordance references use
`node_id.affordance_id`; node IDs therefore cannot contain dots. An empty
`affordances: {}` is valid for a destination whose details have not been shaped.

Connections are nested under their source affordance; no `from` field is stored.
Omit `connections` or use `{}` when an affordance has no outgoing paths. Each
connection requires `to` and `kind`, with optional `label`, `metadata`, and a
`login` requirement for navigation.
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

Each node may have a `color` chosen from the 16-color palette: `slate`, `gray`,
`brown`, `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`,
`cyan`, `blue`, `indigo`, `violet`, or `pink`. For example, `color: blue` on a
place or component adds a light tint and a matching heading/underline. Omitting
`color` preserves the default appearance. Colors do not affect graph or scenario
meaning; they survive editing and saving like other node fields.

`layout.nodes` stores optional x/y positions keyed by node ID. Missing positions
receive an initial automatic arrangement. Semantic checks ignore positions.

`layout.connections` optionally stores manual routing by fully qualified connection
ID (`node.affordance.connection`). Each entry has an `x` coordinate for the
vertical segment in canvas coordinates:

```yaml
layout:
  connections:
    home.path_one.first_path: { x: 720 }
```

Without an entry, the arrow uses automatic routing. Endpoints follow their nodes;
a manual vertical segment stays at its saved x position. The destination attaches
to the side facing the route. Resetting a route removes its entry. Reassigning a
connection's source transfers its route to the new connection ID. Routing does
not change graph meaning. Existing YAML files require no migration; files saved
with this optional field require a Shaper version that supports it.

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

## Component data and associations

A component may hold named domain data elements in `data`. Data is optional;
components can expose capabilities without holding data. Places cannot contain
data elements. Data names and affordance names are separate ID namespaces.

```yaml
nodes:
  ordering:
    kind: component
    label: Ordering
    affordances:
      place_order: { kind: capability, label: Place order }
    data:
      order: { label: Order }
  explorations:
    kind: component
    label: Explorations
    affordances: {}
    data:
      exploration: { label: Guided Exploration }
associations:
  purchased_explorations:
    from: ordering.order
    to: explorations.exploration
    label: contains purchased explorations
    from_cardinality: '1'
    to_cardinality: '0..*'
```

Each association has a stable document-wide ID and two `component.data` references.
It describes structure, not an invocation, navigation step, or foreign key. The
optional label describes the relationship from `from` to `to`; cardinality at each
end can be `1`, `0..1`, `0..*`, or `1..*`. Omit a cardinality to leave it undecided.
Data elements and associations support optional `metadata`. Data elements may
also list optional named `attributes` (see below). Database types and persistence
details are outside this feature.

Associations cannot target affordances, and behavioral connections cannot target
data. Checks reports missing data references separately from behavioral checks;
associations do not participate in scenarios. Deleting data or its component
retains its associations for review, while unresolved lines are omitted from the
canvas. Renaming a data label preserves its stable references.

`layout.associations` optionally stores `{ x: number }` routing entries keyed by
association ID, independently of `layout.connections`. Removing an association
also removes its saved route. Existing documents without these fields need no
migration. Documents using the new fields need an updated Shaper reader.


### Embedded data attributes

A data element can include an optional ordered list of attribute names:

```yaml
data:
  line_item:
    label: LineItem
    attributes: [order_id, quantity, unit_price]
```

Names must be nonblank strings, unique within that element. The editor trims
names when adding or renaming them; it preserves their list order. Omitting
`attributes` leaves the existing compact data element unchanged. Attribute names
are displayed beneath their data element; they are not reference IDs or ports.
Associations still reference `component.data`, never an attribute. Renaming or
removing an attribute therefore does not rewire any association. No types, keys,
or relationships are inferred from names such as `order_id`.


## Login requirements and detours

A navigation connection can require login without drawing another edge to the
login place:

```yaml
affordances:
  show_article:
    kind: action
    label: Show article
    connections:
      detail:
        kind: navigate
        to: article_detail
        login:
          via: member_login
```

The canvas shows a **Login required** badge on the connection. A signed-in user
continues directly to the destination. Otherwise, the modeled flow visits the
login place, then resumes the original destination with its selected-item/task
context. Cancellation leaves the caller at the source place. `login: {}` records
the requirement while leaving the login place undecided; Checks reports a warning.
`login.via`, when specified, must reference a place. Login requirements apply only
to `navigate` connections targeting whole places.

Optional interruptions use a separate connection kind:

```yaml
affordances:
  member_login:
    kind: action
    label: Member Login
    connections:
      login:
        kind: detour
        to: member_login
```

A detour visits its target place and returns to the source place after completion
or cancellation, preserving the calling task and entered information. The return
place is inferred from the connection's owner; no fixed return edge is stored.
Moving the connection to another owner changes its caller. Detours are not
restricted to login. They must target a whole place and cannot carry a `login`
requirement. Their canvas labels include “detour · returns here” unless a custom
label is set.

These are design annotations, not authentication execution or persisted runtime
context. The scenario checker reports gated navigation and detours as needing
explicit outcome semantics rather than assuming authentication succeeded. Existing
connections without these additions retain their previous behavior.

## Named areas

Areas use explicit membership:

```yaml
areas:
  create_order:
    label: Create an Order
nodes:
  checkout:
    kind: place
    label: Checkout
    area: create_order
    affordances: {}
```

`areas` is an optional mapping of stable IDs to `{ label, metadata? }` definitions.
A place or component has at most one optional `area` ID. Omission means Unassigned.
Area labels are centrally managed; renaming a label does not change IDs or node
references. The editor prevents blank and duplicate area names. Checks reports
references to missing areas.

Assignment does not move nodes or change connections, associations, data,
or scenarios. Dragging nodes never changes their named area. Deleting an area
removes its residents' `area` references and preserves the residents themselves.
Undo restores the definition and assignments.

Filtering is a view setting, not a document transformation. Saving a filtered
view writes the entire model, including hidden residents, wires, data and layout.
Positions are shared across views; pan and zoom are remembered separately per
view for the current session. The area filter and camera positions are not stored
in YAML. Existing files remain valid and open in All areas.


### Importing older spatial groups

The retired `slices`, node `slice`, and `layout.slices` fields are accepted only
when importing old YAML. Definitions and memberships become named areas, with
stable IDs remapped if they conflict with existing area IDs. Existing area
assignments take precedence; old conflicting memberships are preserved in node
metadata. Group metadata is retained, and old region bounds are preserved under
a collision-safe `metadata.legacy_regions` key. Places, components, positions,
data, scenarios, connections, and routes are unchanged. A subsequent save writes
only the current area model. The writer and current JSON Schema reject retired
fields; they cannot be introduced into new documents.

## Tags, notes, and extracted metadata

Places, components and affordances may carry optional first-class `tags` and
`notes` alongside their `kind` and `label`. Connections may carry `notes`, but
not tags. These fields are not supported on areas, data elements or associations.

```yaml
onb_team:
  kind: place
  label: Onboarding · Team
  tags: [role:lms_admin, role:employer_hr, needs-review]
  notes: |
    Should Payroll be able to invite people here?
  metadata:
    source: src/pages/HrOnboarding.tsx:722
    roles: [lms_admin, employer_hr]
  affordances:
    continue:
      kind: action
      label: Continue
      tags: [role:lms_admin]
      notes: Confirm the next place with the product owner.
      connections:
        policies:
          kind: navigate
          to: policies
          notes: Only after team setup is complete.
```

Tags are an ordered list of unique, nonblank strings matching
`^[a-z0-9_-]+(?::[a-z0-9_-]+)?$`. Letters are lowercase; spaces, uppercase and
multiple colons are rejected. Inspector input trims outer whitespace before
adding a tag. The parser and writer validate rather than rewriting tags, and
preserve their order and prefixes exactly. Prefixes group filter options only;
they imply no permissions, inheritance or application behavior. Tag filtering
matches a place/component's own tags; affordance tags are displayed on their rows
and do not cause the parent to match a filter.

Notes are free-text strings, including multiple lines. The writer omits notes
that are empty or entirely whitespace, without mutating its input. It preserves
all text and indentation of nonblank notes. This applies only to first-class
notes: `metadata.notes` and every other metadata value remain unchanged. Existing
files without tags or notes remain valid at version `0.1`.

`metadata` is preserved as extraction/source context and shown read-only in the
inspector. It is never automatically promoted into editable notes or tags. Import
scripts may own selected tag prefixes, metadata and other fields, but Shaper does
not enforce importer-specific ownership policies.

### Shared sizing for importers

Use the browser-independent `shaper/geometry` export (or `src/geometry.ts` when
working directly from the repository) to position imported nodes:

```ts
import { nodeHeight, affordanceY, dataRowY, NODE_WIDTH } from 'shaper/geometry';
```

`nodeHeight(node)` includes node tags, affordance tags, data elements and embedded
attributes. `affordanceY(node, id)` and `dataRowY(node, id)` are local attachment
coordinates; add the node's layout y position to obtain canvas coordinates.
For nodes without tags, the original dimensions remain: header 84, affordance
rows 48, attribute rows 28, and bottom padding 12. Node chip rows add 22 each;
affordance chip rows add 18 each. `tagRows` and `tagChipWidth` calculate explicit
chip packing with a 4-pixel gap, using 276 pixels for node tags and 224 for
affordance tags. The renderer uses the same packing, so geometry does not depend
on measuring fonts or on the active filters. Importers should call these helpers
rather than duplicate the sizing formula.
