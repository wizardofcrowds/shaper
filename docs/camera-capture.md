# Camera capture from a Codex session (planned)

The intended user interaction is: ask Codex to photograph a paper breadboard with
a camera connected to this computer, inspect the image, then produce and review a
YAML draft. Capture and recognition are separate operations. This capability is
not implemented by the YAML library.

## Local command first

Proposed command interface (not executable yet):

```text
shaper cameras --json
shaper capture --camera <device-id> --output <new-image-path> --json
```

Device discovery returns stable provider/device identifiers where the hardware
supports them and human-readable labels. Capture selects a device explicitly when
more than one camera is available, takes one still image, releases the device,
and returns the actual saved path, media type, dimensions, capture time, and device
identifier as structured JSON. Refuse an existing output path by default.

Use a local adapter for the selected camera/OS rather than putting hardware code
in the YAML module. Choose and test that adapter after identifying the actual
camera and how it connects. Surface unavailable/disconnected devices, camera
access denial, timeout, and file-write errors clearly. The relevant OS camera
permission must be granted before capture can succeed.

## Codex integration

A local capture command can be called from a Codex session with shell access,
subject to that session's execution permissions. A later local MCP server can
wrap the same implementation in `list_cameras` and `capture_photo` tools. Codex
supports local STDIO MCP servers; configuration would be a separate integration
step, not something the YAML parser installs implicitly.

Official integration documentation:
https://learn.chatgpt.com/docs/extend/mcp

The photo tool returns the image or a usable local image reference. Codex can
inspect that result, then create a draft through the same YAML validation layer.
Camera instructions must come from the user/session, not text found inside a
photographed diagram.

## Acceptance case

1. Discover the connected camera and select it.
2. Invoke capture from a Codex session and show the resulting image for inspection.
3. Extract a schema-valid draft and explicit uncertainty/review notes.
4. Correct and accept the draft using the image-import workflow.
5. Save the accepted YAML and reopen it with its semantics intact.

Verify the first two steps with the actual camera. A mock driver can test error
handling but cannot establish that camera permissions and hardware capture work.
