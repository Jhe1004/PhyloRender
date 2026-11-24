# PhyloRender MCP 服务手册

[English](README.md) | **简体中文**

本目录提供 PhyloRender 的标准 **Model Context Protocol（MCP）服务端**（支持本地 `stdio` 与远程/本地 `Streamable HTTP`）。它与 Web 工作台加载完全相同的 `app.js`、`agent-bridge.js`、`core/` 和 `render/` 模块，不存在第二套绘图算法。

- **当前版本**：`0.8.0`（完整支持 `phylogeny`、`time`、`cloud`、`conflict` 四大工作区，共享 `figure-contract.js` 默认契约）
- **开源协议**：**GPL-3.0-or-later**（见 [LICENSE](../LICENSE) 与 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)）
- **规范绘图单位**：四工作区整图固定 `1000` 绘图单位（`u`），规范尺寸字段为 `*_u`，印刷宽度 `width_mm`（`0` 取默认上限：单树 `400 mm`、双树 `800 mm`）只等比缩放成图，`dpi` 只影响 PNG 栅格密度（详见 [docs/physical-units.md](docs/physical-units.md)）。
- **最新特性**：
  - 组名字号默认自动比样品名大 `3 u`（`typography.clades.follow_tip_size: true`）；
  - 多层嵌套分组（`tier: 0` 实线内层、`tier: 1` 虚线外层，支持同节点多 `tier`）严格锁定同层共线、全竖排并在冲突时仅向右微幅错开文字；
  - ICS 地质年代表（0–4567 Ma）对窄色块执行单格自适应缩字（下限 `4 px`）；
  - 后台无头 Chromium 意外断开后自动重建自愈（`ensureBrowser()`）。

---

## 1. 全部 15 个 MCP 工具一览

| MCP 工具名 | 核心用途 |
| --- | --- |
| `inspect_tree` | 解析 Newick/Nexus，返回样品列表、枝长、支持率字段、时间树密度诊断与无根拓扑指纹 |
| `compare_tree_samples` | 严格 1 对 1 比对两棵树的原始样品名差异（双树冲突图前置检查） |
| `create_figure` | 同步创建图件（支持主树、附加支持率/数据树、显示改名、语义定根、样式与多层 MRCA 分组） |
| `start_figure_job` | 带幂等键（`idempotency_key`）启动后台异步渲染任务（推荐用于大树、云图、全标注时间树） |
| `get_figure_job` | 查询异步任务状态（`queued` / `running` / `succeeded` / `failed` / `cancelled`）并获取 `figure_id` |
| `cancel_figure_job` | 请求取消运行中或排队中的任务并回收底层原生进程（已提交的图件不会被删除） |
| `inspect_figure` | 读取指定版本的图件报告、稳定分支 ID（`branch_id`）、附加源 ID 与分组 ID（`clade_id`），不触发栅格化 |
| `edit_figure` | 基于明确 `base_revision` 执行原子批量语义编辑，生成新版本并拒绝过期基线覆盖 |
| `update_figure` | 基于 `base_revision` 对配置做局部补丁更新 |
| `list_revisions` | 列出完整不可变修订历史、备注、操作摘要与脱敏差异 |
| `restore_revision` | 从任意历史版本创建一条新的恢复版本，永不覆盖或篡改历史 |
| `preview_figure` | 按需生成有界分辨率的 PNG 预览图与质检报告 |
| `export_figure` | 默认仅返回 SVG；显式传入 `formats: ["png"]` 或 `["panels"]` 时才生成 PNG 或单系双面板 |
| `get_figure_spec` | 返回可复现配置与源文件 SHA-256 哈希（不含原始未公开树正文） |
| `delete_figure` | 永久删除服务端某图件及其全部历史产物（不影响用户本机源文件） |

---

## 2. 安装与启动

### 依赖要求
- **Node.js 20+**
- **Python 3.9+**（运行受限本地页面与原生辅助进程监管服务）
- **Google Chrome / Chromium**（未安装时可通过 Playwright 自动下载）

```bash
cd mcp-server
npm ci
# 如本机无 Chrome/Chromium，执行：
npm run install-browser
```

### 方式 A：本地 `stdio` 模式（Claude Desktop / Cursor / Windsurf / Codex / Antigravity）

直接测试启动：
```bash
npm start
```

客户端通用配置（替换路径为本机绝对路径）：
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

### 方式 B：Streamable HTTP 模式（推荐用于本机多 Agent 共享与 Agent Skill）

```bash
npm run start:http
```
- 默认端点：`http://127.0.0.1:8766/mcp`
- 健康检查：`http://127.0.0.1:8766/health`

非回环监听（如局域网或反向代理后）强制要求 Bearer 令牌与 Host 白名单：
```bash
PHYLORENDER_MCP_HOST='0.0.0.0' \
PHYLORENDER_MCP_PORT='8766' \
PHYLORENDER_MCP_TOKEN='replace-with-a-long-random-token' \
PHYLORENDER_ALLOWED_HOSTS='mcp.example.org' \
PHYLORENDER_ALLOWED_ORIGINS='https://agent.example.org' \
npm run start:http
```

### 方式 C：Docker 容器运行

在仓库根目录执行：
```bash
docker build -f mcp-server/Dockerfile -t phylorender-mcp .
docker run --rm --init -p 127.0.0.1:8766:8766 \
  -e PHYLORENDER_MCP_TOKEN='replace-with-a-long-random-token' \
  -e PHYLORENDER_ALLOWED_HOSTS='localhost,127.0.0.1' \
  phylorender-mcp
```

---

## 3. 核心环境变量

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PHYLORENDER_BROWSER_EXECUTABLE` | 自动探测 | Chrome / Chromium 可执行文件路径 |
| `PHYLORENDER_PYTHON` | `python3` | 启动 `tools/local_server.py` 所用 Python |
| `PHYLORENDER_OUTPUT_ROOT` | `mcp-server/var/figures` | 私有图件与修订历史存储目录 |
| `PHYLORENDER_MCP_HOST` | `127.0.0.1` | HTTP MCP 绑定地址 |
| `PHYLORENDER_MCP_PORT` | `8766` | HTTP MCP 监听端口 |
| `PHYLORENDER_MCP_TOKEN` | 本机默认空 | Bearer 认证令牌（非回环监听必填） |
| `PHYLORENDER_ALLOWED_HOSTS` | 仅回环 | 逗号分隔的允许 Host 白名单 |
| `PHYLORENDER_ALLOWED_ORIGINS` | 仅回环 | 逗号分隔的允许浏览器 Origin 白名单 |
| `PHYLORENDER_MCP_BODY_LIMIT` | `400mb` | JSON-RPC 单次请求体上限 |
| `PHYLORENDER_MAX_PNG_PIXELS` | `80000000` | PNG 栅格总像素安全上限（不影响 SVG） |

---

## 4. 隐私隔离与验证测试

- 每个图件隔离在随机 UUID 目录下，仅所有者可读写（`0700`/`0600`）；公开接口返回的 `spec.json` 会将原始树正文脱敏替换为文件名、字节数和 SHA-256 哈希。
- 端到端验证命令（在 `mcp-server/` 目录下执行）：
  ```bash
  node tests/mcp-smoke.mjs
  node tests/http-smoke.mjs
  ```

更多完整协议细节请参阅英文原文 [README.md](README.md) 与 [docs/agent-guide.md](docs/agent-guide.md)。
