# 真实 Arial 字体策略

## 当前行为

- 原先标为“Arimo（Arial 兼容）”的无衬线默认选项改为 **Arial**，调用系统安装的真实 Arial。
- Arimo 仍保留为独立选项，名称明确说明它不是 Arial。旧的显式 Arimo 参数不改名、不冒充 Arial。
- 网页和 MCP 的四种图件默认都优先使用运行环境中真实的 Arial，包括末端样品名称、节点数字、分组文字、比例尺和固定图例。用户显式选择 Libre Baskerville、Source Serif 4、Arimo 或 Noto Sans SC 时仍保留该选择。
- MCP 的 `Arial`、`Arial, sans-serif`、`"Arial", sans-serif` 请求统一为 `Arial, "Noto Sans SC Variable", sans-serif`，不再映射到 Arimo。中文由 Noto Sans SC 提供字形，这不意味着中文字形属于 Arial。
- 系统字体通过 `FontFace` 的 `local("Arial")` 加载探测，不能用可能因替代字体而成功的 `document.fonts.check()` 代替验证。没有 Arial 时明确切换为 Arimo：字体菜单更新、工作台保留提示、按实际字宽重新排版，允许 SVG/PNG 和 MCP 正常输出。用户再次请求 Arial 时仍执行这套规则，不把 Arimo 冒充 Arial。
- 云树图例、Dating 时间轴、双树固定文字及测量使用同一字体决策；不会出现名称已换成 Arimo、但图例或测量仍指定 Arial 的混用。

## 导出和授权边界

系统 Arial 字体文件不会被复制到仓库、转换为 WOFF、提供下载或嵌入 SVG 的 Web 字体数据。开源字体子集照常嵌入。

- 有 Arial：SVG 保留真实 Arial 字体名称，接收方需要安装 Arial；`data-system-fonts="Arial"`、`data-all-fonts-embedded="false"`、`data-font-fallback="none"` 记录实际状态。
- 没有 Arial：SVG 指定并嵌入 Arimo 所需子集，`data-system-fonts=""`、`data-all-fonts-embedded="true"`、`data-font-fallback="Arial-to-Arimo"` 记录明确切换。
- PNG 固定本机的字体渲染外观，查看者不需要安装字体。
- MCP 报告在 `font_portability` 中记录 `system_font_families`、`system_fonts_ready`、`all_fonts_embedded` 和 `fallback`；发生切换时，警告与规范化参数也明确写出 Arimo。
- Linux 公网/MCP 主机没有 Arial 时使用内置 Arimo，不需要复制 Mac 或 Windows 的字体文件。本次没有改动公网服务器。

微软的字体 FAQ 区分“引用用户设备上已安装的字体”和“将系统字体作为 Web 字体重新托管／分发”，并说明文档嵌入需要符合相应权限。该说明覆盖 Windows 随附字体，其他来源（包括 macOS）的具体权利应以相应来源的许可为准。本项目采用系统引用，不分发 Arial 字体文件。

参考：[Microsoft Font redistribution FAQ](https://learn.microsoft.com/en-us/typography/fonts/font-faq)、[Google Fonts Arimo 项目说明](https://github.com/googlefonts/arimo)。
