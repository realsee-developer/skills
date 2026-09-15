# Acceptance and reopening tests

[简体中文](acceptance.zh-CN.md)

## Match verification effort to the request

For an ordinary editable-space delivery, check key dimensions and connections, representative views of each area, resource loading, and representative saved-file geometry/material edits. Reuse comparisons already made during modeling. Run the final reopen/edit suite once per final candidate, not after every small tweak; rerun affected checks when relevant data changes.

Full-cloud distance statistics, exhaustive topology reports, every captured camera, and per-object photographic inspection are for explicit engineering/exhaustive requirements or a concrete unresolved error. Do not create them as default prerequisites. Small cosmetic uncertainty outside the requested detail level does not block a usable handoff; missing requested rooms/openings, broken textures, and failed editing still do. These are workflow choices, not claims that the omitted checks passed.

For a narrow edit to an existing scene, verify the changed data, saved persistence, visible result, and neighbors that should stay unchanged. Reuse earlier acceptance evidence; do not rerun unrelated geometry edit tests for a material-only patch. Without prior test records, state the verification scope rather than initiating a reconstruction-wide audit or claiming the whole scene passed.

## Compare the reconstruction, not its reference overlay

Disable the reference and obsolete checkpoints in the final render view. Check a plan showing spatial connections, useful elevations, neutral solid/wireframe views, and each requested area's interiors. Compare with source images at matched positions and directions; unregistered attractive views cannot establish alignment. Review ceilings, floors, openings, door backs, and corners as well as the obvious furniture.

Resolve coverage against actual object IDs. Report missing requested components, unresolved source gaps, and inferred completions distinctly. An overall object count is not a coverage test. Use user-specified tolerances; otherwise report observed differences at meaningful precision with source quality and measurement definitions. Never turn a modeling tolerance into a claim of survey accuracy.

When cloud-distance analysis is needed, identify registration, source region, sampling density/method, and which reconstructed surfaces were compared. Report robust statistics (for example median and a high percentile), rather than only a favorable mean. Distinguish missing observations and noise from genuine offsets. Do not remove conflicting points solely to improve results.

## Inspect the file after a fresh open

Save the intended deliverable, close it, and open that exact path in a new Blender process. Use the installed executable and capture errors; a successful script exit without inspecting the saved file is insufficient. A typical launch is:

```text
<discovered-blender> --background --factory-startup --python-exit-code 1 --python <project-check-script>
```

The project check script should open the explicit deliverable path with Blender's native API. Confirm the loaded path, reference visibility, collection hierarchy, editable data/modifiers, expected component IDs, materials, and the images actually used by those materials. Check external resources and packed images, including UDIM tiles or linked libraries if present. Render a small reference-disabled view from this fresh process. Missing images, unresolved linked assets, or plugin-only geometry must be fixed before claiming standalone delivery.

Inspect structural solids for visible holes/intersections and shading errors; use targeted geometry checks where topology, modifiers, exports, or requested fabrication/simulation make them relevant. Account for evaluated modifiers and legitimate open surfaces; do not apply one manifold rule to every object.

## Prove independent editing on a disposable copy

Choose subjects present in this scene, not hard-coded case-study names. Record baseline transforms, relevant mesh coordinates/modifier values, material assignments, and the state of neighbors that should remain unchanged. If no door or furniture is evidenced or in scope, mark that operation not applicable and choose another independently operable or material-bearing component where appropriate; do not invent one for the test.

1. From the reopened final scene, change a real wall segment or opening dimension through local geometry or an exposed native parameter. Verify the opening/geometry actually changes; object translation alone does not count.
2. Rotate an evidenced door around its hinge. Check that the hinge stays fixed, the frame stays fixed, and its attached parts follow the leaf.
3. If included, move a furniture item independently and change its assigned material. Check shared mesh/material datablocks: make a single-user copy where an independent edit requires it, and verify unrelated components did not change. A texture link may override a base-color default, so inspect the actual material result.
4. If the reconstructed deliverable includes a reused scan/generated mesh beyond the hidden reference, perform a local vertex/face edit on a representative object through Edit Mode or the native mesh API and verify it persists. Do not accept an object transform as proof of topology editability.
5. Save to a distinct test `.blend`, exit, and open it in another fresh process. Compare the saved state with the expected edits and unchanged neighbors, and capture useful before/after evidence.
6. Confirm the original deliverable remains in its intended unedited state, for example by comparing its file hash before and after the test. Keep test files separate from final outputs.

Report which operations ran and persisted, the subjects, observed changes, and any failures. A synthetic cube/wall environment test checks Blender execution only; it cannot replace these edits on the delivered reconstruction.

## Final handoff

Provide the final native scene, required resources or companion reference file, a few source comparisons, scripts actually executed, and short editing instructions: which collections contain structure/reference, how to change a wall/opening/material, and where animations or physics live if requested. Summarize coverage and dimensional/visual discrepancies without declaring unsupported perfection. If a required criterion remains unmet, call the deliverable incomplete and identify the next needed source or tool action.
