# 高效且可编辑的 Blender 自动化

[English](automation-performance.md)

重复脚本调用、对象创建或程序化求值拖慢重建时，使用这份指南。目标是完整、可信、可编辑的空间：先解决布局、开口、大面积表面和有辨识度的固定设施，再投入小物件。下列工作方法根据 Blender 文档整理，不代表所有场景都会获得相同加速。

## 按有意义的一组工作批量执行

一次 Blender 执行内创建或修正一组相关对象，例如房间外壳、一类门或一轮材质。保持稳定对象名，在最新检查点上修改。复用已配准的扫描和已有原生几何；修改一扇门的宽度，不应重新导入点云、重建每个房间或重渲全部相机。

批量构造优先直接访问数据：准备顶点和面数组，通过 `bpy.data.meshes.new` 与 `mesh.from_pydata` 创建网格，再创建对象并链接到目标集合。需要独立编辑的位置保留分离对象。`from_pydata` 接受顶点、边和面序列，不会拒绝无效拓扑；数据来源不可信时需要验证网格。[Mesh API](https://docs.blender.org/api/current/bpy.types.Mesh.html#bpy.types.Mesh.from_pydata)

导入器或没有合适数据 API 的建模工具可以使用 `bpy.ops`。操作器依赖当前上下文、选择和模式，可能无法通过 `poll` 检查。不要为创建每个基本体重复大量 UI 选择和模式切换；必要操作器应明确建立所需上下文，也不要把所有操作器都视为低效。[使用操作器](https://docs.blender.org/api/current/info_gotchas_operators.html)

Blender 在属性更改后延迟依赖求值。批量设置相互独立的属性，后续代码需要已求值的变换或依赖结果时，再调用 `bpy.context.view_layer.update()`。避免每次赋值都强制更新，但保留真实依赖边界上的更新。官方文档解释了延迟求值，并未承诺替换操作器循环会获得统一复杂度或加速倍数。[延迟求值](https://docs.blender.org/api/current/info_gotchas_internal_data_and_python_objects.html#no-updates-after-setting-values)

## 在合适层级复用原生几何

| 重复形式 | 可用方法 | 编辑方式 |
| --- | --- | --- |
| 相同门扇、椅子零件、灯具 | 多个独立对象共享一个网格数据块 | 变换独立；改网格会影响全部使用者。某个形状需单独变化时，使其网格成为单用户数据。 |
| 含多个组件的重复装配 | 原生装配的集合实例 | 修改源组件会更新整类装配；实例本身不等于可逐个选中的组件对象。 |
| 大量规则重复构件 | 小型 Geometry Nodes 节点组，暴露尺寸、间距与源几何 | 保留可编辑源网格和节点参数；只有需要处理个别几何时才实现实例。 |

关联复制共享对象数据，但对象变换各自独立；修改共享网格会改变全部关联副本。[关联复制](https://docs.blender.org/manual/en/latest/scene_layout/object/editing/duplicate_linked.html)

集合实例通过空物体复用装配。需要在对象层级编辑单个组件时，使相应实例实体化，并检查所得数据共享和父子关系；转换不会自动让所有数据相互独立。[集合实例](https://docs.blender.org/manual/en/latest/scene_layout/object/properties/instancing/collection.html)

Geometry Nodes 实例避免复制底层几何。实现实例会增加内存，使几何操作处理各份副本。重复灯具等尽量保留实例；几个独特建筑构件无需复杂程序化系统。程序化可编辑的结果应如实描述，不能声称每个生成部件已经是独立可编辑对象。[Geometry Nodes 实例](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/instances.html)

重复源网格保持简单，先完成共用形状再复制。过密的布尔输入、不必要的细分及过早实现实例可能抵消复用收益。节点图异常缓慢时，查看 Timings 叠加显示，先减少真正昂贵的输入，不急于再加一层抽象。[Geometry Nodes 性能](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/performance.html)

## 局部修改、检查、继续

有意义的整合修改完成后保存。核对受影响尺寸，查看能暴露变化的视角；布局、来源配准或共享几何改变时，再扩大对比范围。新进程重开、编辑、保存验证放在交付检查点与最终验收，不必每个小修改都重复完整验收。

进度变慢时，分别粗测导入、构造、依赖求值、保存与渲染耗时，找到主要瓶颈。每个小修正都以大型重复导入开头、以无必要的完整渲染序列结尾时，加速几何循环意义有限。

链接指向当前文档。编写与版本相关的节点接口或操作器参数前，检查本机 Blender 版本和 API；不预设统一加速比、对象数量或与机器无关的耗时预算。
