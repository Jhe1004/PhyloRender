# PhyloRender 详尽使用与审稿人指南

[English](USER_GUIDE.md) | **简体中文**

本手册详细介绍 **PhyloRender（v0.8.0）** 如何彻底解决系统发育绘图的“最后一公里”手工修图痛点，以及平台的整体架构、四大绘图工作区、科学不变量保障、多层嵌套分组与地质时间轴、Web 工作台操作流程、MCP 服务接入和 **Agent Skill** 的完整安装与实战指南。

> **为什么需要 PhyloRender？** 绝大多数现有系统发育树软件直接生成的树图在短枝密集处都会出现节点支持率、年龄和树枝互相重叠的问题，迫使研究者每次都得导进 Illustrator、CorelDRAW 或 Inkscape 里逐个节点手工拖拽支持率、画引线和对齐括号——既耗时费力，树一重跑又得全部重来。PhyloRender 将这“最后一公里”彻底自动化：通过确定性多方向碰撞避让、`45°` 带白桥虚线引线、满支持枝 `2.5×` 加粗、严格同层共线的多层括号和自适应地质年代格，让每一次建树或修改都能在几秒内直接复现出可直接投稿的干净图件。

---

## 1. 整体架构：人类界面与 AI Agent 共享同一引擎

```text
人类研究者（浏览器）                      AI 助手（Codex / Antigravity / Claude / Cursor）
        │                                                 │
        ▼                                                 ▼
Web 工作台（index.html + app.js）        Agent Skill（skills/phylorender-mcp/）+ MCP 服务（stdio / HTTP）
        │                                                 │
        └───────────────────────┬─────────────────────────┘
                                ▼
       共享语义配置桥接层（agent-bridge.js）与统一契约（figure-contract.js）
                                ▼
            纯科学模型（core/）+ 确定性排版渲染器（render/）
                                ▼
  可编辑矢量 SVG（1000-u）· 可选高 DPI PNG · 单系双面板 · spec.json · report.json
```

网页工作台与 MCP 服务运行完全一致的底层解析器、排版算法和渲染引擎：
- 你在网页端调好的图可以导出 `spec.json`，直接交给 AI Agent 批量复现或二次微调；
- AI Agent 通过 MCP 生成的图也可以原样导回网页端继续交互点击微调，全程无损一致。

---

## 2. 四大核心工作区详解

### 2.1 普通系统发育树（Phylogram，`workspace: "phylogeny"`）
- **输入**：主树（Newick/Nexus）+ 最多 20 棵附加支持率树或附加数值数据树（按无根二分划分自动匹配，不要求两棵树节点编号或定根一致）。
- **复合支持率与量纲规范**：
  - 自动按各列量纲统一精度（`decimals: "auto"` 下百分数取整、概率保留 2 位小数，如 `98/1.00`、`100/–`）；
  - 明确区分 `percent`（0–100）与 `probability`（0–1），遇歧义拒绝盲猜；
  - 双满支持分支（如 `100/1.00`，按当前显示精度舍入后判断）自动以 `2.5×` 加粗树枝呈现（`full_support_marker: "branch"`），显著减少画面数字冗余；
  - 低支持率阈值（`low_support_threshold`，默认 `< 50`）始终按原始数值判断，低于阈值显示为 `–`。
- **零碰撞自动避让**：多方向候选评分自动避开树枝、圆点与样品名，使用 `45°` 带白色过线桥的虚线引线清晰指向对应节点（质检报告保证 `remaining_collisions = 0`）。
- **ASTRAL 零末端枝长兼容**：当树含正内部枝长但所有末端枝长缺失或为 0 时，自动在显示坐标上为所有末端补等长 `1` 的末端小枝并隐藏容易误导的比例尺，原始树数据丝毫不变，并在报告中披露 `display_branch_lengths`。

### 2.2 时间树（Time Tree，`workspace: "time"`）
- **输入**：已定年的 Newick/Nexus 时间树（如 StarBEAST3、BEAST2、MCMCTree、RelTime），支持节点年龄与 95% HPD 置信区间。
- **两步有序导入**：步骤 1 导入树文件，步骤 2 在同一入口内确认源时间单位（`years`、`kyr`、`mya`、`bya`）与整树年龄来源（`mean`、`median`、`height` 或 `branch_lengths`）；整棵树强制使用单一一致的年龄来源，绝不混用。
- **科学防误导约束**：
  - 严格保留输入树根与原始年代，不自动重新定根或重新定年；
  - 刻意屏蔽支持率数字、支持率圆点与加粗树枝，避免读者把支持率与时间置信区间混淆；
  - 严格拒绝负年龄、年龄倒置、格式错误 HPD 及超出浮点残差容差（`rootAge × 64 × Number.EPSILON`）的非零末端年龄。
- **官方 ICS 地质年代表**：完整覆盖官方 ICS `0–4567 Ma` 地质年代（纪 / 世）。空间充足的色块以默认字号依次尝试英文全称、短缩写与最短缩写；极窄色块（如 100 Ma 尺幅下的第四纪 `Q`、上新世 `Pl`、更新世 `Ps`）仅对该格单独缩小最短缩写字号至 `≥ 4 px` 可读下限，完整落入方格内部，绝不跨界或外置。
- **超密时间树保护**：候选年龄节点 ≥ 160 个时默认仅显示较老 50% 的节点数字（保留全部 HPD 区间与真实坐标）；如需显示全部节点，显式指定 `age_minimum: 0` 即可。

### 2.3 基因树—物种树冲突云图（Cloudogram & Discordance，`workspace: "cloud"`）
- **输入**：已定年物种树 + 批量 ML 基因树集合（Newick/Nexus）。
- **内置零外部依赖惩罚似然显示对齐引擎（`core/pl-aligner.js` + `core/lbfgs-solver.js`）**：基于 Sanderson (2002) 与 Smith & O'Meara (2012) 的泊松惩罚似然速率平滑方程独立用纯 JavaScript 实现，**跨平台无需安装或编译 C++ `treePL`、ADOL-C、NLopt 或 OpenMP**。仅完整样品集且 ML 枝长合格的基因树参与云层叠绘，约束共有物种树节点年龄实现超度量显示对齐（在报告中明确披露为 `display_alignment`，而非独立多物种共祖年代推断）；基因树枝线按其后代在物种树的 MRCA 继承对应分组色，共有内部节点纵向锚定到物种树坐标。
- **内置无 Java 冲突统计引擎（`core/phyparts-engine.js`）**：基于 Smith et al. (2015) 的有根二分方法独立用纯 JavaScript 实现，**无需安装 Java 或上游 PhyParts**。完整统计所有可比较基因树（含部分缺失样品的基因树），始终计算全部四类比例（一致 / 主冲突 / 其余冲突 / 无信息），切换两类/四类显示或隐藏个别饼图绝不改变统计分母。

### 2.4 双树冲突对照图（Tanglegram，`workspace: "conflict"`）
- **输入**：左侧主树 + 右侧对照树（如核基因物种树 vs. 叶绿体树）。
- **严格 1 对 1 身份匹配**：拒绝多对一/一对多模糊歧义；当两树样品集合不一致时，完整报告各自独有样品并要求用户显式选择 `intersection`（交集）或 `union`（并集）。
- **姐妹分支自动解缠**：仅通过旋转右侧对照树的姐妹分支最小化连线交叉数，绝不改变其无根拓扑与枝长；支持率采用紧凑无引线紧贴放置。

---

## 3. 多层嵌套分组括号与排版细节

PhyloRender 原生支持单层及多层嵌套分类分组（例如内层标“族 Tribes”、外层标“亚科 Subfamilies”）：

- **显式层级（`clades[].tier`）**：`tier: 0` 绘制内层实线括号，`tier: 1` 绘制端点闭合的外层虚线括号，`tier: 2+` 绘制点划线括号。
- **同节点多层挂载**：同一个树节点（例如单属亚科 *Xanthoceroideae* / *Xanthocereae*，或子采样后仅剩单族的亚科）可同时拥有 `tier: 0`（内层族）与 `tier: 1`（外层亚科）两条独立分组。内层（`tier: 0`）颜色驱动树枝与样品名着色，外层（`tier: 1`）稳重包覆在外层虚线列。
- **多层严格同层共线**：只要存在 2 层及以上，**同一层的所有括号严格锁定在一条笔直垂直线上**（`X_0`、`X_1`……），内外层文字全部保持竖排；若同层相邻短族的竖排文字在纵向冲突，仅将冲突文字微幅向右错开（`labelShiftX`），括号纹丝不动，零重叠且高度紧凑。
- **智能字号与宽名拟合**：
  - 组名字号默认始终比当前样品名字号大 `3 u`（`typography.clades.follow_tip_size: true`）；
  - 超过全图样品名自然宽度中位数 `1.25×` 的超长学名自动原地横向压缩，保持字高、全文和标本编号下划线不变；
  - 显示改名（`tip_label_overrides`）与种下等级格式化（`normalize_ranks: true`，如 `Acer pictum subsp. mono`）仅作用于显示，不改变科学匹配键。

---

## 4. 大型树单系双面板自动拆分（`panels`）

面对 100–300+ 样品的高树，直接塞进单页会导致字小如蚁。PhyloRender 提供按需**单系双面板拆分**：
- 在定根与阶梯化之后最多拆分一次；
- **Panel 1** 保留外群、基部类群与清晰的续接指引（`↪ Continued clade (N tips) — see Panel 2`）；
- **Panel 2** 完整隔离一个大型单系冠群，保持与 Panel 1 完全一致的画幅宽度，并自动跨面板继承外层亚科括号与颜色；
- 可在网页端 **Export** 标签页或通过 MCP `export_figure(..., formats: ["panels"])` 按需导出（仅在需要栅格图时附加 `"png"`）。

---

## 5. Web 交互工作台操作流程

1. **本地启动**：
   ```bash
   python3 tools/local_server.py --host 127.0.0.1 --port 8765 --open
   ```
   （macOS 也可直接双击根目录的 `start_phylorender.command`。）
2. **切换工作区**：点击顶部四个标签之一（*Phylogram*、*Time Tree*、*Cloudogram & Discordance*、*Tanglegram*）。
3. **导入数据**：在左侧 **Data** 标签页导入主树及附加数据（时间树在同一入口内顺序完成第 1 步导树与第 2 步单位/年龄来源确认）。
4. **实时调优**：在 **Layout**、**Tip Labels**、**Annotations**、**Clades**、**Time Scale & Backdrop** 中实时调整；所有有界数值参数均为统一的“减号 / 数字输入 / 加号”控件；需要重排节点标注时点击工作台底部的 **Optimize Node Label Placement**。
5. **导出成果**：在 **Export** 标签页保存可编辑 SVG、高 DPI PNG、双面板 SVG 或完整配置文件 `spec.json`。

---

## 6. MCP 服务与 Agent Skill 详尽指南

### 6.1 直接配置 MCP 服务（无需 Skill 也可使用）
支持 MCP 协议的任意客户端（Claude Desktop、Cursor、Windsurf、Codex、Antigravity）均可直接接入：
- **`stdio` 模式**：`node /你的路径/PhyloRender/mcp-server/src/stdio.mjs`
- **Streamable HTTP 模式**：`npm --prefix mcp-server run start:http` → `http://127.0.0.1:8766/mcp`

全部 15 个 MCP 工具、环境变量、Docker 部署与安全策略见 [mcp-server/README.zh-CN.md](../mcp-server/README.zh-CN.md)。

### 6.2 强烈推荐：安装并使用 Agent Skill（`skills/phylorender-mcp/`）

为 AI 编程助手安装仓库内置的 **Agent Skill** 后，AI 会像资深系统发育专家一样安全、高效地调用 PhyloRender：

1. **安装 MCP 服务依赖（一次即可）**：
   ```bash
   npm ci --prefix mcp-server
   ```
2. **安装 Skill 到你的 AI 助手**：
   ```bash
   # Codex
   cp -R skills/phylorender-mcp ~/.codex/skills/phylorender-mcp
   # Antigravity / Gemini CLI
   cp -R skills/phylorender-mcp ~/.gemini/config/skills/phylorender-mcp
   ```
3. **配置本地仓库绑定 `local-config.json`**：
   ```bash
   cp skills/phylorender-mcp/local-config.example.json ~/.codex/skills/phylorender-mcp/local-config.json
   ```
   将 `local-config.json` 中的 `"repoRoot"` 改为本机 `PhyloRender` 绝对路径。
4. **运行健康检查**：
   ```bash
   node ~/.codex/skills/phylorender-mcp/scripts/phylorender_mcp_client.mjs health
   ```
5. **日常使用中的自动保障机制**：
   - 自动先调 `inspect_tree` 检查树结构，非时间树必先向你确认外群；
   - 大树、云图、全节点时间树自动走异步后台任务（`start_figure_job` + `wait`），原生 `http/https` 长连接客户端支持长达 31 分钟的导出，不掉线；
   - JSON 中直接写 `{"file": "./tree.nwk"}` 与 `{"file": "./rename.csv"}` 自动读取打包；
   - 自动记录 `figure_id` 与 `revision`，后续口头指令（如“把样品名调大一点”、“加上两层族和亚科分组”、“导出 350 DPI PNG”）均通过 `edit_figure` + `base_revision` 原子递增修订，绝不覆盖旧版。

详细 CLI 命令与提示词模板见 [skills/phylorender-mcp/README.zh-CN.md](../skills/phylorender-mcp/README.zh-CN.md)。

---

## 7. 常见问题与排查

- **提示找不到 Chrome / Chromium**：运行 `npm --prefix mcp-server run install-browser` 自动安装无头 Chromium，或通过环境变量 `PHYLORENDER_BROWSER_EXECUTABLE` 指定本机浏览器路径。
- **`stdio.mjs` 提示 `OUTPUT_DIRECTORY_LOCKED`**：每个输出目录采用单写者租约锁（`.writer-lease.json`）以防并发写坏修订历史。如需同时运行多个独立 `stdio` 实例，请为它们配置不同的 `PHYLORENDER_OUTPUT_ROOT`；更推荐多个 Agent 共享同一个本地 HTTP 服务（`127.0.0.1:8766`）。
- **Linux 或无 Arial 字体环境**：PhyloRender 会显式回退至内置开源字体 Arimo，重新量测全部字形并在导出 SVG 中嵌入所需字体子集，同时在 `report.font_portability` 中如实记录，绝不把 Arimo 冒充 Arial。
- **电脑休眠后本地共享 MCP 报浏览器断开**：v0.8.0 已在 `mcp-server/src/runtime.mjs` 中内置 `ensureBrowser()` 自动检测并重建无头浏览器，无需手动重启服务。
