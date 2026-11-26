# PhyloRender 完整使用说明书与全参数对照手册

[← 返回仓库首页](../README.zh-CN.md) · [English](USER_MANUAL.md) | **简体中文** · [快速功能导览](USER_GUIDE.zh-CN.md) · [核心算法与架构说明](ALGORITHMS_AND_ARCHITECTURE.zh-CN.md)

本使用说明书面向实际制图的科研人员与 AI 助手使用者，完整说明如何在 **PhyloRender** 中制作出版级系统发育图件、全部四个工作区各自包含哪些可调节参数，以及每一项调节在交互式 **Web 工作台**、**MCP 服务**和配套 **Agent Skill**（`phylorender-mcp`）自然语言指令中的精确对应关系。底层数学公式与系统一致性架构原理另见 [ALGORITHMS_AND_ARCHITECTURE.zh-CN.md](ALGORITHMS_AND_ARCHITECTURE.zh-CN.md)。

---

## 1. 快速上手总览：视图选型、三端协同与画幅单位说明

### 根据科学问题选择对应的工作区视图
PhyloRender 在网页工作台顶部导航栏提供四个专属工作区（对应 MCP 图件配置中的顶层 `workspace` 字段）。每个工作区仅开放符合该类图件生物学含义的可调节项，并主动屏蔽容易引发数据误改的不适用选项（表 1）。

**表 1.** PhyloRender 四个工作区视图的适用场景、输入文件要求、定根策略与数据保护屏蔽项总览。

| 工作区视图（`workspace`） | 典型演化研究场景 | 必需与可选输入文件 | 定根策略 | 物理画幅上限与导出格式 | 主动屏蔽的控件（科学数据保护） |
| --- | --- | --- | --- | --- | --- |
| **Phylogram**（`"phylogeny"`，普通系统发育树） | 标准 ML、贝叶斯或溯祖树；跨方法支持率自动合并（如 ML 自展值配对 ASTRAL 后验概率，Zhang et al., 2018）。 | 1 棵主树（`main_tree`，Newick/Nexus，最高 1,500 个末端）；可选附加最多 20 棵支持率树（`support_trees`）和 20 棵其他节点指标树（`other_data_trees`）。 | 按用户指定外群重定根（`rooting.outgroup`）；未指定时若含唯一 `Euptelea pleiosperma` 则自动以其定根，传 `outgroup: null` 强制保留原根。 | 最高 `400 mm`；支持 `SVG`、`PNG`、双面板 `Panels`、`.json` 配置。 | 隐藏时间轴、HPD 误差条、基因树云层及双树连线控件。 |
| **Time Tree**（`"time"`，分化时间树） | 展示分化年龄、95% HPD 置信区间条与 ICS 官方地质年代色带（Cohen et al., 2013）的化石校准时间树。 | 1 棵已定年汇总时间树（`main_tree`，如 BEAST MCC、StarBEAST3 或 MCMCtree 输出，最高 1,500 个末端）；可选附加 `other_data_trees`。 | 严格保留输入树根与原分化年龄，禁止重定根。 | 最高 `400 mm`；支持 `SVG`、`PNG`、双面板 `Panels`、`.json` 配置。 | 屏蔽外群重定根、节点支持率数字、支持率圆点、满支持粗枝及 `support_trees`，确保节点数值与误差条纯粹表达年代信息。 |
| **Tanglegram**（`"conflict"`，双树对照图） | 双树并排拓扑冲突比较（如核基因树对比质体/线粒体树，或 ML 树对比溯祖树）。 | 1 棵左侧主树（`main_tree`）+ 1 棵右侧对照树（`comparison_tree`，最高 1,500 个末端）；可选样品分组配色（`sample_groups`）。 | 网页端保留两侧原根并旋转右树解缠绕；MCP 同时支持传入 `rooting.outgroup` 将左右双树按同一外群侧同步重定根。 | 最高 `800 mm`（双倍宽）；支持 `SVG`、`PNG`、`.json` 配置。 | 屏蔽横向树枝拉伸、右侧分类群括号竖线及双面板拆分（MCP 中传入 `clades[]` 会自动转为样品组着色但不画括号）。 |
| **Cloudogram & Discordance**（`"cloud"`，云图与冲突饼图） | 已定年物种树叠绘多位点 ML 基因树云层，并标注两分类或四分类冲突饼图（依据 Smith et al., 2015）。 | 1 棵物种树（`main_tree`）+ 1 个多树基因树文件（`gene_trees`，最高 20,000 棵；完整物种集最高 30,000 叠加节点由内置 L-BFGS 对齐器按 Sanderson, 2002；Smith & O'Meara, 2012 缩放对齐）。 | 保留物种树原根；基因树按物种树外群分支定根（`phyparts_outgroups`）或保留输入根（`"input"`）。 | 最高 `400 mm`；支持 `SVG`、`PNG`、`.json` 配置及节点冲突统计 TSV 表。 | 屏蔽物种树重定根、数字支持率字符串及双面板拆分（横向拉伸在网页端隐藏，MCP 端仍支持调节）。 |

### 网页工作台、MCP 服务与 Agent Skill 三端如何协同
在**网页工作台（Web Workbench）**中，控件归纳为左侧最多七个导航页签（**Data** 数据、**Layout** 布局、**Tip Labels** 末端标签、**Annotations** 节点标注、仅在时间树与云图显示的 **Time Scale** 地质时间轴、双树外显示的 **Clades** 分类群括号，以及 **Export** 导出）。所有有界数值参数均统一采用无滑块的紧凑 **`− / 数字输入 / ＋` 步进框**，配合工作台最底部的 **Optimize Node Label Placement**（自动优化节点标注位置）按钮及画布直接交互（点击树枝建分类群、双击末端名改显示标签、拖动单个节点标签、在普通树右键点击树枝重定根，或在双树左树节点右键翻转姐妹分支）。在 **MCP 服务**中，AI 助手通过 15 个结构化工具（`create_figure`、`edit_figure`、`export_figure` 等）读写完全相同的图件状态。启用配套 **Agent Skill** 后，用户用日常自然语言描述需求（例如：*“以 Dipteronia 为外群定根，把 ASTRAL 后验概率合并到 ML 树上，再添加内层实线族括号和外层虚线亚科括号”*），AI 助手即可自动转化为受校验的 MCP 调用。

### 绘图单位（`u`）、物理尺寸（`mm`）与分辨率（`DPI`）的关系
PhyloRender 的全部四个工作区统一在标准总宽为 **`1,000` 绘图单位（`u`）** 的画布坐标系上排版，由内部 `1,511-px` 参考画布按精确比例 `1 px ≈ 0.6618 u` 线性缩放而成。规范字号、线宽与圆点半径统一保存在 `*_u` 字段中（同时向下兼容旧 `*_pt` 与像素字段，换算比例精确为 **`1 pt = 4000 / 4533 u ≈ 0.8824 u`**、`1 px ≈ 0.6618 u`）。物理印刷宽度（`options.output.width_mm`，`0` 代表采用工作区上限 `400 mm` 或双树 `800 mm`）和光栅像素密度（`options.output.dpi`，网页与 MCP 统一为 `72–1200 DPI`，默认 `300 DPI`）仅改变导出物理宽度或像素精细度：调高 DPI 会让导出的 PNG 在印刷时更锐利，绝不会把字号变小或改变引线几何排布。

---

## 2. 跨工作区通用可调节项指南（网页、MCP 与 Agent Skill 对照）

以下四张表格汇总了跨视图共享的树形几何、末端学名排版、多层分类括号及成图导出设置，逐项对照说明默认值与有效范围、网页工作台位置、精确的 MCP 字段与 `edit_figure` 操作（`op`），以及对 AI 助手的自然语言指令示例。

### 2.1 树形布局、纵横间距与线条粗细

**表 2a.** 通用树形排序、纵横向比例拉伸、线宽与比例尺文字的三端对照表。

| 可调节功能 | 默认行为与取值范围 | 网页工作台位置（Web Workbench） | MCP 配置字段 / `edit_figure` 操作 | Agent Skill 自然语言指令示例 |
| --- | --- | --- | --- | --- |
| **姐妹分支阶梯化排序** | `small-top`（可选 `file` 原文件顺序、`small-top` 小支在上、`large-top` 大支在上） | `Layout` $\rightarrow$ *Sister-Clade Ordering*（双树位于 *Primary Ordering & Tangle Minimization*） | `options.layout.ladderize` / `op: "set_options"` | *“改为较大姐妹分支排在上方”* 或 *“保留树文件原本的分支上下顺序”* |
| **竖版比例与行距自动平衡** | `true`（$\le 80$ 样品时自动舒展行距使高宽比趋近 `1.25`、上限 `min(3 em, 47.65 u)`；$\ge 120$ 样品平滑回到紧凑基线；双树不启用） | `Layout` $\rightarrow$ *Tree Span & Spacing*（`Auto-balance tip spacing & portrait aspect ratio`） | `options.layout.automatic_tip_spacing`（`true` / `false`） / `op: "set_options"` | *“保持默认的自动末端行距”* 或 *“关闭竖版行距自动舒展”* |
| **手动纵向末端行距** | 默认按字高自动适配（手动范围 `2.98–47.65 u` / 旧字段 `4.5–72 px`，或相对字号 `0.9–4.0 em`） | `Layout` $\rightarrow$ *Tree Span & Spacing*（`Vertical tip spacing · u` 步进框） | `options.layout.tip_spacing_u` 或 `tip_spacing_em` / `op: "set_options"` | *“把纵向末端行距调大到 1.6 em，让行与行之间更宽松”* |
| **横向树枝跨度拉伸** | `100%`（`25–400%`；网页端在 *Phylogram* 与 *Time Tree* 显示，MCP 在 *Cloudogram* 亦支持） | `Layout` $\rightarrow$ *Tree Span & Spacing*（`Horizontal branch span · %` 步进框） | `options.layout.horizontal_scale` / `op: "set_options"` | *“把树枝横向跨度拉伸到 140%，拉开密集的内部短枝”* |
| **树枝线条粗细** | `0.79 u`（`0.33–2.65 u`，对应 `0.5–4.0` 设计像素；网页端在普通树与时间树显示，MCP 四视图均可调） | `Layout` $\rightarrow$ *Branch Scaling & Stroke*（`Branch stroke width · u` 步进框） | `options.layout.branch_width_u` / `op: "set_options"` | *“将树枝线宽设为 1.0 绘图单位”* |
| **替换比例尺文字排版** | Arial、`11.91 u`（`4.63–15.88 u`）、`#26302b`、正体（用于 *Phylogram* 底部比例尺） | `Layout` $\rightarrow$ *Scale Bar Typography*（字体、颜色、`Font size · u`、粗体、斜体） | `options.typography.scale`（`family`, `size_u`, `color`, `bold`, `italic`） / `op: "set_options"` | *“把底部比例尺数字字号改为 10.5 单位并加粗”* |

### 2.2 末端样品名称、分类学斜体规范与显示改名

**表 2b.** 末端物种名排版、拉丁双名自动斜体与不改变底层身份的显示改名三端对照表。

| 可调节功能 | 默认行为与取值范围 | 网页工作台位置（Web Workbench） | MCP 配置字段 / `edit_figure` 操作 | Agent Skill 自然语言指令示例 |
| --- | --- | --- | --- | --- |
| **末端名称字体** | `Arial`（内置五套出版字体：`Arial`、`Libre Baskerville`、`Source Serif 4`、`Arimo`、`Noto Sans SC`） | `Tip Labels` $\rightarrow$ *Tip Font & Color*（`Font family`） | `options.typography.tips.family` / `op: "set_options"` | *“把所有末端物种名换成 Source Serif 4 衬线字体”* |
| **末端名称字号与粗体** | *Phylogram*/*Tanglegram* 默认 `13.24 u`，*Time Tree*/*Cloudogram* 默认 `15.88 u`（`5.29–19.85 u`）；默认不加粗 | `Tip Labels` $\rightarrow$ *Tip Font & Color*（`Font size · u` 步进框、`Bold` 复选框） | `options.typography.tips.size_u`, `bold` / `op: "set_options"` | *“把末端物种名字号调为 14 单位并设为粗体”* |
| **末端文字颜色与继承分支色** | `#17211b`（*Cloudogram* 默认 `#202a30`）；`follow_clade_color: true` | `Tip Labels` $\rightarrow$ *Tip Font & Color*（`Text color`、`Match assigned clade color`） | `options.typography.tips.color`, `follow_clade_color` / `op: "set_options"` | *“让末端物种名统一保持深黑色，不要跟随分支括号变色”* |
| **拉丁双名/三名自动斜体** | `auto`（自动斜体化拉丁属名与各级加词，凭证号保持正体；另可选 `all` 全斜体、`none` 全正体） | `Tip Labels` $\rightarrow$ *Taxonomic Nomenclature*（`Italicization rule`） | `options.typography.tips.italic_mode`（`"auto"`, `"all"`, `"none"`） / `op: "set_options"` | *“按命名法规自动将拉丁物种学名设为斜体，同时保留标本凭证号正体”* |
| **种下分类阶元缩写标准化** | `true`（自动将 `SSP`/`subspecies` 规范为正体 `subsp.`，`VAR`/`variety` 规范为 `var.`，`forma` 规范为 `f.`） | `Tip Labels` $\rightarrow$ *Taxonomic Nomenclature*（`Standardize infraspecific rank abbreviations`） | `options.typography.tips.normalize_ranks`（`true` / `false`） / `op: "set_options"` | *“自动将亚种和变种等级缩写标准化为正体 subsp. 和 var.”* |
| **自定义显示名称（单条或批量映射）** | 默认显示原名；最多 5,000 条覆盖映射仅改画面文字，外群、分支匹配与分组仍锚定原始标识符 | 直接在画布双击任一末端名称，或 `Tip Labels` $\rightarrow$ *Rename Tip Labels*（`Upload Mapping Table` 上传 CSV/TSV/TXT/`.xlsx`） | `tip_label_overrides`（`{原始名: 显示名}`） / `op: "set_tip_label"`, `"remove_tip_label"`, `"merge_tip_labels"`, `"replace_tip_labels"`, `"clear_tip_labels"` | *“读取 `voucher_map.csv` 批量替换为正式发表物种名，保留底层原始样品身份”* |
| **超长末端名称自动限宽** | 自动以全图末端自然字宽中位数的 `1.25×` 为上限横向微压超长名，不截断文字、不改字高 | 全部四个工作区自动生效 | 由共享图件契约自动执行 | 默认自动生效，无需手工干预。 |

### 2.3 分类群括号、多层嵌套阶元与谱系着色

**表 2c.** 基于 MRCA 语义的分类群分组、多层嵌套括号、组内分段混排与组名排版三端对照表（括号竖线用于 *Phylogram*、*Time Tree* 与 *Cloudogram*；*Tanglegram* 分组配色见 S2.3.3 节）。

| 可调节功能 | 默认行为与取值范围 | 网页工作台位置（Web Workbench） | MCP 配置字段 / `edit_figure` 操作 | Agent Skill 自然语言指令示例 |
| --- | --- | --- | --- | --- |
| **添加、修改或删除分类群分组** | 最多 200 组，由必填字段 `mrca_of` 定义（$\ge 2$ 个末端由 MRCA 锁定演化支；1 个末端高亮单支） | `Clades` $\rightarrow$ *Clade & Taxon Highlighting*（点 `Select Clade or Taxon` 后点选画布树枝；`Clear All` 全清） | `clades[]`（`mrca_of`, `name`, `color`, `clade_id?`） / `op: "add_clade"`, `"update_clade"`, `"remove_clade"`（全清可用 `update_figure` 传 `clades: []`） | *“用青绿色 `#2b6f6b` 标出由 Koelreuteria_paniculata 与 Litchi_chinensis 的 MRCA 定义的无患子亚科分支”* |
| **括号嵌套层级（如亚科内嵌各族）** | 省略或传 `null` 时按子集包含关系自动分层；可显式指定整数 `0–5`（`0` 为最内层） | 分组弹窗 $\rightarrow$ `Bracket tier`（`Automatic` 或 `Inner tier 1` 至 `Outer tier 6`） | `clades[].tier`（`0–5` 或 `null`/省略） / `op: "add_clade"`, `"update_clade"` | *“把所有族放在内层 tier 0，所有亚科（含单型文冠果亚科）放在外层 tier 1”* |
| **括号线型样式** | `auto`（`tier 0` 实线、`tier 1` 等距虚线、`tier >= 2` 点划线），或指定 `solid`、`dashed`、`dash-dot` | 分组弹窗 $\rightarrow$ `Bracket line style` | `clades[].bar_style`（`"auto"`, `"solid"`, `"dashed"`, `"dash-dot"`） | *“内层族括号用实线，外层亚科括号用虚线”* |
| **分类群组名排布方向** | `auto`（单层普通树空间充足时横排；末端对齐树或含 $\ge 2$ 层嵌套时自动竖排）、`horizontal` 或 `vertical` | 分组弹窗 $\rightarrow$ `Label orientation` | `clades[].label_orientation`（`"auto"`, `"horizontal"`, `"vertical"`） | *“把所有族和亚科的括号名称统一设为竖排显示”* |
| **括号列水平对齐方式** | `auto`（单层普通有枝长树紧贴各组末端；含 $\ge 2$ 层或末端右对齐树排成严格共享竖列）、`nearby` 或 `aligned` | `Clades` $\rightarrow$ *Clade Bar Alignment*（`Bar alignment mode`） | `options.layout.clade_bar_alignment`（`"auto"`, `"nearby"`, `"aligned"`） / `op: "set_options"` | *“即使只有一层分类群括号，也在右侧排成上下严格对齐的一列”* |
| **组名字体与跟随字号** | Arial、粗体，`follow_tip_size: true`（默认始终比当前末端字号大 `3 u`；手动固定范围 `5.29–23.16 u`） | `Clades` $\rightarrow$ *Clade Label Typography*（勾选 `Automatic: 3 u larger than tip labels` 或 `Font size · u` 步进框） | `options.typography.clades`（`family`, `size_u`, `follow_tip_size`, `bold`, `italic`） / `op: "set_options"` | *“保持分类群组名字号自动比末端物种名大 3 个单位”* |
| **同一组名内分段正斜体混排** | 默认整组统一样式；支持最多 60 个独立片段（总长 $\le 120$ 字符，段字号 `5.29–19.85 u`） | 分组弹窗 $\rightarrow$ *Rich-text segment styling (optional)*（`Split by words` / `＋ Add segment`） | `clades[].name_segments[]`（`text`, `italic`, `bold`, `family`, `size_u`, `color`） | *“将该括号名称设为斜体 ‘Clematis’ 加正体 ‘sect.’ 再加斜体 ‘Atragene’”* |

### 2.4 成图导出格式、物理印刷尺寸、双面板拆分与全局重排

**表 2d.** 矢量/光栅导出、物理尺寸、高大树双面板分页、可移植 `.json` 配置及底部全局节点标签重排按钮对照表。

| 可调节功能 | 默认行为与取值范围 | 网页工作台位置（Web Workbench） | MCP 配置字段 / 工具调用 | Agent Skill 自然语言指令示例 |
| --- | --- | --- | --- | --- |
| **导出矢量 SVG 与高分辨率 PNG** | `SVG`（内置字体打包子集，系统 Arial 直接引用）；`PNG`（统一支持 `72–1200 DPI`，默认 `300 DPI`） | `Export` $\rightarrow$ *Export Formats*（`Export SVG`、`Export PNG`）及 *PNG Raster Resolution*（`DPI` 步进框） | 先通过 `op: "set_options"` 设 `options.output.dpi`，再调用 `export_figure`（`formats: ["svg", "png"]`） | *“把输出分辨率设为 600 DPI，并同时导出矢量 SVG 和高清 PNG”* |
| **高大树单系双面板自动拆分** | 对高大的 *Phylogram* 或 *Time Tree*（`>76` 个末端）在单系冠群处拆成两个等宽面板并延续外层括号 | `Export` $\rightarrow$ *Export Formats*（`Export Two-Panel Split`，下载 `.zip` 套件） | `export_figure`（`formats: ["panels"]`，或传 `["panels", "png"]` 同步生成面板 PNG） | *“把这棵 176 样品的大树按单系双面板拆分导出，方便双栏排版”* |
| **画布长宽比** | `auto`（可选 `auto`、`content` 紧贴内容、`1:1`、`4:3`、`3:2`、`16:9`、`a4-landscape`、`a4-portrait` 或 `custom` `0.40–3.00`） | `Export` $\rightarrow$ *Canvas Aspect Ratio*（`Output aspect ratio` 及自定义宽高比步进框） | `options.output.aspect_ratio`, `custom_ratio` / `op: "set_options"` | *“采用紧贴内容的紧凑画幅比例（content）”* |
| **物理印刷宽度（`mm`）** | `0` 代表采用工作区上限（单树 `0–400 mm`，双树 `0–800 mm`） | `Export` $\rightarrow$ *Print Dimensions*（`Print width (0 = max)` 步进框） | `options.output.width_mm` / `op: "set_options"` | *“将导出物理印刷宽度设为期刊通栏 180 mm”* |
| **可移植 JSON 图件规格导入导出** | 网页 `.json` 包含原树与全部设置；MCP `get_figure_spec` 默认脱敏原树并记录 SHA-256 散列 | `Export` $\rightarrow$ *Shared Web & AI Agent Specification*（`Export Figure Spec (.json)` / `Load Figure Spec (.json)`） | `get_figure_spec`（导出脱敏存档）；将本地树文本填入 `content` 字段即可供网页 `Load Figure Spec` 直接加载 | *“保存一份包含树文本的完整便携式 JSON 配置文件，我放到浏览器工作台里打开”* |
| **全局节点标注重新避让与字体重置** | 保持末端字号与行距不变，重新搜索全图内部节点的无碰撞槽位与引线；可一键恢复默认字体 | 工作台底部常驻按钮 `Optimize Node Label Placement`；`Export` $\rightarrow$ *Reset Typography*（`Restore Default Fonts & Colors`） | 每次 MCP 渲染自动执行；`op: "reset_label_adjustments"` 清除手工偏移 | *“清除个别手工偏移并重新自动优化全图节点标签位置”* |

---

## 3. 四大专属视图分项调节说明书

### 3.1 Phylogram 视图（`workspace: "phylogeny"`，普通系统发育树）
**Phylogram** 视图用于绘制最大似然树、贝叶斯一致树或溯祖物种树，并通过无根分支划分自动将多达 20 棵伴随分析树的支持率或节点指标合并到主树拓扑上（算法见补充方法 1 第 S1.1 节）。用户既可以在 `Layout` 页选择单个外群物种后点击 **Reroot by Selected Outgroup**，也可以直接在画布上右键点击多物种外群支的基部树枝完成单系外群定根。

**表 3a.** **Phylogram** 视图专属（或核心配置）可调节项三端对照表。

| 可调节功能 | 默认行为与取值范围 | 网页工作台位置（Web Workbench） | MCP 配置字段 / `edit_figure` 操作 | Agent Skill 自然语言指令示例 |
| --- | --- | --- | --- | --- |
| **外群重定根（单样品或多样品外群支）** | 在 `rooting.outgroup` 指定 $\ge 1$ 个原始末端 ID，或传 `null` 保留输入根（省略时若含唯一 `Euptelea pleiosperma` 则自动以其定根） | `Layout` $\rightarrow$ *Rooting & Outgroup*（选外群 + 点 `Reroot by Selected Outgroup`），或右键画布树枝 $\rightarrow$ `Reroot at this branch` | `rooting: { outgroup: [...] }` / `op: "set_rooting"`（`outgroup: [...]` 或 `null`） | *“以金钱槭属两个物种 `Dipteronia_sinensis` 和 `Dipteronia_dyeriana` 为外群重定根”* |
| **树枝长度表达模式** | `phylogram`（真实替换枝长）、`cladogram`（等深分支图）或 `aligned`（末端右对齐分支图） | `Layout` $\rightarrow$ *Branch Scaling & Stroke*（`Branch-length representation`） | `options.layout.mode`（`"phylogram"`, `"cladogram"`, `"aligned"`） / `op: "set_options"` | *“保持真实 ML 替换枝长（phylogram）”* 或 *“切换为末端对齐的分支图”* |
| **附加伴随支持率树（多方法支持率合并）** | 最多附加 20 棵伴随树，按无根划分自动配对；伴随树中不存在的冲突分支自动标为 `–` | `Data` $\rightarrow$ *Supplementary Node Data* $\rightarrow$ *Add Branch Support Trees*（`Add Support Trees` 及量纲选择框） | `support_trees[]`（`{ content, name?, source_id?, label?, field?, scale? }`） / `op: "add_support_tree"`, `"update_support_tree"`, `"remove_support_tree"` | *“附加 `astral.tre` 作为第二列支持率，量纲设为 0–1 后验概率”* |
| **附加其他节点指标树（年龄、速率等）** | 最多 20 棵指标树（在 *Time Tree* 同样可用）；提取选定字段参与防碰撞排布，不影响支持率样式 | `Data` $\rightarrow$ *Supplementary Node Data* $\rightarrow$ *Divergence ages, evolutionary rates & other metrics*（`Add Metric Trees`） | `other_data_trees[]`（`{ content, name?, source_id?, label?, field?, decimals? }`） / `op: "add_other_data_tree"`, `"update_other_data_tree"`, `"remove_other_data_tree"` | *“从 `rates.nexus` 提取节点演化速率字段 `field:rates` 并保留 3 位小数”* |
| **主树支持率量纲声明** | `auto`（支持 `auto`、`probability`、`percent` 及斜杠多列组合；含 `(0,1)` 小数歧义时强制要求显式声明） | `Data` $\rightarrow$ *Primary Tree*（`Primary tree support scale`） | `options.support.scale` / `op: "set_options"` | *“主树节点上是 SH-aLRT 百分数 / UFBoot 百分数双列复合支持率（`percent/percent`）”* |
| **支持率小数位数精度** | `auto`（百分数自动 `0` 位整数、概率自动 `2` 位小数；可选 `original` 原字符串或固定 `0–6` 位小数；与双树共用） | `Annotations` $\rightarrow$ *Support Decimal Precision*（`Auto by scale`、`As in file` 或 `0–6` 步进框） | `options.support.decimals`（`"auto"`, `"original"`, 或 `0–6`） / `op: "set_options"` | *“支持率按量纲自动保留精度：自展百分数取整，后验概率保留两位小数”* |
| **满支持分支表现形式** | `branch`（全列均满支持时树枝 `2.5×` 加粗且省去文字，非满支持节点标红点；另可选 `circle` 黑圆点、`number` 数字、`star` 星号、`hide` 隐藏） | `Annotations` $\rightarrow$ *Support Display Conventions*（`Full support representation`） | `options.support.full_support_marker`（`"branch"`, `"circle"`, `"number"`, `"hide"`, `"star"`） / `op: "set_options"` | *“两列均达 100/1.00 满支持的分支用加粗树枝表示，不再重复打印 100/1.00”* |
| **低支持率掩码阈值** | `50%`（整数 `0–100%`，按原始未舍入值逐列判断，低于阈值显示为 `–`；设为 `0` 关闭隐藏） | `Annotations` $\rightarrow$ *Support Display Conventions*（`Low-support masking cutoff · %` 步进框） | `options.support.low_support_threshold`（`0–100`） / `op: "set_options"` | *“把低于 70% 的单项支持率隐藏为短横线 `–`”* |
| **内部节点圆点半径** | `3.31 u`（`1.32–7.94 u`，与时间树和双树共用） | `Annotations` $\rightarrow$ *Node Markers*（`Node marker radius · u` 步进框） | `options.layout.node_radius_u` / `op: "set_options"` | *“将非满支持内部节点的圆点半径调小为 2.2 单位”* |
| **节点数字字体、首选字号与最小可读下限** | Arial、`#8c2e28`、`automatic_size: true`（`preferred_size_u` `5.96–21.18 u` 紧凑基线 `11.91 u`；防碰撞最小下限 `minimum_size_u` `5.96–11.91 u` 默认 `6.18 u`） | `Annotations` $\rightarrow$ *Node Label Font & Color* 与 *Node Label Size Bounds* | `options.typography.nodes`（`family`, `color`, `preferred_size_u`, `automatic_size`, `minimum_size_u`, `bold`, `italic`） / `op: "set_options"` | *“把节点支持率数字改为深灰蓝色 `#334155`，最小可读字号下限设为 7.0 单位”* |
| **自动槽位搜索、延长线与单节点微调** | 默认开启 `auto_placement: true` 与 `node_arrows: true`；支持在画布拖动标签或按 `branch_id` 微调 | 底部面板 `Placement options & rules` 复选框；在画布直接拖动任一节点标签 | `options.labels.auto_placement`, `options.labels.node_arrows` / `op: "set_options"`；微调操作 `"set_label_adjustment"`, `"remove_label_adjustment"`, `"reset_label_adjustments"` | *“开启拥挤短枝节点的延长线自动避让”* |

### 3.2 Time Tree 视图（`workspace: "time"`，化石校准分化时间树）
**Time Tree** 视图专门呈现化石校准汇总时间树（如 BEAST TreeAnnotator MCC 树、StarBEAST3 物种时间树、MCMCtree 或 `treePL` 定年结果）。在网页工作台 `Data` 页签的 **Import Time Tree** 主面板中，**步骤 1** 选择定年树文件后，主面板会自动保持展开进入**步骤 2**，引导用户确认树文件时间单位（`yr`、`kyr` 或 `Mya`）并选定全树统一的节点年龄统计量。末端年龄超出数值舍入容差的非超度量树（如异时采样树或采样祖先树）会被明确拒绝而绝不暗中抹零。重定根与全部支持率控件均被屏蔽，确保节点数值与误差条纯粹表达年代信息。

**表 3b.** **Time Tree** 视图专属可调节项三端对照表。

| 可调节功能 | 默认行为与取值范围 | 网页工作台位置（Web Workbench） | MCP 配置字段 / `edit_figure` 操作 | Agent Skill 自然语言指令示例 |
| --- | --- | --- | --- | --- |
| **源文件时间单位与坐标轴显示单位** | 默认为 `unconfirmed` 待确认（可选 `years`、`kyr`、`mya`）；坐标轴可保持一致（`same`）或在年/千年/百万年间换算 | `Data` $\rightarrow$ *Import Time Tree* $\rightarrow$ *Step 2 (Confirm Time Unit & Age Source)*（`Age unit in tree file`、`Axis display unit`） | `options.time.source_unit`, `display_unit` / `op: "set_options"` | *“这棵 StarBEAST3 时间树的单位是百万年（mya），坐标轴也按 Mya 显示”* |
| **全树统一节点年龄来源** | `auto`（可选 `branch_lengths` 超度量时间枝长、`height`、`height_mean` 后验均值、`height_median` 后验中位数；整树严禁混用） | `Data` $\rightarrow$ *Import Time Tree* $\rightarrow$ *Step 2*（`Node age source`） | `options.time.age_source` / `op: "set_options"` | *“统一使用后验平均年龄 `height_mean` 绘制节点位置与年龄数字”* |
| **节点分化年龄显隐与小数位数** | `show_node_ages: true`；默认保留 `2` 位小数（`0–3` 位可选） | `Annotations` $\rightarrow$ *Node Ages & HPD Credible Bars*（`Show divergence ages at internal nodes`、`Node age decimal places`） | `options.time.show_node_ages`, `age_decimals`（`0–3`） / `op: "set_options"` | *“显示内部节点分化年龄，统一保留 1 位小数”* |
| **节点年龄显示时间窗（高密度树过滤）** | `<160` 个内部节点默认全标；$\ge 160$ 个内部节点默认标注较老 `50%` 时间跨度（设 `age_minimum: 0` 强制全标） | `Annotations` $\rightarrow$ *Node Age Label Filter*（`Minimum age`、`Maximum age`、`Show All Node Ages`） | `options.time.age_minimum`, `age_maximum`（`null` 或 $\ge 0`） / `op: "set_options"` | *“只标注 15 至 100 Mya 之间的深部节点年龄数字，但保留全树所有节点的 HPD 误差条”* |
| **95% HPD 置信区间条开关与显示范围** | `show_hpd: true`；`hpd_scope: "all"`（显示全部带 HPD 节点，或选 `"named_clades"` 仅显示 `Clades` 页已命名冠群节点） | `Annotations` $\rightarrow$ *Node Ages & HPD Credible Bars*（`Show 95% HPD node bars`、`Nodes to display`） | `options.time.show_hpd`, `hpd_scope`（`"all"`, `"named_clades"`） / `op: "set_options"` | *“仅在已命名的各亚科和各族冠群节点上显示 95% HPD 误差条”* |
| **HPD 条内均值/中位数刻度及外观样式** | 条内刻度默认 `none`（可选 `height_mean`、`height_median`）；颜色 `#5f72a5`、透明度 `40%`（`10–100%` / `0.1–1.0`）、粗细 `4.63 u`（`1.32–10.59 u`） | `Annotations` $\rightarrow$ *Node Ages & HPD Credible Bars*（`In-bar summary tick`、`Bar color`、`Opacity · %`、`Bar thickness · u`） | `options.time.hpd_marker`, `hpd_color`, `hpd_opacity`, `hpd_thickness_u` / `op: "set_options"` | *“把 95% HPD 误差条设为灰蓝色 `#4c6a9c`、透明度 45%、粗细 4.0 单位”* |
| **ICS 官方地质年代表背景开关** | `standard`（确认时间单位后绘出官方 `0–4567 Ma` ICS 地层色带，窄格自动缩写缩字）或 `none`（纯白背景） | `Time Scale` $\rightarrow$ *Geologic Time Scale & Axis*（`Geologic time scale backdrop`） | `options.time.geology`（`"standard"`, `"none"`） / `op: "set_options"` | *“开启标准 ICS 地质年代色带背景与上下时间轴”* |
| **地质年代纪、世、刻度与单位独立字号** | 四项独立调节（`2.65–21.18 u` / `3–24 pt`）：纪 `14.56 u`、世 `12.57 u`、轴刻度数字 `13.90 u`、时间单位标题 `13.24 u` | `Time Scale` $\rightarrow$ *Geologic Time Scale & Axis*（纪、世、刻度数字、单位标题四个 `u` 步进框） | `options.time.period_size_u`, `epoch_size_u`, `axis_size_u`, `unit_size_u` / `op: "set_options"` | *“把时间轴刻度数字调大到 15 单位，地质纪名称调为 16 单位”* |

### 3.3 Tanglegram 视图（`workspace: "conflict"`，双树冲突对照图）
**Tanglegram** 视图将左侧参考主树与右侧对照树面对面并排放置，中间通过水平进出文字边缘的三次贝塞尔曲线连接共有样品，最高支持 `800 mm` 双倍宽画幅，左右两侧各自按自身枝长独立缩放。若两棵树样品总数相等但名称失配，程序优先提示核查源树拼写；当样品集合不同时，完整列出两侧独有样品并要求显式选择交集（`intersection`）或并集（`union`）。

**表 3c.** **Tanglegram** 视图专属可调节项三端对照表。

| 可调节功能 | 默认行为与取值范围 | 网页工作台位置（Web Workbench） | MCP 配置字段 / `edit_figure` 操作 | Agent Skill 自然语言指令示例 |
| --- | --- | --- | --- | --- |
| **左右双树导入、一键互换与双侧标题** | 左右标题默认为 `"Primary tree"` 与 `"Comparison tree"`（最长 `80` 字符），支持一键对调主副树 | `Data` $\rightarrow$ *Paired Input Trees*（选左树、选右树、`Swap Primary & Comparison Trees` 及标题输入框） | `main_tree`, `comparison_tree`（经 `create_figure` / `update_figure`）；`options.conflict.primary_title`, `secondary_title` / `op: "set_options"` | *“左侧放核基因树 `nuclear.tre`（标题 ‘Nuclear (353 loci)’），右侧放质体树 `plastome.tre`（标题 ‘Plastome’）”* |
| **样品不一致时的保留策略（交集 / 并集）** | 样品有差异时必选：`intersection`（裁剪至共有样品并累加单传节点枝长）或 `union`（保留全部样品，仅共有样品连线） | `Data` $\rightarrow$ *Taxon Set Reconciliation*（`Retain shared taxa only (intersection)` 或 `Retain all taxa from both trees (union)`） | `options.conflict.sample_policy`（`"intersection"`, `"union"`） / `op: "set_options"` | *“采用 intersection 交集策略，仅保留核树与质体树共有的 29 个样品”* |
| **左树阶梯化、单节点手工翻转与右树解缠绕** | 左树默认 `small-top` 并保持参考顺序不变；右树经后序中位数秩旋转自动最小化连线交叉 | `Layout` $\rightarrow$ *Primary Ordering & Tangle Minimization*（左树排序下拉框、`Re-optimize Connector Crossings`），或右键左树节点 $\rightarrow$ `Swap sister clades` | `options.layout.ladderize`, `options.layout.tip_order`（用于固定左树手工翻转后的顺序） / `op: "set_options"` | *“左树按小分支在上阶梯化排序，并自动旋转右树最小化连线交叉”* |
| **左右两侧独立支持率列与量纲选择** | 两侧分别默认 `auto`；斜杠复合支持率（如 `SH-aLRT/UFBoot`）可单独选 `field:0`、`field:1` 等或全列 `all` | `Annotations` $\rightarrow$ *Support Field Selection*（`Left Primary Tree` 与 `Right Comparison Tree` 卡片） | `options.conflict.primary_support_field`, `secondary_support_field`, `primary_support_scale`, `secondary_support_scale` / `op: "set_options"` | *“左右两棵树均只显示第二列 UFBoot 自展百分数（`field:1`）”* |
| **样品分组配色面板（`sample_groups`）** | 默认自动检测主树大支着色；显式分组使左树分支、右树末端与中间连线同步按组配色 | `Data` $\rightarrow$ *Clade Grouping & Palette*（上传 `sample, group, color` CSV/TSV 表；`Download Group Template CSV`） | `sample_groups[]`（`{ name, color, samples: [...] }`，最多 200 组） / `op: "set_sample_groups"`, `"clear_sample_groups"` | *“根据 `sapindaceae_tribes.csv` 分组表，让左右树谱系和中间连线按族同步配色”* |

### 3.4 Cloudogram & Discordance 视图（`workspace: "cloud"`，云图与基因树冲突饼图）
**Cloudogram & Discordance** 视图在同一物种树时间坐标系下融合三层独立可控的视觉图层：（1）物种树主干骨架，（2）经内置惩罚似然模块对齐至共有分支年龄、并按物种树 MRCA 分组配色的 ML 基因树云层，以及（3）由内置冲突统计模块计算的节点两分类或四分类冲突饼图，还可按需开启 ICS 地质时间轴。调整饼图分类模式、云层透明度、曲率抖动、分支配色或单独隐藏节点饼图时，程序直接基于缓存结果即时重绘，无需重新执行冲突统计或惩罚似然计算。

**表 3d.** **Cloudogram & Discordance** 视图专属可调节项三端对照表。

| 可调节功能 | 默认行为与取值范围 | 网页工作台位置（Web Workbench） | MCP 配置字段 / `edit_figure` 操作 | Agent Skill 自然语言指令示例 |
| --- | --- | --- | --- | --- |
| **物种树定年类型与根年龄设置** | `dated` 保留原定年物种树年龄（确认 `dated_age_source` 与 `dated_unit`）；未定年 `ml`（MCP 省略时默认）须设 `root_age > 0`（`root_age_unit` 默认 `"relative"`）；`coalescent`/`other` 仅绘饼图 | `Data` $\rightarrow$ *Species Tree & Gene Trees*（`Species tree input type`、根校准年龄与 `Age unit`，或节点年龄来源与时间单位） | `options.cloud.species_method`, `genes_method`, `root_age`, `root_age_unit`, `dated_age_source`, `dated_unit` / `op: "set_options"` | *“使用已定年的 StarBEAST3 物种树（单位 Mya，取 `height_mean`）配对 86 棵 ML 基因树绘制云图”* |
| **基因树外群定根列表与定根策略** | 默认 `outgroup` 策略：单物种外群留空 `[]` 可自动识别，多物种外群须列出物种树一侧根子支全部末端（选 `"input"` 保留已定根基因树） | `Data` $\rightarrow$ *Gene-Tree Discordance Analysis* $\rightarrow$ *Discordance options & node table*（外群文本框与定根策略） | `options.cloud.phyparts_outgroups[]`, `phyparts_root_policy`（`"outgroup"`, `"input"`） / `op: "set_options"` | *“用物种树外群分支 `Acer_truncatum` 和 `Dipteronia_sinensis` 为所有基因树自动定根”* |
| **基因树冲突支持率阈值与多列选择** | 默认 `0%`（`0–99.9%`，`0%` 不过滤，`>0%` 对原始支持率做严格 `>` 过滤）；多列默认取末列 `last`（可选 `first`） | `Data` $\rightarrow$ *Gene-Tree Discordance Analysis* $\rightarrow$ *Discordance options & node table*（阈值、多列与量纲选择） | `options.cloud.phyparts_threshold`, `phyparts_field`（`"last"`, `"first"`）, `phyparts_scale` / `op: "set_options"` | *“统计基因树一致与冲突比例时采用 50% 自展支持率过滤阈值”* |
| **导出或导入节点四分类冲突统计表** | 内置引擎自动计算完整四类计数；支持下载 TSV 统计表或传入预计算表 | `Data` $\rightarrow$ *Gene-Tree Discordance Analysis* $\rightarrow$ *Discordance options & node table*（下载或导入节点统计表按钮） | 顶层 `phyparts_table`（`{ content, name? }`）；`inspect_figure` 直接返回各节点四分类精确计数 | *“把文冠果分支节点的四分类基因树冲突具体棵数报给我”* |
| **基因树云层显隐、描边透明度与曲率抖动** | `show_gene: true`；描边透明度默认 `18%`（`2–60%`，基线随位点数自适应）；确定性中段抖动默认 `0%`（`0–100%`） | `Layout` $\rightarrow$ *Gene-Tree Cloudogram Layer*（云层开关、`Gene-tree stroke opacity · %`、`Cloudogram branch jitter · %`） | `options.cloud.show_gene`, `opacity`（`2–60`）, `jitter`（`0–100`） / `op: "set_options"` | *“把基因树云层透明度调为 14%，曲率抖动设为 25% 以展开重叠的平行基因枝”* |
| **物种树主干显隐与树形几何** | `show_species: true`；默认三角形主干 `triangular`（隐藏基因树云层后可切换为矩形树 `rectangular`） | `Layout` $\rightarrow$ *Species-Tree Overlay*（`Show species tree`、`Species-tree branch geometry`） | `options.cloud.show_species`, `species_shape`（`"triangular"`, `"rectangular"`） / `op: "set_options"` | *“隐藏底层基因树云层，把物种树切换为矩形分支树并保留冲突饼图”* |
| **节点冲突饼图模式（两分类 vs. 四分类）** | 默认 `two`（仅信息位点：一致 vs. 冲突）；可选 `four`（完整四分类：一致 / 主替代 / 其余替代 / 无信息） | `Annotations` $\rightarrow$ *Discordance Node Pies*（`Show node discordance pies`、`Pie composition`） | `options.cloud.show_pies`, `pie_mode`（`"two"`, `"four"`） / `op: "set_options"` | *“将节点冲突饼图切换为包含主替代与无信息基因树的四分类模式”* |
| **饼图最大半径、图例位置与图例缩放** | 最大半径默认 `21.18 u`（`5.29–35.74 u`，随节点年龄单调缩放）；图例默认左下角 `lower-left`（可选 `auto`、`upper-left`、`middle-left`）、缩放 `150%`（`75–200%`） | `Annotations` $\rightarrow$ *Discordance Node Pies*（`Maximum pie radius · u`、`Pie legend position`、`Pie legend scale · %`） | `options.cloud.pie_radius_u`, `pie_legend_position`, `pie_legend_scale` / `op: "set_options"` | *“把冲突饼图图例放在左下角、缩放 135%，饼图最大半径设为 18.5 单位”* |
| **饼图年龄时间窗与单独隐藏个别节点饼图** | 默认全显示；可按年龄区间过滤，也可点击画布饼图或按 MRCA 末端集（$\ge 2$ 末端）单独隐藏浅层饼图（不改变分母） | `Annotations` $\rightarrow$ *Discordance Pie Age Filter*（最小/最大年龄），或点击画布任一饼图 $\rightarrow$ `Hide pie chart` | `options.cloud.pie_age_minimum`, `pie_age_maximum`, `hidden_pies` / `op: "set_options"`, `"hide_cloud_pie"`, `"show_cloud_pie"`, `"reset_hidden_cloud_pies"` | *“隐藏分化年龄小于 5 Mya 的浅层近缘种对饼图，保持末端清晰”* |
| **在云图上下叠加 ICS 地质时间轴** | 默认关闭（`false`）；勾选后使用 `options.time.geology` 与四个 `*_size_u` 字号字段绘制上下 ICS 地层时间轴 | `Time Scale` $\rightarrow$ *Geologic Time Scale & Axis*（勾选 `Show time axis & geologic time scale on cloudogram`） | `options.cloud.show_time_axis`（`true` / `false`）配合 `options.time`（`geology`, `period_size_u`, `epoch_size_u`, `axis_size_u`, `unit_size_u`） / `op: "set_options"` | *“在云图下方和上方开启标准 ICS 地质年代表时间轴”* |

---

## 4. MCP 服务 15 个工具、24 种原子编辑操作与 Agent Skill 确认规则说明

### MCP 全部 15 个工具与 `edit_figure` 的 24 种原子编辑操作
连接至 PhyloRender 的 AI 助手通过表 4 所列的 15 个工具完成全部看树、画树、修图、回退与导出。在 `edit_figure` 中，调用方可一次提交多个语义编辑指令 `operations[]`，涵盖严格的 **24 种原子操作（`op`）**：通用参数更新 `set_options`（修改任意 `options.*` 嵌套字段）、定根设置 `set_rooting`、五种末端改名操作（`set_tip_label`、`remove_tip_label`、`merge_tip_labels`、`replace_tip_labels`、`clear_tip_labels`）、三种分类括号操作（`add_clade`、`update_clade`、`remove_clade`）、三种支持率树操作（`add_support_tree`、`update_support_tree`、`remove_support_tree`）、三种节点指标树操作（`add_other_data_tree`、`update_other_data_tree`、`remove_other_data_tree`）、三种单节点标签微调操作（`set_label_adjustment`、`remove_label_adjustment`、`reset_label_adjustments`）、两种双树样品分组操作（`set_sample_groups`、`clear_sample_groups`），以及三种云图饼图显隐操作（`hide_cloud_pie`、`show_cloud_pie`、`reset_hidden_cloud_pies`）。

**表 4.** PhyloRender MCP 服务全部 15 个工具的功能分类与精确输入输出速查表。

| 制图生命周期阶段 | 工具名称 | 功能用途与精确输入参数 | 返回结果 |
| --- | --- | --- | --- |
| **1. 渲染前树预检与样品核对** | `inspect_tree` | 渲染前解析树文本（`{ main_tree: { content, name? } }`；Skill 客户端在本地自动读取文件填入 `content`）。 | 原始末端名称列表、枝长特征、支持率范围、超度量与 HPD 诊断、高密度时间树标记（$\ge 160$ 内部节点）及拓扑指纹。 |
| | `compare_tree_samples` | 绘制双树对照图前比对双树原始末端集（`{ main_tree, comparison_tree }`）。 | 共有样品数、`primary_only` 与 `comparison_only` 独有样品列表、等数量失配标记及可用样品策略。 |
| **2. 同步创建与异步长任务管理** | `create_figure` | 校验输入并同步渲染新图件（`workspace`, `main_tree`, 可选伴随树, `options`, `clades`）。 | `figure_id`、`revision: 1`、指向 `figure.svg` 的 `resource_link` URI、归一化 `spec` 及版面质检 `report`（`topology_unchanged`, `remaining_collisions`）。 |
| | `start_figure_job` | 基于必填幂等键在后台异步启动大规模云图或全节点高密度时间树任务（`{ figure_spec, idempotency_key }`）。 | `job_id`、队列状态（`queued` / `running`）及轮询元数据。 |
| | `get_figure_job` | 查询异步制图任务实时阶段进度与完成结果（`{ job_id }`）。 | 当前执行阶段、已用耗时，以及完成后生成的正式 `figure_id`。 |
| | `cancel_figure_job` | 安全取消排队或运行中的后台任务（`{ job_id }`）并干净回收 Worker。 | 确认 `cancelled` 状态，不残留半成品修订版本。 |
| **3. 版本化语义编辑与历史回退** | `inspect_figure` | 无需光栅化即可读取指定图件状态（`{ figure_id, revision? }`）。 | 当前配置、输出物理/像素尺寸、冲突计数及稳定语义 ID（`clade_id`, `source_id`, `branch_id`）。 |
| | `edit_figure` | 原子执行一组语义编辑指令（`{ figure_id, base_revision, operations }`）。 | 新版本号 `revision: k + 1`、更新后的 SVG `resource_link` 及最新零碰撞与不变量核验报告。 |
| | `update_figure` | 整体替换或合并配置区块（`{ figure_id, base_revision, patch }`）。 | 提交新版本 `revision: k + 1`（任一校验失败则完整回滚）。 |
| | `list_revisions` | 列出图件全部不可变历史修订版本（`{ figure_id }`）。 | 按时间排列的版本列表及脱敏后的参数变更摘要。 |
| | `restore_revision` | 将图件精确恢复至指定历史版本（`{ figure_id, base_revision, target_revision }`，不删历史）。 | 与目标历史版本完全一致的新头部版本及恢复后的 SVG 资源。 |
| **4. 成图导出与存储清理** | `export_figure` | 导出出版成图（`{ figure_id, revision?, formats? }`，`formats` 支持 `"svg"`, `"png"`, `"panels"`，像素密度由 `options.output.dpi` 控制）。 | 导出状态、`safe_for_export` 校验、警告信息及各格式产物的 `resource_link` URI。 |
| | `preview_figure` | 在用户显式要求看预览图时，渲染有界尺寸光栅预览（`{ figure_id, revision? }`）。 | PNG 预览图与版面质量诊断摘要。 |
| | `get_figure_spec` | 导出服务端归档配置记录（`{ figure_id, revision? }`，默认脱敏原树文本并附 SHA-256 散列）。 | 脱敏后的 `{ requested, normalized }` 规格记录。 |
| | `delete_figure` | 在用户显式要求清理时删除指定图件的服务端存储（`{ figure_id }`）。 | 存储空间清理确认信息。 |

### 配套 Agent Skill 的五项科学确认规则
当您在启用 `phylorender-mcp` 技能的 AI 客户端中对话作图时，AI 助手严格执行以下五项确认门禁，绝不暗自猜测生物学前提或擅自改乱默认版式：

1. **外群确认门禁：** 创建 *Phylogram*、*Tanglegram*（针对左主树外群，右树自动同步至同一外群侧）或 *Cloudogram*（传入 `options.cloud.phyparts_outgroups` 为基因树定根，同时保持物种树原根不变）前，若您未指定外群，AI 必先检查树文件并请您确认外群物种或外群支，绝不按文件首行顺序盲猜；而在 *Time Tree* 中严格保护定年根，绝不询问或执行重定根。
2. **双树样品差异确认门禁：** 创建 *Tanglegram* 前，AI 必先运行 `compare_tree_samples`；只要两侧样品集合不同，即向您完整展示 `primary_only` 与 `comparison_only` 独有样品列表，等待您明确选择 `intersection` 或 `union`（若样品数相等但名称失配则优先提示核对源树拼写）。
3. **高密度时间树年龄标注门禁：** 若 `inspect_tree` 检测到 *Time Tree* 含 `160` 个及以上候选内部节点年龄标签且您未设年龄窗口，AI 会询问您采用清爽默认策略（标注较老 `50%` 时间跨度的节点年龄并保留全树所有 95% HPD 误差条）、标注全部节点年龄（`age_minimum: 0`，启用可取消的 `1,800 s` 渲染时限），还是指定自定义年龄区间。
4. **出版默认参数优先与覆盖二次确认门禁：** 新建图件一律采用软件调优好的出版默认参数（Arial 字体、自动竖版行距、`1.25×` 中位数超长名限宽与自动无碰撞引线排布）。即便提示词笼统说“把图美化一下”，只要涉及修改非默认字号、手动行距、线宽、长宽比或分辨率，AI 都必须先列出拟改的精确字段、数值与理由，获得您明确确认后才执行修改。
5. **本机隐私与矢量 SVG 优先门禁：** 日常创建与修图直接输出快速矢量 SVG（仅在您明确要求时才生成 PNG 光栅图或调用 `delete_figure`）；优先连接本机回环地址（`127.0.0.1:8766`），遇到 HTTP `429`（`SERVICE_BUSY`）或科学校验报错时绝不回退至远程公网端点，确保未发表树数据始终留在本机。

---

## 5. 分步操作流程与人机协作实用示例

### 流程一：在交互式浏览器工作台（Web Workbench）中从零成图
1. **切换顶部工作区：** 在浏览器打开工作台，点击顶栏的 **Phylogram**、**Time Tree**、**Cloudogram & Discordance** 或 **Tanglegram**。
2. **导入并校验树数据（`Data` 页签）：** 上传主树文件。根据所选视图，可继续附加伴随支持率树（*Phylogram*）、在自动展开的第 2 步确认时间单位与年龄统计量（*Time Tree*）、在样品不一致时选择交集或并集（*Tanglegram*），或上传 ML 基因树集合并填入多物种外群名称（*Cloudogram*）。
3. **定根、排序与规范物种学名（`Layout` 与 `Tip Labels` 页签）：** 在 *Phylogram* 中选定外群物种并点击 **Reroot by Selected Outgroup**（或在画布右键点击外群支基部选 **Reroot at this branch**）。在 `Tip Labels` 中确认开启拉丁双名自动斜体化；如需替换为发表用物种名，可双击单个末端或点击 **Upload Mapping Table** 上传两列 CSV/TSV/TXT/`.xlsx` 映射表（`original_name, display_name`）。
4. **添加单层或双层嵌套分类括号（`Clades` 页签）：** 点击 **Select Clade or Taxon**，点选画布目标分支打开分组弹窗，输入分类群名称、挑选配色，将 `Bracket tier` 保持为 `Automatic`（内层各族自动实线、外层各亚科自动等距虚线并排成对齐竖列）或选 `Inner tier 1` 至 `Outer tier 6`。可配合画布顶栏 `Fit window`、`Fit width`、`Alt + 滚轮` 缩放与 `Find taxon...` 快速浏览大树。
5. **一键重排拥挤标签并导出成图（`Annotations`、`Time Scale` 与 `Export` 页签）：** 用 `− / ＋` 步进框微调低支持率隐藏阈值、HPD 范围、冲突饼图模式或地质年代字号后，点击工作台底部的 **Optimize Node Label Placement** 按钮重新计算全图零重叠槽位与延长线（个别标签也可直接在画布拖动）。最后在 `Export` 页签设好 DPI（`72–1200`，默认 `300`），下载可编辑矢量 **SVG**、**PNG**、**Export Two-Panel Split** 双面板 `.zip` 套件或 `.json` 配置文件。

### 流程二：使用 AI Agent 对话式制图、多轮语义精修与一键回退
在连接了 PhyloRender MCP 服务并启用 `phylorender-mcp` 技能的 AI 客户端中，用自然语言给出树文件路径和关键生物学设定（提前说明外群或时间单位即可一次成图）：

> **初稿创建提示词示例（双方法支持率合并）：**
> *“请以 `sapindaceae_ml.treefile` 为主树（ML 自展百分数），配对附加支持率树 `sapindaceae_astral.tre`（ASTRAL 后验概率，0–1 量纲），以 `Acer_truncatum` 和 `Dipteronia_sinensis` 为外群按默认出版参数绘制一张普通系统发育树并导出 SVG。”*

> **多轮语义精修提示词示例（基于 MRCA 添加双层族与亚科括号）：**
> *“在刚才那张图上，为韶子族 Nephelieae（`Dimocarpus_longan` 与 `Litchi_chinensis` 的 MRCA，颜色 `#2b6f6b`）和无患子族 Sapindeae（`Sapindus_mukorossi` 与 `Koelreuteria_paniculata` 的 MRCA，颜色 `#b85d3b`）添加内层实线括号（tier 0），再在外层（tier 1）套上无患子亚科 Sapindoideae 的深灰色（`#1f2937`）虚线括号。”*

AI 助手在本地读取树文件后，依次调用 `inspect_tree` $\rightarrow$ `create_figure`（生成 `revision: 1`）$\rightarrow$ `inspect_figure` $\rightarrow$ `edit_figure`（基于 `base_revision: 1` 生成 `revision: 2`），并核验返回报告中的 `topology_unchanged: true` 与 `remaining_collisions: 0`。若想撤销某次尝试，只需说 *“把这张图恢复到第 1 版（revision 1）”*，AI 即调用 `restore_revision` 无损退回。

### 流程三：浏览器工作台与 AI Agent 双向 `.json` 配置接力统稿
1. **AI 批量建组 $\rightarrow$ 浏览器精细审阅：** 先让 AI 助手读取物种分类表，批量构建全部族与亚科的 MRCA 双层括号及多树配对，并将本地原始树字符串填入归一化配置的 `main_tree.content`（及伴随树 `content` 字段）保存为完整便携式 `.json` 图件规格文件；随后在浏览器工作台打开 `Export` $\rightarrow$ **Load Figure Spec (.json)**，即可在交互画布上直观查看、微调个别引线标签并点击 **Export SVG**。
2. **浏览器定好主图样板 $\rightarrow$ AI 批量统一全篇配图风格：** 先在浏览器工作台中把第一张主图的字体、线宽以及各亚科/各族主题色调好，点击 **Export Figure Spec (.json)** 保存样板配置；再将该 JSON 文件交给 AI 助手并确认覆盖参数：*“请严格采用 `fig3a_spec.json` 中的字体、线宽和各族配色参数，生成我们的 StarBEAST3 分化时间树（`fig3b.trees`，单位 Mya）以及 86 基因树冲突云图，并统一设为 600 DPI 导出 SVG 和 PNG。”*

---

## 参考文献（References）

Anthropic. (2024). *Model Context Protocol specification*. https://modelcontextprotocol.io/

Cohen, K. M., Finney, S. C., Gibbard, P. L., & Fan, J.-X. (2013). The ICS International Chronostratigraphic Chart. *Episodes*, *36*(3), 199–204. https://doi.org/10.18814/epiiugs/2013/v36i3/002

Sanderson, M. J. (2002). Estimating absolute rates of molecular evolution and divergence times: A penalized likelihood approach. *Molecular Biology and Evolution*, *19*(1), 101–109. https://doi.org/10.1093/oxfordjournals.molbev.a003974

Smith, S. A., Moore, M. J., Brown, J. W., & Yang, Y. (2015). Analysis of phylogenomic datasets reveals conflict, concordance, and gene duplications with examples from animals and plants. *BMC Evolutionary Biology*, *15*, 150. https://doi.org/10.1186/s12862-015-0423-0

Smith, S. A., & O'Meara, B. C. (2012). treePL: Divergence time estimation using penalized likelihood for large phylogenies. *Bioinformatics*, *28*(20), 2689–2690. https://doi.org/10.1093/bioinformatics/bts492

Zhang, C., Rabiee, M., Sayyari, E., & Mirarab, S. (2018). ASTRAL-III: Polynomial time species tree reconstruction from partially resolved gene trees. *BMC Bioinformatics*, *19*(Suppl 6), 153. https://doi.org/10.1186/s12859-018-2129-y
