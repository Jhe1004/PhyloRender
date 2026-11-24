# PhyloRender Agent Skill 使用指南（`phylorender-mcp`）

[English](README.md) | **简体中文**

本目录包含可直接安装使用的 **PhyloRender Agent Skill**，用于让支持 Skill 规范的 AI 编程助手（如 Codex、Antigravity、Claude Code、Cursor 等）以**本地优先、科学规范、零坐标盲猜**的方式调用 PhyloRender MCP 服务完成系统发育图绘制与迭代修改。

---

## 1. 这个 Skill 能做什么？

- **本地优先自动拉起共享服务**：通过 `scripts/phylorender_mcp_client.mjs` 自动检查 `http://127.0.0.1:8766/health`，未运行时自动以带启动锁的后台进程拉起单一共享 MCP 服务，多个对话/Agent 复用同一实例，不产生僵尸进程。
- **自然语言 → 语义化 MCP 调用**：将用户的绘图描述自动翻译为最小合法的 PhyloRender MCP 参数（按原始样品 ID 与 MRCA 类群语义操作，绝不依赖屏幕坐标或临时 DOM ID）。
- **强制科研安全门禁**：
  - **外群确认门禁**：绘制普通树、云图或双树冲突图前，若用户未明确指定外群，先调用 `inspect_tree` 并简短确认外群，绝不按文件顺序猜外群；时间树自动保留原根、绝不重新定根。
  - **密集时间树门禁**：检测到 ≥160 个候选内部节点年龄时，自动提示用户选择默认较老 50%、全部标注（含 30 分钟超时上限）或自定义年龄段。
  - **双树样品核验门禁**：绘制双树冲突图前自动调用 `compare_tree_samples` 严格核验 1 对 1 样品差异，不静默丢弃或误配样品。
- **超长任务稳定支持**：内置原生 `node:http` / `node:https` 长超时传输（默认 1860 秒），避开 Node.js 默认 300 秒 `headersTimeout` 断连问题，并支持大树异步任务队列（`start_figure_job` / `wait`）。
- **默认快速返回矢量 SVG**：默认只生成可编辑矢量 SVG 并立即返回；仅当用户明确要求 PNG 或双面板拆图（`panels`）时才执行栅格化或面板导出。

---

## 2. 30 秒安装与配置步骤

### 第 1 步：安装 PhyloRender MCP 依赖（只需一次）

在克隆好的 `PhyloRender` 仓库根目录运行：

```bash
npm ci --prefix mcp-server
# 如果电脑尚未安装 Google Chrome 或 Chromium，可自动安装无头 Chromium：
npm --prefix mcp-server run install-browser
```

### 第 2 步：将 Skill 目录安装到你的 AI 助手

把本仓库的 `skills/phylorender-mcp` 目录复制（或软链接）到你使用的 AI 助手的 Skill 目录：

```bash
# Codex
cp -R skills/phylorender-mcp ~/.codex/skills/phylorender-mcp

# Antigravity / Gemini CLI
cp -R skills/phylorender-mcp ~/.gemini/config/skills/phylorender-mcp
```

### 第 3 步：创建本地配置文件 `local-config.json`

在刚刚安装好的 Skill 目录中，复制配置模板：

```bash
cp local-config.example.json local-config.json
```

编辑 `local-config.json`，将 `repoRoot` 改为你电脑上 `PhyloRender` 仓库的**绝对路径**（注意：`local-config.json` 已被 `.gitignore` 忽略，切勿提交到公开仓库）：

```json
{
  "repoRoot": "/你的绝对路径/PhyloRender",
  "stateRoot": "~/.phylorender/local-mcp",
  "localEndpoint": "http://127.0.0.1:8766/mcp"
}
```

> 也可不建 `local-config.json`，直接设置环境变量 `PHYLORENDER_MCP_PACKAGE_ROOT=/你的绝对路径/PhyloRender/mcp-server`。

### 第 4 步：验证连接与工具发现

```bash
node scripts/phylorender_mcp_client.mjs health
node scripts/phylorender_mcp_client.mjs tools
```

看到 `"ok": true, "version": "0.8.0", "state": "ready"` 及 15 个 MCP 工具列表即表示安装成功！

---

## 3. 常用 CLI 辅助命令速查

| 场景 | 命令示例 |
| --- | --- |
| 检查/拉起本地 MCP 服务 | `node scripts/phylorender_mcp_client.mjs health` |
| 查看全部可用工具 | `node scripts/phylorender_mcp_client.mjs tools` |
| 同步调用任意 MCP 工具 | `node scripts/phylorender_mcp_client.mjs call inspect_tree req.json` |
| 提交异步长任务（大树/云图） | `node scripts/phylorender_mcp_client.mjs call start_figure_job req.json` |
| 等待异步任务完成 | `node scripts/phylorender_mcp_client.mjs wait <JOB_ID>` |
| 下载矢量 SVG 与报告 | `node scripts/phylorender_mcp_client.mjs download <FIGURE_ID> <REV> ./out` |
| 同时导出高分辨率 PNG | `node scripts/phylorender_mcp_client.mjs download <FIGURE_ID> <REV> ./out --png` |
| 导出大型树单系双面板 | `node scripts/phylorender_mcp_client.mjs download <FIGURE_ID> <REV> ./out --panels` |

> **文件自动注水特性**：在 `req.json` 中，任意树输入对象只需写 `{"file": "./ml.newick"}`，`tip_label_overrides` 只需写 `{"file": "./rename.csv"}`（支持 CSV / TSV / `.xlsx`），客户端脚本会自动读取文件内容并打包发送，无需手工拼接大段 Newick 字符串。

---

## 4. 可以直接复制给 AI 助手的对话示例

- **绘制双支持率系统发育树 + 两层嵌套分组**：
  > “用 PhyloRender 画 `ml.newick`，把 `astral.newick`（概率量纲）作为附加支持率，外群定在 `Outgroup_sp`。右边画两层分组：内层按族用实线着色，外层按亚科用深灰虚线包起来，先给我 SVG。”
- **绘制化石校准时间树**：
  > “帮我用 PhyloRender 画出 `starbeast3.tre` 时间树，原始单位是百万年（Ma），显示 95% HPD 区间和地质年代背景，导出 SVG 和 350 DPI PNG。”
- **绘制基因树—物种树冲突云图**：
  > “用 `species_dated.nwk` 作为物种时间树、`86_genes.trees` 作为基因树集合画一张云图与四分冲突饼图，外群是 `Outgroup_sp`。”
- **绘制核质冲突双树对照图**：
  > “把 `nuclear.nwk` 和 `plastid.nwk` 做成双树冲突对照图（左树外群 `Outgroup_sp`），自动解缠降低连线交叉，导出矢量 SVG。”
- **基于已有图件迭代修改**：
  > “把刚才那张图（`figure_id`）里样品 `Acer_pictum_SRR21412921` 的显示名改成 `Acer pictum subsp. mono SRR21412921`，其他保持不变，再导出一份新版本。”

---

## 5. 目录文件说明

- `SKILL.md`：AI Agent 核心操作协议、确认门禁、单位与排版规则。
- `scripts/phylorender_mcp_client.mjs`：本地优先 MCP 客户端与长超时下载器。
- `scripts/local_service.mjs` / `local_service.test.mjs`：共享本地服务管理器及单元测试。
- `references/workflows.md`：四大工作区完整 JSON 请求模板。
- `references/user-guide.md`：面向新用户的通俗功能说明。
- `references/local-service.md`：本地/远程路由、状态目录与故障排查文档。
- `local-config.example.json`：本地配置模板（复制为 `local-config.json` 使用）。
