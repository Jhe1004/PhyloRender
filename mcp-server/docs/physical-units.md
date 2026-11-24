# 绘图单位与印刷导出契约

四个画树板块共用整张图宽 **1000 绘图单位（u）** 的标准。双树以左右两棵树合起来的整张图为基准。1 u 是整图宽度的 1/1000；半径 3 u 的圆点直径为整图宽度的 6/1000。

字号、线宽、圆点、饼图、HPD 粗细、手动位移和名称片段字号使用同一尺度。网页直接显示绘图单位，MCP 与配置导出使用 `*_u` 字段；精确默认值从 `figure-contract.defaults(workspace)` 读取，不复制另一套常数。

| 参数 | 默认或含义 |
| --- | --- |
| `typography.tips.size_u` | 普通树／双树约 13.24 u，Dating／云树约 15.88 u |
| `typography.nodes.preferred_size_u` / `minimum_size_u` | 约 11.91 / 6.18 u；最小字号是硬下限 |
| `layout.branch_width_u` | 约 0.794 u |
| `layout.node_radius_u` | 约 3.309 u；普通、Dating、双树共享可见圆点与避让半径 |
| `layout.tip_spacing_u` | 手动样品中心间距；也可使用 `tip_spacing_em` |
| `cloud.pie_radius_u` | 云树饼图半径 |
| `time.hpd_thickness_u` | HPD 条粗细 |
| `time.period_size_u` / `epoch_size_u` / `axis_size_u` / `unit_size_u` | 地质年代与时间轴字号 |
| `typography.clades.size_u` / `scale.size_u` | 分组与比例尺字号 |
| `clades[].name_segments[].size_u` | 混合样式名称片段字号，缺省继承 |
| `label_adjustments[].dx_u` / `dy_u` / `font_reduction_u` | 节点标注相对真节点的位移、字号减量 |
| `output.width_mm` | 印刷宽度；0 取本板块最大值 |
| `output.dpi` | PNG 密度，默认 300；不参与排版 |

自动字形间距仍为默认。密集样品之间保留小量可见间隙，稀疏树保留适度呼吸空间；不得通过扩大样品行距解决节点标注避让。

## 宽度、比例与导出

普通树、Dating 和云树最大 400 mm，双树最大 800 mm。改变印刷毫米宽度只按比例放大或缩小完成的整图，字体、线条和圆点一同缩放，内部坐标与排版不变。例如 10 u 在 180 mm 图中为 1.8 mm，在 360 mm 图中为 3.6 mm。

整图始终宽 1000 u。横向拉伸只改变树枝跨度，保留整图单位基准；超过可用树体宽度时受上限约束。`content` 使用自然内容高度；`auto` 启用自动间距时，普通树、Dating和云图以高/宽=1.25为目标增加实际行距，稀疏扩展有上限，多样品保持紧凑，双树保留横向偏好。手动行距和明确比例优先。显式宽高比不足以容纳内容时以完整可读内容为先；需要更高的画布时补足高度，不能压缩样品行距或裁图以强行匹配比例。报告保留请求比例与实际比例。规则唯一归figure-contract，详见docs/AUTOMATIC_PORTRAIT_LAYOUT_CHANGELOG.md。

SVG 的 `viewBox` 宽为 1000，毫米宽高表示印刷尺寸。当前渲染器内部保留固定参考设计坐标，导出时通过一个共享投影组变换到绘图单位；内部坐标不依赖印刷毫米或 DPI。`report.canvas` 记录内部设计几何，`report.output.drawing_width/drawing_height` 记录公开绘图单位，后者宽度固定 1000。不得将二者混用。旧版内部 `tree_width_unit` 仅为兼容诊断。

PNG 宽度约为 `width_mm / 25.4 * dpi`，高度依图形比例计算，并写入 `pHYs` 密度。安全像素上限可能降低实际 DPI，报告明确提供 `requested_dpi` 与 `effective_dpi`。`tip_size_pt` 等报告字段仅为在当前毫米图幅上的派生物理诊断，会随图幅缩放，不是样式控制参数。

长普通树／Dating 树可显式导出上下两图；只拆一次，第二图保持完整单系分支。MCP 默认只产生 SVG，用户明确请求 PNG 时才栅格化。

## 旧配置兼容

旧 `*_pt` 与像素字段仍可输入，按固定参考设计换算为 u；规范配置只输出新字段。同一请求同时包含新旧尺寸时，`*_u` 优先。旧参数不再保证在任意印刷宽度上保持原先固定的物理 pt；这正是改为相对尺度的语义变化。旧 `png_scale` 仍以乘 96 转为 DPI。

```json
{
  "options": {
    "layout": { "automatic_tip_spacing": true, "branch_width_u": 0.8, "node_radius_u": 3.5 },
    "output": { "width_mm": 180, "dpi": 600 },
    "typography": { "tips": { "size_u": 14 }, "nodes": { "preferred_size_u": 12, "minimum_size_u": 7 } }
  }
}
```

转换唯一归属 `figure-units.js`。网页／MCP 同图对照、全部四板块跨印刷宽度、纵横拉伸、手动标注、旧配置、PNG 尺寸／密度、事务回滚和科学结果不变均纳入验证。

SVG导出在单位投影后固定根属性的序列化顺序，保留所有属性、命名空间和值，不改变任何尺寸、文字或图层。冲突统计的运行耗时只保留于MCP报告，SVG继续保留科学来源、参数及完整计数。
