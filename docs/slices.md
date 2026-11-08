# Slices in breadboarding

Status: the first slice editor implementation is complete. The original
requirements and agreed behavior are recorded below, followed by the implemented
controls and file representation.

## Source and context

Requirement relayed from Koichi's Hover app-shaping discussion:

> The breadboard should let us represent which components and places belong to
> each slice while keeping the connections and dependencies across slices visible.
> A slice should express a usable outcome, such as a host being able to prepare
> for an upcoming exploration, rather than a technical layer.

Koichi's follow-up establishes exclusive whole-node membership, visual slice
regions on the canvas, drag-to-assign behavior, and storage in the breadboard YAML.

The discussion first lists candidate solutions and alternative versions that
support progress against the founding framing. A version of the set of solutions
is chosen before slicing. Slicing then helps choose useful implementation
increments with relatively few dependencies on other slices. Here, a shape means
a solution approach, not an individual tldraw canvas object.

The earlier slices reference is the
[shaping methodology](https://github.com/rjs/shaping-skills/blob/main/shaping/SKILL.md).
It is background context; this document captures the requested Shaper capability.

## Agreed behavior

- A slice is a named visual region on the breadboard canvas that covers its
  member places and components. The user can add a slice and name it in the UI.
- A slice expresses a usable outcome, for example a host being able to prepare
  for an upcoming exploration. It groups a useful increment across the places and
  components needed for that outcome, rather than grouping by a technical layer.
  The name can express the outcome; no separate outcome field or proof workflow
  is required at this point.
- Membership applies to an entire place or component, including its affordances.
  Individual affordances and connections are not assigned independently.
- A place or component belongs to at most one slice. It may also be unassigned.
  A slice may cover multiple places and components across the proposed system.
- Moving a place or component into a slice region assigns it to that slice.
  Moving it into another slice reassigns it instead of adding a second membership.
  The user can also unassign a place or component.
- Shared or already available pieces use the same assign, reassign, or unassign
  operations. There is no separate shared-membership or existing-work category
  required for this version.
- A slice is a grouping, not a connection endpoint. There is no separate wiring
  between slices. Places, components, and their affordances continue to connect
  to other places, components, and affordances, including those in other slices.
- Connections remain attached to the same underlying nodes and affordances as
  membership changes. Connections crossing slice boundaries stay visible and
  inspectable, including connections to unassigned places or components.
- The grouped view helps the user understand implementation prerequisites and
  decide which slice to start with. Shaper supports that judgment; it does not
  need to solve prerequisites or choose an implementation order automatically.
- Slice data lives in the breadboard YAML. Save and Open must retain slice names,
  membership, and the slice-region presentation needed to reconstruct the diagram.
  No separate linked slice document is required.
- Alternative solution versions have already been resolved before slicing.
  Supporting competing ways of slicing different versions is outside this scope.

Existing place/component colors remain presentation choices. Color alone does
not establish slice membership; the slice region and assignment do.

## Understanding prerequisites

The diagram retains the existing node-to-node wiring and adds slice membership
and visible group boundaries. A connection from a place or component in slice A
to a place or component in slice B remains that same connection. It does not
become a slice-to-slice edge, and no additional slice-level wiring is required.

Implementation prerequisites are a judgment the user makes from this view and
knowledge of the proposed work. For example, an invocation of functionality that
does not exist yet may mean one slice needs work in another slice before its
outcome is usable. A link to an optional later feature may not block an earlier
increment. The connection alone does not determine the implementation order.

Shaper's role is to make the groups and the relevant connections understandable
so the user can identify prerequisites and choose a starting slice. Automatically
inferring or resolving prerequisites, diagnosing dependency cycles, scoring
independence, and recommending or enforcing a build order are not required for
this feature. No separate prerequisite data model is needed for the agreed scope.

## Current controls and persistence

- Use **Slice** above the canvas or **+** beside **Slices** in the navigator to
  create an empty region to the right of the existing diagram. It appears in the
  canvas and navigator, and its inspector lets you name the useful outcome.
- Drag a place/component by its heading. Dropping its center inside a region's
  body assigns the whole node. Dropping in another region reassigns it; dropping
  outside every region unassigns it. A destination expands as needed to cover
  the whole node. Crossing a region while dragging does not assign it en route.
- If regions overlap, the smallest region containing the node's center wins;
  slice ID order breaks equal-area ties. Membership is always exclusive.
- The node inspector's **Slice** selector provides the same assignment operation.
  Selecting a destination positions the node inside it. Selecting **Unassigned**,
  or using **Unassign** in the slice's member list, moves the node outside all
  regions and removes its assignment.
- Select a slice from the navigator, by its heading, or at its boundary. Dragging
  the heading moves its assigned members together. It does not collect unrelated
  nodes that happen to lie under the region at its new position.
- Resize using corner handles or the inspector's width/height fields. Resizing
  does not scale members or assign nearby nodes. A region cannot shrink past its
  members; adding affordances expands it when needed to keep them covered.
- The slice inspector lists members and the existing node connections crossing
  its boundary, including connections to unassigned nodes. Selecting one opens
  the ordinary connection inspector. It does not create a slice-to-slice wire or
  judge implementation prerequisites.
- **Delete slice · keep members** removes only the region and assignments. Nodes,
  connections, scenarios, and node positions remain. Undo/redo includes region
  edits, membership changes, and grouped movement.

The YAML adds optional `slices` definitions with a `label` and optional `metadata`,
an optional `slice` ID on each node, and rectangle bounds in `layout.slices`.
These use the existing document ID convention. No new document version or
reference scheme is introduced. Files without slices keep working. Save, Save As,
and Open retain the complete slice data alongside the rest of the breadboard.
See [the format](format.md#slices) and the
[illustrative sliced journey](../examples/slices.breadboard.yaml).

## Acceptance

1. Add and name a slice region on the canvas.
2. Assign a whole place or component by dragging it into the region.
3. Reassign it by dropping it into another region, or leave it unassigned.
4. Move/resize a region while keeping its members and their connections intact.
5. Continue seeing existing wiring across boundaries and inspect it from a slice.
6. Remove a region without deleting its members, and undo/redo the change.
7. Save and reopen the same slices, memberships, node data, and connections.

Use the visible groups and their members' connections to understand potential
prerequisites and decide where to begin. Shaper does not determine implementation
order or require a separate proof that the underlying product delivers an outcome.
Broader framing and fit reviews remain separate work.
