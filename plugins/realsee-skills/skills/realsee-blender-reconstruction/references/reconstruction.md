# Source registration and native modeling

[简体中文](reconstruction.zh-CN.md)

## Inspect the actual bundle

Start with a brief index of substantive inputs: relative path, format, purpose/area, inspected state, and duplicates. Choose one canonical export for each useful role; inspect other copies when they answer a specific question. A file may be used for comparison rather than import. Read archive listings before choosing what to extract, retain their original contents, and do not execute bundled scripts as data. Report unreadable formats instead of silently skipping them; use a supported conversion or the verified equivalent export when available.

| Evidence | Useful contribution | Common trap |
| --- | --- | --- |
| CAD / DXF / DWG / plans | Dimensions, openings, layout, local ceiling notes | Block definitions and legends are not placed fixtures; a raster plan may use different units. |
| E57 / PLY / depth and poses | Surface positions, floor/ceiling levels, camera registration | Coordinate conventions and image/scan associations must be verified; missing points are not necessarily openings. |
| OBJ / FBX / glTF / GLB | Overall shape, captured surface appearance | GLB can reference external textures; duplicate exports can overlap; scanned topology is not native structural modeling. |
| Panoramas / cube faces / RAW | Finishes, light locations, hidden corners, fine details | Equirectangular distortion bends straight lines; lighting is embedded in photographed base color. |
| Video / orthographic images | Area connections, orientation, cross-checks | A viewpoint label or panorama index does not establish its physical location. |

Do not require every format in the table. Use the available evidence and explain what it can establish. RGB panoramas alone without reliable scale cannot establish measured metric dimensions. Existing Argus results can be used as additional cloud/depth/pose evidence after inspecting their manifest and coordinate contract; do not implicitly submit a new remote Argus job.

## Register before detailing

- Normalize scene units to meters. Read source units and annotation definitions; distinguish clear height, slab height, wall-to-wall distance, and overall extents.
- Establish source-to-scene transforms once, document them, and apply the same frame to geometry, cameras, and comparison measurements. Check at least several spatially distributed correspondences and their residuals. Include a vertical feature and an asymmetric layout cue to catch a mirrored or inverted alignment.
- Validate floor datum, vertical axis, rotation, scale, and handedness against the visible site. A format extension alone does not establish the correctness of an exporter-specific transform. Never mirror the scene simply to make one camera match.
- Associate external photos with scan images by metadata and image content. Check camera-to-world versus world-to-camera conventions and quaternion order against recognizable features. Use rectified panorama views or verified cube faces for geometry judgment.
- Inspect CAD entity placement and layer/block semantics. Use local ceiling measurements per area. When sources conflict, document the affected measurements and adopted evidence; do not scale the whole space to an unrelated bounding box or area annotation.

Keep coverage separate from object counts. One semantic wall may need several mesh segments, and many scan vertices may belong to one unmodeled door. Use stable feature IDs mapped to native objects and specific photos, drawings, or cloud regions. Label occluded completion as inferred and source gaps as unresolved.

## Build an editable spatial model

Organize collections by floor/area and meaningful category; select names that users can recognize. Keep shared boundaries aligned and model real openings and thickness. Door leaves, frames, handles, and hinges should move according to their intended relationship. Split independent finishes where editing one material should not recolor unrelated areas.

Use simple controllable solids and curves where suitable, retaining Boolean/Solidify/Bevel/Array or native node parameters only where they aid real edits. Inspect visible results of modifiers as well as base meshes. Use targeted manifold checks on structural solids when a defect, modifier, export, or physical use calls for them; do not apply them indiscriminately to every object, fabrics, foliage, or deliberately open surfaces. Resolve negative scales, normals, duplicate surfaces, gaps, and intersections according to the component's purpose.

Reusable scanned or generated shapes can supply complex furniture, but separate important components, repair topology, and demonstrate local geometry edits. An imported object being selectable does not prove that it supports the requested editing. Do not join the master scene merely to reduce draw calls.

## Reproduce appearance

Inspect wall/floor/ceiling materials across more than one photograph, separating actual pigment and roughness from cast shadows and exposure where practical. Place UVs at plausible physical texture scale. Use image textures for genuinely flat artwork and labels while retaining geometry for frames and supports. Inspect sRGB versus linear data roles, roughness, normals, transparency, and texture packing in the actual node graph.

Model light fixtures separately from their light emitters. Match emitter location, shape, direction, and relative intensity before changing exposure. Emissive-looking textures alone may not light the room. Compare source and render with consistent camera framing and color management; arbitrary exposure changes can hide material errors.

Follow the [fast preview workflow](fast-workflow.md): start with inexpensive solid views and previews, then render enough detail to decide the next correction. For GPU rendering, detect available devices/backend and test a small render with that device; do not assume a device is active merely because a setting was written. Do not hard-code a CUDA/Metal backend or claim every modeling operation becomes GPU-accelerated.
