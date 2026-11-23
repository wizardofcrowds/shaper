# Local tldraw editor

Run `./dev`, then open the printed localhost URL. Use `pnpm build` for a static
production build, or `pnpm preview` to check that build on localhost. Hosted
production use needs an appropriate tldraw license; localhost development does not.

## Architecture

```text
YAML file -> parse + validate -> semantic model <-> tldraw adapter
                                     |
                                graph checks
                                     |
                           findings / walkthroughs

image -> extraction draft + review notes -> reviewed semantic model
```

The semantic model is authoritative and stored in the current tldraw page's
metadata, so native history includes scenarios and other undisplayed data. Canvas
actions update that model by stable IDs. Node shapes and edge geometry are derived
views. Save serializes the complete model and layout to the current file. Native drawing snapshots are
not the portable file format, and native/freehand sidecars are not implemented yet.

Custom place/component shapes have underlined headings and identifiable affordance
rows. Connection endpoints are semantic IDs, not row indices or coordinates.
Geometry is recomputed after moves or row changes. Renaming or reordering a row
does not rewire its connections.

Select a place or component to choose one of 16 named colors in its inspector.
The palette changes the canvas tint, heading, underline, ports, and navigation
icon while keeping affordance text dark. The selected swatch shows a checkmark
and color name. Reset to default removes the optional YAML `color` field. Color
edits participate in undo/redo and survive Save, Save As, and Open. Existing
breadboards without colors keep their original appearance.

Select a place to reorder its affordances with the up/down buttons beside each
item. The affordance inspector also has Move up/Move down actions. Order updates
on the canvas, participates in undo/redo, and is preserved in saved YAML. The
first item cannot move up and the last cannot move down.
The YAML stores this presentation order explicitly as `affordance_order` on each
node. It does not rely on object-key order, which tldraw's structural equality
checks treat as insignificant. Files without the array remain supported.

The React/TypeScript app offers New, Open, Save, Save As, and Check actions, plus
a YAML dialog for direct text edits. Applying text validates it before replacing
the current model. Label edits commit on blur or Enter; Escape cancels a label
edit. Save commits the focused label before serializing. Standard undo/redo and
save shortcuts are supported.

The two panel icons in the document toolbar independently hide or show the left
Places and components pane and the right Inspector. Their controls remain
available when both panes are hidden, and toggling them does not change diagram
data or selection. Check explicitly opens the Inspector to show its results.
Connections are listed and edited in the Inspector's Connections tab; the left
pane has no duplicate connection list or Add connection section. Select an affordance from its place's list or directly on the canvas to edit its
label, kind, order, and outgoing connections. Each outgoing connection has destination,
kind, optional label, and Delete controls. Add connection creates an editable path
initially targeting the first node; choose its destination in the inspector. A
canvas alternative starts from an affordance's + port. Selecting an element opens
the Inspector if it was collapsed.

The YAML stores connections only under their source affordance, without `from`.
The Connections tab is a derived graph-wide list. Changing a source there moves
the nested record, retaining its fields and choosing a fresh local ID on collision.
Top-level connection files are rejected; there is no old-format import support. On narrow screens the left pane opens
as an overlay, while the right pane can collapse to leave more room for the canvas.

## Local file workflow

Open and Save As use a folder/filename dialog served by the local app. The Folder
field accepts an absolute path (or `~/…`); press Go or Enter to navigate. Click a
folder to enter it, select a YAML file, or enter a new filename. A missing extension
on Save As becomes `.yaml`; both `.yaml` and `.yml` are supported.

- New and the examples clear the current file association. Their first Save asks
  for a destination.
- Open validates a file before replacing the drawing and associates its full path.
  Save atomically writes to that file without another destination prompt.
- Save As always chooses a destination, confirms replacement if it exists, and
  makes that destination the current file for subsequent saves.
- Cancel and failed operations preserve the current document and file association.
- ⌘S/Ctrl+S invokes Save; ⇧⌘S/Ctrl+Shift+S invokes Save As. Apply pending YAML text
  edits before saving. Saving commits the focused inspector field first.
- The status bar shows the current full path, or indicates the document has no file.

`server/files.ts` validates breadboard content before writing, uses atomic file
replacement, and compares a content revision to detect external changes. Conflicts
leave the in-memory drawing and disk file intact. Reopen to review the disk version
or Save As to a different filename. No autosave is implemented.

`server/plugin.ts` provides the file operations in Vite dev and preview servers.
Requests must be from loopback, use an allowed localhost Host and same Origin,
and carry a per-server token for file operations. Only YAML files and folder names
are exposed; hidden entries are omitted and symbolic file links are rejected.
The app must run with its local server; a separately hosted static bundle does
not provide local filesystem access. No native picker API or OS scripting is used.

Invalid input leaves the current drawing intact and reports its field path or
line location. A rejected Open never changes which file Save will update.

The independent YAML API in `yaml-api.md` is the first implementation milestone.
The editor follows that foundation. Camera capture follows the editor, using the
local integration described in `camera-capture.md`.

## Editor milestone

- Open `examples/two-paths.breadboard.yaml`.
- Display Home with two affordances and their destination places.
- Edit a label, move a node, and reconnect an affordance.
- Add/delete places, components, affordances, and connections. Deleting an owner removes its outgoing connections. Incoming connections and
  affected scenarios remain and surface in Checks. The last node
  cannot be deleted because the current schema requires at least one node.
- Save YAML to a selected path and reopen it, preserving meaning, stable IDs, scenarios,
  metadata, and positions.
- Show schema/reference errors and an invalid scenario path clearly.

The initial editor milestone is implemented. Automated tests cover model edits,
ID-based geometry, metadata preservation, deletion, and scenario diagnostics.
Browser verification covers creating elements, port-to-target connections,
reconnecting, dragging, undo/redo, invalid YAML recovery, and file save/reopen.

The editor materializes deterministic positions when the source omits them.
Dragging records the actual tldraw coordinates in `layout.nodes`. Invalid or
unfinished references stay in YAML and in the Connections/Checks panels; an edge
whose endpoints are missing is not drawn until its endpoints are resolved.

Check resolves references and follows unambiguous navigation scenarios. Ambiguous
paths and component interactions are reported as inconclusive. Reachability from
scenario starts and assessment against framing requirements remain future work.

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


### Routing arrows

Select an arrow on the canvas, or select it in the Connections tab. Drag the round
handle at the middle of its vertical segment left or right to move the route
around places or separate overlapping paths. The route remains horizontal →
vertical → horizontal. Use **Reset route** in the connection inspector to return
to automatic routing. Save stores the custom route in the breadboard YAML, and
Undo/Redo applies to routing edits. This control moves one vertical segment;
additional bends and automatic obstacle avoidance are not implemented.

### Data inside components

Select a component and use **+** beside **Data elements**. Enter a domain name
such as Order or Guided Exploration. Data appears in a distinct DATA row below
the component's affordances; clicking the row opens its component inspector.
Components do not require data, and data elements have no behavior ports.

Under a data element, choose **Add association**, select the related data element,
and create the association. Its inspector lets you edit both endpoints, the label,
and each end's cardinality. Cardinalities can remain unspecified. For example,
Order (1) — Guided Exploration (0..*) describes an order with many explorations.
The related element may belong to another component or the same component.

Associations appear as dashed lines without arrowheads and are also listed in the
Connections tab under **Data associations**. Select a line to edit it; drag its
round handle to adjust the vertical segment or use **Reset route**. Data and
associations are saved in YAML and participate in Undo/Redo. Deleting referenced
data leaves an issue in Checks so you can reconnect or remove the association.


A component can contain several data elements: add Order and LineItem under
Ordering, then use Order's **Add association** and choose LineItem under
**Same component**. Set the label to “contains”, source cardinality to **One**,
and related cardinality to **Many**. The line routes outside the component's
right edge, joining the two DATA rows. Its handle cannot be dragged through the
component. Choose **Order and line items** in Examples to try this arrangement.
Attributes can be listed inside each data element; association endpoints remain
on whole data elements.


Under each data element, use **+** beside **Attributes**, type a name such as
`order_id`, and choose **Add attribute**. The field starts empty with a placeholder.
You can rename attributes in their fields or remove one with its **×** button.
Attributes appear as indented rows on the canvas, in the order added. They are
saved in YAML and participate in Undo/Redo. Association lines stay attached to
the data element's header as its attribute list grows.


Read connections use thin black dotted lines; write connections use thin orange
dotted lines. Both retain matching arrowheads to show direction. Navigation and
detour connections use solid lines. Invocation and event connections use broken
lines with arrowheads; data associations use dashes without arrowheads. This styling is derived from the connection kind and
requires no changes to existing YAML files.


### Login badges and optional detours

Select a navigation connection and enable **Login required**. Choose its **Login
place**, or leave it unspecified while shaping. The line to the intended destination
gets a small badge; no extra arrow to the login place is drawn. The requirement
and login-place reference are preserved in YAML. Checks flags missing login places.

For **Member Login** in **Payment Method & Contact**, connect the affordance to the
login place and choose connection kind **detour**. The inspector explains that
completion or cancellation returns to the calling place with its task information
retained. The same pattern works for other optional interruptions. This differs
from required login, which continues to the intended destination after success.

Try **Login and detours** in Examples to see both patterns. These settings describe
the intended product flow; Shaper does not perform authentication or redirects.

### Filtering connection destinations

Type in the search field above **To place or affordance** to narrow the destination
list by name or semantic ID. Filtered results expand as you type and are grouped
into **Places and components** and **Affordances**, including entries such as
**Cart / Create Cart**. Search ignores case, and multiple words narrow the
results further. The current destination remains visible even when it does not
match; typing never changes a connection. Choose a matching option to reconnect.
Clear the search with **×** or Escape to restore all choices. The same filter is
available for **From affordance** and place-only destination pickers.


The left Places and components pane starts collapsed. Use **Show left pane** in
the document toolbar to open it, and **Hide left pane** to collapse it again.

### Named areas and focused views

Use **Manage areas** beside the canvas **+Place** and **+Component** buttons to predefine names such as **Create an Order**.
Select a place or component and choose its **Area** in the inspector. Area
membership is explicit; dragging an element does not change it. The area name
appears in the element's heading and in the navigator.

The **Area** toolbar switches between **All areas**, **Unassigned**, and each named
area. The canvas and navigator show that view's residents. New places and
components inherit the active named area, or start Unassigned in the other views.
Switching views preserves element positions and remembers each view's pan/zoom
for the current session. Filtering does not mark the document as changed.

In a focused view, **Outside this area** lists incoming and outgoing behavioral
connections, data associations, and login dependencies to hidden elements. Select
an entry to open the connected element's area. The Connections and Checks tabs
still inspect the entire document. Saving always includes all areas and hidden
elements. Reloading opens All areas.

Rename or delete areas centrally in **Manage areas**. Deleting an area leaves its
residents Unassigned and keeps their data, positions and connections; Undo restores
the definition and membership. Areas have no spatial regions or drag-to-assign behavior.
