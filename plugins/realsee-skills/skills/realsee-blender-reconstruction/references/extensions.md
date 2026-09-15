# Requested extensions

[简体中文](extensions.zh-CN.md)

These are optional outputs from the native scene, not automatic additions to every reconstruction.

## Image-and-text asset generation

Use this when requested or when an authorized available generator helps a difficult secondary object. Describe the object's real shape, distinct components, material zones, source viewpoints, measured or estimated dimensions, and desired editability. Crop/rectify reference views as needed, avoiding unrelated private content. Do not upload imagery or submit paid jobs without the user's applicable authorization. If generation is unavailable, report that and continue native modeling that is possible.

Generated geometry is a candidate, not evidence. Inspect multiple views and topology, correct silhouette and material differences, set real scale and orientation, separate useful components, and place it with the scene's registered transform. Test local mesh editing. A plausible replacement cannot establish exact correspondence, and generating individual props does not solve room layout or structural registration.

## Walkthrough

Use the completed scene and spatial connectivity to create a camera path through real openings. Keep the camera, path, and keyframes editable. Check eye height, speed, direction changes, near clipping, and collisions with walls/furniture along the route. Preview route poses and low-resolution frames before an expensive render. Preserve the native reconstruction while saving animation changes in the requested file or a separate walkthrough project.

Discover available render devices and encoder. Verify actual render output before a full sequence. Encode the rendered frames into the requested video format; inspect duration, resolution, frame rate, a few decoded frames, and actual playback. A camera path or frame directory alone is not a delivered video. Report audio only if a track exists.

## Physical materials and dynamics

Distinguish physically based appearance from simulation properties. When the user requests both, implement both. Set material roughness/metalness/transmission from visual evidence and light behavior; configure dynamics separately with sensible units, scale, mass, friction, restitution, and collision representation, labeling unmeasured assumptions.

Keep static architecture fixed; assign motion only to appropriate objects. Place constraints on real mechanical joints. Test contact, gravity, support, and hinge behavior in a disposable simulation copy. Collision geometry may be simplified, but it should preserve relevant contacts and openings. Do not enable gravity on the entire scene indiscriminately.

## USDZ and exchange files

Inspect the exporter available in the installed Blender and the receiving tool's capabilities. Verify what survives export: geometry, hierarchy, materials, textures, animation, and physical schemas are separate claims. Blender rigid-body settings do not by themselves prove that USD Physics is authored in an exported file. Where required, inspect or author the USD physics schema and test it in a supporting runtime.

Export from a copy, inspect the package contents and relative resource references, reopen/import in a fresh process, and compare scale, orientation, bounds, counts, and sampled appearance. Textured appearance requires supported image formats and material conversion. A successful export or a `.usdz` filename does not prove a complete usable package. Retain the `.blend` as the native editing master.

## Browser viewing and publication

Evaluate the actual asset size and viewer version before choosing direct USDZ loading. When a full package is too heavy or its textures/materials are unsupported, derive a lighter GLB from the approved source and clearly label it a web preview. Keep full native/exchange files available as requested. Cutaway ceilings, geometry reduction, mesh batching, or reduced texture sizes belong in the derivative, not the editable master.

With Three.js, inspect the chosen loader and texture-coordinate support. Joining meshes can produce high-numbered UV channels; remap each primitive's actually sampled channels together with material texture references and Draco attribute semantics, preserving coordinate values. Do not blindly force all textures to UV0. Test real rendering and console errors, orbit/zoom, reset/plan views, and mobile layout. For video, verify actual playback, MIME type, and range responses on the published host.

Publication is a separate user-authorized action. Audit only the selected public copies for private identifiers, paths, QR codes, textures, and scan-reference contents; preserve the originals locally. Distinguish code licenses from scene/material rights. Keep source data, credentials, intermediate files, and render sequences out of the public package. Git LFS can carry reviewed large deliverables; verify remote availability instead of mistaking pointer files for uploaded media.
