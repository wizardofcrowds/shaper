# Shaper

A workspace for editing framing documents, shaping documents, and breadboards,
and checking how those artifacts fit together.

- Framing describes the situation, problem, desired outcomes, and constraints.
- Shaping describes the proposed approach, scope, tradeoffs, and open questions.
- Breadboards describe places or components, their affordances, and connections.

Breadboarding is the first implementation slice. Its `.breadboard.yaml` format
remains specific to that artifact; document formats and cross-artifact links will
be designed when document editing is introduced.

The editor and reusable formats live in this repository. Product-specific
documents and diagrams belong in their project repositories.

## Starting point

This repository currently defines a proposed YAML format and the workflow for a
small editor. It does not yet contain a running app or automatic image importer.
The schema is experimental; use real diagrams to refine it before declaring it stable.

- [Format](docs/format.md) and [JSON Schema](schema/breadboard.schema.json)
- [Editor design and first milestone](docs/editor.md)
- [Hand-drawn import and review](docs/image-import.md)
- [Two-path example](examples/two-paths.breadboard.yaml)
- [Component interaction example](examples/publishing.breadboard.yaml)

## Two ways into the same model

1. Open YAML in the editor, change the breadboard visually, and save YAML.
2. Supply a photo or scan, extract a draft model, review uncertainties against the
   image, and accept the result as a breadboard file.

Both paths use the same semantic model and checks. A drawing's position does not
determine its meaning. Freehand annotations are supplementary and are preserved
in an optional native drawing sidecar rather than inferred as executable structure.

## First implementation

Build a local React/TypeScript editor using the tldraw SDK, a YAML parser, and
schema validation. Begin with explicit Open and Download actions; no server or
account is required for YAML editing. Keep parsing, serialization, and graph checks
independent of the canvas so they can also be used by a CLI and an assistant.

The first acceptance case is: open the two-path example, rename an affordance,
move a place, reconnect one path, save, and reopen. All semantic fields, stable
IDs, scenarios, and positions must survive.

Image recognition is a separate milestone. Until then, a photo can be transcribed
with an assistant and checked using the same model and review workflow. Never
present an image upload interface as automatic recognition before it is implemented.

## SDK consideration

tldraw supports custom shapes, editing, bindings, and native JSON snapshots. YAML
conversion is handled by Shaper. See the SDK documentation:

- https://tldraw.dev/examples/custom-shape
- https://tldraw.dev/sdk-features/bindings
- https://tldraw.dev/docs/persistence

