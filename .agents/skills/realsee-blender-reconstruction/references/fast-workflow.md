# Whole-space modeling with fast feedback

[简体中文](fast-workflow.zh-CN.md)

Use this as the default iteration path. Choose detail from the intended views, edits, and deliverables. The staged workflow below adapts artist practice and Blender documentation to scan reconstruction; it is a working recommendation, not a measured GPT-6 speed benchmark. Sources reviewed on 2026-09-15.

## Make the whole space useful before polishing parts

| Pass | Do now | Check before moving on |
| --- | --- | --- |
| Layout | Register the useful sources; build all requested areas, heights, walls, and real connections with simple native geometry. | Reference-disabled overview, plan, and a useful interior view per area. Catch missing rooms, wrong scale, mirrored layout, and blocked openings. |
| Recognizable space | Add major fixed elements, large furniture volumes, main finishes, and actual light locations. | Compare representative source views. Correct the largest shape, material, and lighting differences first. |
| Requested detail | Refine the elements that affect intended edits, close-ups, silhouettes, contact, or prominent reflections and shadows. | Confirm that the visible improvement or functional need justifies the work. |
| Delivery | Pack required resources and run representative saved-file editing checks. Produce requested final images or video. | Use [acceptance](acceptance.md); deliver when the requested result is met. |

Keep a short queue of the largest remaining defects. For example, “the corridor opening is blocked” outranks “the bottle label is blurry.” After a coherent batch, inspect the affected view and an overview, then choose the next defect. Return to an earlier pass if evidence reveals a structural error. Do not finish a shelf's contents while another requested space is missing.

CG Cookie's modeling principles emphasize primary form, reference proportions, large-to-small detail, and simple reusable geometry. Those principles support this ordering; they do not prescribe a scan-specific acceptance checklist. [Jonathan Lampel: 6 Principles of Great 3D Modeling](https://blog.cgcookie.com/posts/6-principles-of-great-3d-modeling/)

## Spend evidence and geometry where they resolve a decision

Index the bundle once. Choose a canonical scan, the most useful plan, and representative panorama views. Keep the original untouched and use lighter working copies where helpful. Open full-resolution cloud regions, duplicate exports, or RAW images to answer a specific question such as an ambiguous ceiling edge; do not process every file before showing the first whole-space result.

Use controllable solids and curves for architecture. Reuse meshes, materials, and assemblies for repetition, following the [automation guide](automation-performance.md). Make the required components independently editable; keep shared data only where editing the family together is intended. Do not build an elaborate procedural system for a few unique pieces.

Use geometry for openings, thickness, silhouette, and requested component edits. Fine grain, shallow plaster relief, and small scratches can use texture or bump detail: bump changes shading without adding geometry, while actual displacement needs additional geometry and memory. Inspect relief close enough to tell whether its silhouette matters. [Blender: Displacement](https://docs.blender.org/manual/en/latest/render/materials/components/displacement.html)

An existing material or furniture asset can save time when its shape, scale, and license fit the task. Poly Haven supplies CC0 models, textures, and HDRIs; use matching assets as ingredients, then adjust them against the captured scene. A generic asset is not evidence of a site's exact object. [Poly Haven license](https://polyhaven.com/license)

## Improve appearance before increasing render cost

Correct large material color, texture scale, roughness, and dominant illumination before tiny bevels or surface wear. Keep comparison cameras and color management stable so that each preview reveals the change. Place emitters at evidenced locations; an attractive unrelated HDRI is not a substitute for the room's actual lighting.

Use the cheapest preview that answers the current question:

- **Layout and geometry:** solid viewport or Workbench. Workbench is optimized for modeling previews and does not evaluate shader-node materials, so use another engine to judge those materials. [Blender: Workbench](https://docs.blender.org/manual/en/latest/render/workbench/index.html)
- **Materials and lighting:** a small render in the intended engine, with reduced samples and denoising where supported. EEVEE can help with interactive iteration if its result answers the question; validate render-sensitive effects in the delivery engine.
- **Final output:** raise resolution and quality after composition, materials, and major lighting are settled. Render requested views, rather than automatically producing a large camera catalog.

In Cycles, adaptive sampling stops spending samples on pixels that have reached the noise threshold; denoising can reduce the samples needed for a useful preview. Inspect fine texture and reflections before accepting a denoised final image. The render Time Limit excludes pre-render processing, so it is not a limit on total script duration. [Blender: Sampling](https://docs.blender.org/manual/en/latest/render/cycles/render_settings/sampling.html)

Use preview Simplify settings to cap subdivision and texture size while preserving the master scene's detail. Check the final settings before delivery. [Blender: Simplify](https://docs.blender.org/manual/en/latest/render/cycles/render_settings/simplify.html)

Persistent Data can help repeated Cycles renders and animation by retaining data in the same Blender process, at a memory cost. Repeated fresh Blender launches cannot reuse that process's render cache. Enable it when rendering is the actual bottleneck and memory permits. [Blender: Performance](https://docs.blender.org/manual/en/latest/render/cycles/render_settings/performance.html)

For a requested walkthrough, first inspect sparse camera poses and a cheap motion preview for wall crossings, clipping, speed, and turns. Time a few representative frames, estimate sequence cost, and tune quality before rendering the full video. Preserve the native camera animation. Verify GPU use with a real small render; it does not accelerate every modeling or file-loading step.

## Know when to stop

For each correction, name the defect, its evidence, and the expected improvement. If it neither affects the requested use nor improves a representative view, prioritize another issue. When repeated tweaks to an ambiguous small detail show no useful improvement, keep the supported approximation and continue. Do not fabricate exact hidden construction.

Run final reopening and editing checks on a candidate, then repeat only checks affected by subsequent changes. Full cloud-distance analysis or exhaustive component inspection belongs to an explicit engineering requirement or a diagnosed problem. Missing areas, broken openings, unloaded textures, and failed native editing remain delivery issues. A request for exhaustive detail overrides this default prioritization.

## Useful tutorial to follow

[Andrew Price: How to Make Interiors](https://www.blenderguru.com/posts/interior-architecture) provides an interior workflow outline covering construction, lighting, and materials. Use its sequencing ideas with the installed Blender's current tools. Its downloadable assets have separate noncommercial terms; they are not bundled with this skill.
