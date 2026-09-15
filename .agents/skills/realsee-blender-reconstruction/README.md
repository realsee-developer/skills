# Realsee Blender Reconstruction

English | [简体中文](README.zh-CN.md)

A local agent workflow for rebuilding Realsee scan exports as an editable Blender space. It focuses on structure and connections first, then requested furniture, materials, and lighting. It is an instruction skill: the agent inspects your evidence and executes scene-specific Blender operations, rather than running a fixed reconstruction CLI.

The default is whole-space modeling with fast feedback: establish every requested area, improve major shapes and appearance, then refine useful details. Reuse components, patch saved scenes, and keep previews inexpensive. See the [fast workflow and source tutorials](references/fast-workflow.md) and [automation techniques](references/automation-performance.md).

## Use

Install from a local checkout of this repository:

```sh
npx skills add . --skill realsee-blender-reconstruction --agent codex
```

Open your modeling project in an agent that can read local files and run Blender. Place your exports in `data/`, preserving model/texture folders, then ask:

> Use $realsee-blender-reconstruction with the Realsee exports in data/. Rebuild the whole evidenced space as an editable native Blender scene. Prioritize walls, floors, ceilings, doors, windows, and area connections. Show an early whole-space preview; refine details that matter to the intended views and edits. Save output/reconstruction_native.blend, compare it with the source, and reopen a temporary copy to test real geometry and material edits.

For later work:

> Make a walkthrough through the connected rooms, preserve the camera animation, and deliver a playable video.

> Add physically based materials and collision/rigid-body behavior, then export and verify a USDZ copy.

## Requirements and scope

Blender installed locally, an agent with local file/command access, and source evidence such as a textured scan, point cloud, CAD, or panoramas. No Realsee API key or remote upload is needed for existing local exports. Extra parsers or encoders depend on the actual input formats and requested outputs. A panorama-only input without scale cannot support measured metric reconstruction.

The skill adapts to the selected project; it does not ship the original case's scans, models, textures, dimensions, credentials, or machine paths. It does not automatically run Argus, publish a website, or purchase generation jobs or upload asset references. Use the [workflow](SKILL.md) for execution details.

This workflow was distilled from the public [Realsee × Astra × Blender reference project](https://github.com/realsee-developer/realsee-astra-blender). Its modeling emphasis and verification methods apply to compatible local agents, without requiring a specific model name. This skill's new instructions follow the repository's [license](LICENSE); source-project code and third-party scene assets retain their own terms and are not bundled here.
