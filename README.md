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

This repository implements a local tldraw breadboard editor and the independent
YAML parser, validator, and writer. Camera capture and automatic interpretation of
hand-drawn diagrams are planned next; neither is implemented yet.
The schema is experimental; use real diagrams to refine it before declaring it stable.

## Run the editor

Install Node.js 22.18+ and pnpm, then run:

```sh
pnpm install
./dev
```

The launcher uses Node on your PATH. Set `SHAPER_NODE` to choose an explicit
Node executable. After dependencies are installed, `./dev` does not require a
global pnpm installation. `pnpm dev` is also available.

Open the printed localhost URL. Start from the included two-path example, choose
New, or open a `.breadboard.yaml` file. Select headings and affordances to edit
them, drag headings to move places, and use an affordance's + port to connect it
to a heading or another affordance. Existing paths can be reconnected in the
Connections panel or edit outgoing paths directly in the affordance inspector.
Connections are nested under source affordances in YAML; the previous top-level
format is no longer accepted. Save YAML downloads the complete document, including hidden
metadata and scenarios. Files are processed in the browser; no backend is needed.

Run `pnpm typecheck`, `pnpm test`, and `pnpm build` for verification.

- [Format](docs/format.md) and [JSON Schema](schema/breadboard.schema.json)
- [YAML API and development](docs/yaml-api.md)
- [Editor design and first milestone](docs/editor.md)
- [Hand-drawn import and review](docs/image-import.md)
- [Camera capture from Codex (planned)](docs/camera-capture.md)
- [Two-path example](examples/two-paths.breadboard.yaml)
- [Component interaction example](examples/publishing.breadboard.yaml)

## Two ways into the same model

1. Open YAML in the editor, change the breadboard visually, and save YAML.
2. Supply a photo or scan, extract a draft model, review uncertainties against the
   image, and accept the result as a breadboard file.

Both paths use the same semantic model and checks. A drawing's position does not
determine its meaning. Freehand annotations are supplementary and are preserved
in a future optional native drawing sidecar rather than inferred as executable
structure. The current editor exposes structured breadboard elements only.

## First implementation

Start with the independent YAML layer in `src/index.ts`: `parseBreadboard`,
`validateBreadboard`, and `writeBreadboard`. Runtime validation uses the checked-in
JSON Schema. Round-trip tests preserve metadata, scenarios, and layout. Graph and
fit checks remain separate from file-format validation.

The React/TypeScript editor in `src/editor` uses the tldraw SDK and this YAML API.
Open and Save YAML operate on local files. Graph checks are independent of the
canvas, in `src/editor/model.ts`.

The first acceptance case is: open the two-path example, rename an affordance,
move a place, reconnect one path, save, and reopen. All semantic fields, stable
IDs, scenarios, and positions must survive.

Camera capture and image recognition are separate milestones. A planned local
capture command will let Codex acquire a photo from a connected camera. Until
recognition is implemented, a photo can be transcribed
with an assistant and checked using the same model and review workflow. Never
present an image upload interface as automatic recognition before it is implemented.

## SDK consideration

tldraw supports custom shapes, editing, bindings, and native JSON snapshots. YAML
conversion is handled by Shaper. See the SDK documentation:

- https://tldraw.dev/examples/custom-shape
- https://tldraw.dev/sdk-features/bindings
- https://tldraw.dev/docs/persistence

## tldraw licensing

Shaper currently does not configure a tldraw license key. The SDK accepts one
through the `licenseKey` prop on `<Tldraw>` in `src/editor/App.tsx`.

The installed SDK's license notice is at `node_modules/tldraw/LICENSE.md`. Consult
[tldraw's licensing information](https://tldraw.dev/community/license) for the
applicable terms.
