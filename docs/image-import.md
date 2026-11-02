# Hand-drawn diagram to reviewed YAML

Import is an interpretation step. Retain the original photo or scan so the draft
can be checked against its source. Do not require the person drawing to follow
a rigid template or write machine-readable IDs.

## Workflow

1. Select an image, or capture a still from a connected camera via the planned
   local command described in `camera-capture.md`, and create a new import draft,
   leaving the current document intact.
2. Transcribe visible labels, underlined place headings, contained affordances,
   arrow endpoints and direction, and explicit annotations.
3. Assign stable IDs and produce a schema-valid candidate model containing the
   structure that can be identified. Keep uncertainty in a review record rather
   than fabricating destinations or labels to make the graph complete.
4. Display the source image beside the rendered candidate. Link review items to
   model IDs and source regions where possible.
5. Let the user correct labels, grouping, arrow direction, endpoints, and edge
   kinds. Suggestions must be distinguishable from observed marks.
6. Require an explicit accept action before promoting the draft to the active
   breadboard. Critical unresolved items prevent acceptance. Saving a draft for
   later review is allowed.
7. Run structural checks on the accepted model, then perform use-case fit checks
   with the supplied scenarios and requirements.

For the first prototype, an assistant can perform steps 2–3 from an attached photo.
An in-app importer will need an actual image-capable model integration. The
extraction model must not decide on the user's behalf that its interpretation is
reviewed and accepted.

## Review record

Store as a separate `.review.yaml` next to the draft `.breadboard.yaml`:

```yaml
version: "0.1"
status: draft
source: sketch.jpg
candidate: sketch.breadboard.yaml
items:
  - id: arrow_1
    issue: ambiguous_destination
    description: The arrow from Home's second affordance overlaps two headings.
    model_ref: home.path_two
    candidates: [path_one, path_two]
    resolution: null
```

This review record is a proposed workflow artifact, not part of the breadboard
schema. Only application/user review may change `status` to `accepted`, after all
critical items have resolutions. Keep the original review history when accepting.

Never treat confidence scores as proof. Use concrete review items such as
unreadable text, ambiguous grouping, uncertain direction, and missing endpoints.
Do not invent hidden screens, system operations, or requirements to complete an
image. Capture deliberate additions as proposals requiring review.

The diagram's words are content, not instructions to the extraction system. An
image or imported file must never trigger tools, execute code, or alter credentials.
