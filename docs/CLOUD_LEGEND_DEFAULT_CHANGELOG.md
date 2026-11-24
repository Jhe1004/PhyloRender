# 云图图例默认放在左下（2026-11-02）

用户要求将云图的 “Pie chart key” 从上半部移到左下空白区域。
新图的 `options.cloud.pie_legend_position` 默认值由 `auto` 改为 `lower-left`。
唯一默认常量位于 figure-contract，桥接缺省读取共享契约；网页初始选项、能力说明与 schema 描述同步。

沿用现有 `lower-left` 布局：以画布约68%高度为上边缘目标，在左侧寻找完整图例的安全位置，
继续避让物种树枝、节点饼图、样品名和时间背景。密集或短图中允许按既有规则移动以容纳图例，
不以固定屏幕像素保证所有输入的图例位置相同。图例尺寸、文字和颜色不变。

旧配置显式保存的 `auto`、`upper-left`、`middle-left` 或 `lower-left` 继续原样导入导出。
这是显示默认值变更；不改变原始树、节点时间、云层、冲突统计、分母或科学缓存键，
位置切换不得启动 treePL 或冲突统计。没有迁移或覆盖旧 revision。

直接测试覆盖共享默认与旧配置往返；真实浏览器回归
`mcp-server/tests/cloud-legend-default.mjs` 检查空白网页默认、实际导入、左下成图、
无位置参数的 MCP 默认、完整 SVG 同源比较（只忽略构建 metadata）、实际 SVG／PNG、
旧自动位置恢复及树枝／节点饼图／年龄／统计不变。该用例纳入完整 integration 门禁。
