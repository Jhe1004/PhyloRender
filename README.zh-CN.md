# PhyloRender

[English](README.md) | **简体中文**

**面向人类研究者与 AI Agent 的一站式、零碰撞可复现系统发育可视化平台**

当前科学研究正加速迈入 AI agent 时代，大量繁琐、多步骤的数据分析与制图工序已经能够借助 AI agent 实现精确自动化；然而，将原始系统发育树转化为论文可直接发表的成图却依然耗费大量人力，主要受困于三大核心痛点：

1. **缺乏面向 AI Agent 的原生适配（没有专门的 MCP 服务与 Agent Skill）**：现有系统发育绘图工具（无论是图形界面软件还是脚本库）均面向纯人工点选或临时写代码，没有专门面向 AI Agent 设计的 Model Context Protocol（MCP）接口与领域 Skill，导致 AI 助手使用门槛高、只能拼凑脆弱脚本，难以可靠校验样品身份、执行语义化修改或自动检查版面质量。
2. **标准论文所需的四类核心图件割裂在十余种软件与繁琐工序中**：一篇完整的系统发育论文往往同时需要系统发育树（含多源支持率）、分化时间树（Dating 图）、核质冲突分析（如叶绿体/线粒体基因组 vs. 核基因组）以及基因树—物种树冲突分析（通常以云图 + 冲突饼图呈现）。这些高度关联的图形过去无法在一个软件里完成，研究者不得不跨越十几个乃至二十个工具和中间转换步骤，耗费大量精力且难以统一风格。
3. **出版级排版的“最后一公里”手工修图瓶颈**：即便费力导出初始树图，短枝密集处的节点支持率与年龄标注仍常直接重叠在树枝上；而分支分组着色、单层/多层分类群名称标注以及 Dating 图中的地质年代背景着色，几乎都无法自动完成，只能导进 Adobe Illustrator、CorelDRAW 或 Inkscape 里逐个节点手工拖拽调整——不仅极度耗时，树一重跑就得全部重做。

**PhyloRender 在同一套确定性科学模型与零碰撞渲染引擎上，一站式解决了这三大痛点**：同时提供交互式 **Web 工作台**、原生 **MCP 服务** 与开箱即用的 **Agent Skill**，完整覆盖四大核心系统发育绘图工作区，让人类研究者和 AI 助手都能从 Newick/Nexus 文件直接产出可复现、无需手工修图的出版级矢量 SVG 与高分辨率 PNG。

> **完整文档导航**：[中文详尽使用文档](docs/USER_GUIDE.zh-CN.md) · [English User Guide](docs/USER_GUIDE.md) · [MCP 服务手册 (中文)](mcp-server/README.zh-CN.md) · [MCP Server Guide (EN)](mcp-server/README.md) · [Agent Skill 使用指南 (中文)](skills/phylorender-mcp/README.zh-CN.md) · [Agent Skill Guide (EN)](skills/phylorender-mcp/README.md)

---

## 软件整体介绍

### 四大核心工作区

| 工作区 | MCP `workspace` | 适用科研场景与核心能力 |
| --- | --- | --- |
| **普通系统发育树（Phylogram）** | `phylogeny` | 展示单树或多树二分匹配（如 ML bootstrap `%` + ASTRAL LPP / 贝叶斯 PP）的复合支持率；自动识别量纲与小数位；双满支持枝自动 `2.5×` 加粗；`45°` 带白桥虚线引线实现节点标注零碰撞；支持单层与多层嵌套分类括号。 |
| **时间树（Time Tree）** | `time` | 展示化石校准的分化时间树、节点年龄、95% HPD 置信区间及官方国际地层委员会（ICS，0–4567 Ma）地质年代表；窄地质年代格单格自适应缩字；严格保留输入定根与原始年代，不混画支持率。 |
| **基因树—物种树冲突云图（Cloudogram & Discordance）** | `cloud` | 将多棵 ML 基因树通过受管 `treePL` 对齐叠绘到物种时间树上（显式披露 `display_alignment`），并由内置无 Java 依赖的 JavaScript 冲突引擎（依据 Smith et al., 2015）自动计算并绘制四分类（一致 / 主冲突 / 其余冲突 / 无信息）饼图。 |
| **双树冲突对照图（Tanglegram）** | `conflict` | 并排对比两棵系统发育树（如核基因树 vs. 叶绿体树），执行严格的 1 对 1 样品身份匹配，自动旋转右树姐妹分支大幅降低连线交叉，采用无引线紧贴支持率标注。 |

### 核心工程与科学设计亮点

- **Web 与 MCP 同源一致**：网页工作台与 MCP 服务运行完全相同的 `core/` 科学模块、`render/` 渲染引擎、`figure-contract.js`（全工作区固定 `1000-u` 规范画幅）和 `agent-bridge.js`，不存在第二套绘图算法。
- **严格的科学不变量保护**：所有样式调整、阶梯化排序、学名斜体、显示改名和分组着色均**绝不改写**原始拓扑、枝长、支持率、节点年龄、HPD 区间和原始样品身份键（完整保留如 `2023080906_1` 的标本编号下划线）。
- **零碰撞出版级自动排版**：多方向候选评分自动放置节点数值与 `45°` 白桥引线；按全图样品名自然宽度中位数的 `1.25×` 自动横向拟合超长学名；稀疏树自动舒展至约 `1.25` 黄金竖版比例；支持可选离线 `gnfinder`/`gnparser` 精确拉丁学名斜体解析（未安装时自动回落至内置植物/动物命名规则）。
- **严格同层共线的多层嵌套分组括号**：支持单层或多层嵌套分类标注（例如内层 `tier: 0` 实线着色各族 + 外层 `tier: 1` 虚线包裹亚科），并原生支持**同一节点同时挂载不同层级**（如单属亚科同时标注内层族与外层亚科）。多层模式下同一层所有括号严格锁定在一条笔直垂直线上，冲突的竖排文字仅向右微幅错开，括号绝不左右乱窜。
- **大型树自动单系双面板拆分（`panels`）**：长普通树或时间树最多拆分为两张等宽面板，Panel 2 自动隔离一个完整单系冠群，并跨面板自动继承外层亚科括号与颜色。
- **可追溯审计与高稳定性**：MCP 每次编辑生成不可变修订版本（`revision`）、脱敏 `spec.json` 和结构化质检报告 `report.json`（含 `safe_for_export`、`remaining_collisions`、`topology_unchanged` 等）；常驻无头浏览器断开后可自动重建自愈。

---

## 快速上手

### 环境依赖

- **Python 3.9+**（用于启动本地回环 Web 工作台服务与受管原生程序）
- **Node.js 20+** 与 **Google Chrome / Chromium**（用于运行 MCP 服务与 Agent Skill；若未安装浏览器可通过 Playwright 一键安装）

```bash
git clone https://github.com/Jhe1004/PhyloRender.git
cd PhyloRender
```

---

### 1. 交互式 Web 工作台（人工浏览器操作）

在仓库根目录执行一条命令即可启动并自动打开浏览器：

```bash
python3 tools/local_server.py --host 127.0.0.1 --port 8765 --open
```

- **macOS 用户**也可直接双击仓库根目录的 `start_phylorender.command` 启动。
- 默认打开为空白工作台。如需立刻使用内置公开示例数据体验四大工作区，可直接访问：
  - 普通系统发育树示例：`http://127.0.0.1:8765/?demo=1&workspace=phylogeny`
  - 时间树示例：`http://127.0.0.1:8765/?demo=1&workspace=time`
  - 冲突云图示例：`http://127.0.0.1:8765/?demo=1&workspace=cloud`
  - 双树冲突示例：`http://127.0.0.1:8765/?demo=1&workspace=conflict`
- 在左侧 **Export** 标签页可直接导出可编辑 SVG、高分辨率 PNG 或完整配置 `spec.json`（可无缝交给 MCP 继续编辑）。

---

### 2. MCP 服务（AI Agent 接入与自动化管线）

首次使用先安装一次 MCP 服务依赖：

```bash
npm ci --prefix mcp-server
# 若本机未安装 Chrome/Chromium，可执行下面命令自动安装无头 Chromium：
npm --prefix mcp-server run install-browser
```

#### 方式 A：本地 `stdio` MCP（适用于 Claude Desktop、Cursor、Windsurf、Codex、Antigravity）

在你的 MCP 客户端配置文件中添加（将 `/absolute/path/to/PhyloRender` 替换为本机克隆路径）：

```json
{
  "mcpServers": {
    "phylorender": {
      "command": "node",
      "args": ["/absolute/path/to/PhyloRender/mcp-server/src/stdio.mjs"]
    }
  }
}
```

#### 方式 B：本地 Streamable HTTP MCP

```bash
npm --prefix mcp-server run start:http
```

- MCP 端点：`http://127.0.0.1:8766/mcp`
- 健康检查：`http://127.0.0.1:8766/health`

#### 方式 C：Docker 容器部署（Linux / 课题组共享服务器）

```bash
docker build -f mcp-server/Dockerfile -t phylorender-mcp .
docker run --rm --init -p 127.0.0.1:8766:8766 \
  -e PHYLORENDER_MCP_TOKEN='replace-with-a-long-random-token' \
  -e PHYLORENDER_ALLOWED_HOSTS='localhost,127.0.0.1' \
  phylorender-mcp
```

---

### 3. Agent Skill（`skills/phylorender-mcp/`）

本仓库内置了完整、可独立安装的 **Agent Skill**（位于 [`skills/phylorender-mcp/`](skills/phylorender-mcp/)），让支持 Skill 的 AI 编程助手（Codex、Antigravity、Claude Code、Cursor 等）立刻具备专业系统发育绘图能力。

#### 这个 Skill 解决什么痛点？
没有 Skill 时，AI 助手常会自己临时拼凑脆弱的 R/Python 绘图脚本或盲猜屏幕坐标。安装本 Skill 后，AI 助手会自动遵循标准科研绘图工作流：
1. **本地优先共享服务调度**（`scripts/phylorender_mcp_client.mjs`）：自动检测并按需拉起单一共享的本机回环 MCP 服务（`127.0.0.1:8766`），支持请求 JSON 中直接填本地树文件路径、大树异步队列轮询（`start_figure_job` / `wait`），并内置原生 `http/https` 长连接客户端（支持 30 分钟以上超长任务，彻底避免默认 5 分钟超时断连）。
2. **强制科学确认门禁**：非时间树未指定外群时先向用户确认准确外群，绝不擅自猜测；密集时间树（≥160 节点）自动提示确认标注比例；双树冲突自动先调用 `compare_tree_samples` 核查样品差异。
3. **默认优先、快速返回矢量图**：直接采用经过充分调优的 `*_u` 出版默认参数，默认走最快的纯 SVG 通道；仅在用户明确要求时才渲染高 DPI PNG 或双面板。

#### 30 秒安装与启用 Skill

```bash
# 1. 在 PhyloRender 根目录安装一次 MCP 依赖
npm ci --prefix mcp-server

# 2. 将 Skill 目录复制到你的 Agent Skill 目录
# Codex 用户：
cp -R skills/phylorender-mcp ~/.codex/skills/phylorender-mcp
# Antigravity / Gemini CLI 用户：
cp -R skills/phylorender-mcp ~/.gemini/config/skills/phylorender-mcp

# 3. 复制配置模板并填写你的 PhyloRender 仓库绝对路径（local-config.json 已被 git 忽略）
cp skills/phylorender-mcp/local-config.example.json ~/.codex/skills/phylorender-mcp/local-config.json
# 编辑 local-config.json 中的 "repoRoot" 为你的本机路径

# 4. 验证本地 MCP 健康与工具发现
node ~/.codex/skills/phylorender-mcp/scripts/phylorender_mcp_client.mjs health
node ~/.codex/skills/phylorender-mcp/scripts/phylorender_mcp_client.mjs tools
```

完成以上四步后，你就可以直接用自然语言指挥 AI 助手画图，例如：
> *“帮我用 PhyloRender 画一下 `ml.newick`（附带 `astral.newick` 的 LPP 支持率），外群是 `Outgroup_sp`，右边加上两层分组：内层按族实线着色、外层按亚科深灰虚线包裹，输出 SVG 和 350 DPI 的 PNG。”*

更多配置选项、模板与实战案例请阅读 [skills/phylorender-mcp/README.zh-CN.md](skills/phylorender-mcp/README.zh-CN.md) 与 [中文详尽使用文档](docs/USER_GUIDE.zh-CN.md)。

---

## 完整文档索引

| 文档主题 | 简体中文 | English |
| --- | --- | --- |
| 项目总览与快速上手 | [README.zh-CN.md](README.zh-CN.md) | [README.md](README.md) |
| 软件全功能与审稿人详尽手册 | [docs/USER_GUIDE.zh-CN.md](docs/USER_GUIDE.zh-CN.md) | [docs/USER_GUIDE.md](docs/USER_GUIDE.md) |
| Agent Skill 安装与实战指南 | [skills/phylorender-mcp/README.zh-CN.md](skills/phylorender-mcp/README.zh-CN.md) | [skills/phylorender-mcp/README.md](skills/phylorender-mcp/README.md) |
| MCP 服务 API 与部署指南 | [mcp-server/README.zh-CN.md](mcp-server/README.zh-CN.md) | [mcp-server/README.md](mcp-server/README.md) |
| MCP Agent 协议参考与绘图单位契约 | — | [agent-guide.md](mcp-server/docs/agent-guide.md) · [physical-units.md](mcp-server/docs/physical-units.md) |
| 公开合成基准评测包 | — | [evaluation/README.md](evaluation/README.md) |

---

## 自动化验证与复现

在仓库根目录运行完整工程门禁、许可合规扫描与 Skill 单元测试：

```bash
node tools/build-manifest.cjs
node tools/check-project.cjs
node tools/check-release.cjs
node --test skills/phylorender-mcp/scripts/local_service.test.mjs
```

运行真实浏览器 MCP 端到端冒烟测试（覆盖全部 15 个 MCP 工具及 HTTP 鉴权/Host/Origin 安全控制）：

```bash
(cd mcp-server && node tests/mcp-smoke.mjs && node tests/http-smoke.mjs)
```

---

## 开源许可与引用

- **开源协议**：原始源代码采用 **GPL-3.0-or-later** 许可（见 [LICENSE](LICENSE)）。第三方组件、内置字体及公开示例数据保留各自版权声明（见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 [defaults/README.md](defaults/README.md)）。
- **论文引用**：如在科研论文中使用了 PhyloRender，请通过 [CITATION.cff](CITATION.cff) 引用对应的 *Molecular Ecology Resources* 论文：
  > *PhyloRender: a human- and agent-accessible platform for reproducible phylogenetic visualization* (v0.8.0).
