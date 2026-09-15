# Fast, editable Blender automation

[简体中文](automation-performance.zh-CN.md)

Use this when repeated script calls, object creation, or procedural evaluation slow reconstruction. The aim is a convincing, editable whole space: resolve layout, openings, large surfaces, and distinctive fixed elements before spending effort on small props. The workflow choices below are recommendations derived from Blender's documented behavior, not universal speed guarantees.

## Batch meaningful work

Create or correct a coherent group of objects in one Blender execution: a room shell, a door family, or a material pass. Keep stable object names and edit the latest checkpoint. Reuse the registered scan and existing native geometry; a changed door width should not require importing the cloud, rebuilding every room, or rendering every camera again.

Prefer direct data access for bulk construction: prepare vertex/face arrays, create the mesh through `bpy.data.meshes.new` and `mesh.from_pydata`, create the object, and link it to the intended collection. Retain separate objects where users need independent edits. `from_pydata` accepts vertex, edge, and face sequences; it does not reject invalid topology, so validate mesh data when its source is not trusted. [Mesh API](https://docs.blender.org/api/current/bpy.types.Mesh.html#bpy.types.Mesh.from_pydata)

Use `bpy.ops` where the operation warrants it, such as an importer or a modeling tool without a suitable data API. Operators depend on active context, selection, and mode, and can fail their `poll` checks. Avoid replaying a long sequence of UI selections and mode switches to create every primitive. Establish the required context explicitly for necessary operators; do not treat every operator as inherently slow. [Using operators](https://docs.blender.org/api/current/info_gotchas_operators.html)

Blender defers dependency evaluation after property changes. Batch independent assignments, then call `bpy.context.view_layer.update()` when subsequent code needs evaluated transforms or dependent results. Avoid forcing updates after every assignment; preserve updates at real dependency boundaries. The documentation explains deferred evaluation, but does not promise a universal complexity or speedup for replacing operator loops. [Deferred evaluation](https://docs.blender.org/api/current/info_gotchas_internal_data_and_python_objects.html#no-updates-after-setting-values)

## Reuse native geometry at the right level

| Repetition | Practical choice | Editing contract |
| --- | --- | --- |
| Identical door leaves, chair parts, luminaires | Separate objects sharing a mesh data-block | Transforms remain independent; mesh edits affect all users. Make the mesh single-user for an exceptional shape. |
| Repeated assemblies with several components | Collection instances of one native assembly | Edit source components to update the family. An instance is not a set of individually selectable component objects. |
| Many regular repeated elements | A small Geometry Nodes setup with exposed dimensions, spacing, and source geometry | Keep the source mesh and node controls editable; realize only when individual geometry processing is needed. |

Linked duplicates share object data while retaining separate object transforms; changing their shared mesh changes every linked copy. [Linked duplicates](https://docs.blender.org/manual/en/latest/scene_layout/object/editing/duplicate_linked.html)

Collection instances reuse an assembly through an empty. If individual components need object-level editing, make the relevant instance real and inspect the resulting data sharing and parenting; conversion does not automatically make everything independent. [Collection instances](https://docs.blender.org/manual/en/latest/scene_layout/object/properties/instancing/collection.html)

Geometry Nodes instances avoid copying the underlying geometry. Realizing increases memory use and makes geometry operations process individual copies. Preserve instancing for repeated fixtures; avoid a complex procedural system for a few unique architectural pieces. A procedurally editable result should be described as such, rather than claiming that every generated part is already a separate editable object. [Geometry Nodes instances](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/instances.html)

Keep repeated source meshes simple and apply shared shape work before replication. Dense Boolean inputs, unnecessary subdivisions, and early realization can erase the benefit of instancing. If a node graph is unexpectedly slow, inspect the Timings overlay and reduce the actual expensive input before adding another abstraction. [Geometry Nodes performance](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/performance.html)

## Patch, inspect, continue

Save after meaningful integrated changes. Check affected dimensions and inspect the views that can reveal the change; use a broader visual comparison when layout, source registration, or shared geometry changes. Reserve fresh-process reopen/edit/save verification for deliverable checkpoints and final acceptance, rather than repeating the full acceptance exercise for each minor patch.

When progress slows, time import, construction, dependency evaluation, saving, and rendering separately enough to identify the bottleneck. Optimize the dominant cost. A faster geometry loop is irrelevant if every small correction starts with the same large import and ends with an unnecessary full render sequence.

These links track current documentation. Check the installed Blender version and its API before scripting version-sensitive node interfaces or operator arguments; no blanket performance ratio, required object count, or machine-independent time budget is implied.
