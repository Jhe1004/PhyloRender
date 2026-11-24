# 云端开发交接

此仓库是当前有效源码的单次基线提交，不是历次导出图和部署压缩包的合集。原 Mac 项目的编号历史文件夹仍保留原地。云端修改应从本仓库创建分支，再用提交记录保存后续历史。

## 目录与快速核验

- `index.html`、`app.js`、`cloud-tree.js`、`conflict-tree.js` 等：网页绘图工作台与四种绘图模式。
- `mcp-server/`：共享网页渲染器的 MCP 服务。进入目录执行 `npm ci`，再运行 `npm test`。
- `tools/local_server.py`：本机网页 API；在 Mac 上运行 `python3 tools/local_server.py --port 8765`。
- `core/phyparts-engine.js`：内置的独立 JavaScript 基因树冲突统计；自动统计、输入筛选与运行边界见 [云树内置基因树冲突统计](docs/01_automatic_phyparts.md)。不需要 Java，也不下载或分发官方 PhyParts。
- `tests/`：仓库根目录执行 `node --test tests/*.test.cjs`。
- `vendor/`：自带字体和 JSZip，含相应许可。
- `23_treePL集成_20260928/05_软件内置组件/`：macOS arm64 treePL 运行组件、上游源代码及许可；见其父目录 README。

## 云端平台边界

`tools/local_server.py` 在 macOS arm64 上使用仓库内置 treePL。在 Linux x86_64 上，它查找系统 PATH 中的 `treePL`。`mcp-server/Dockerfile` 从固定上游源码构建 Linux treePL 和支持 OpenMP 的 ADOL-C。镜像保留源码与许可。2026-10-03 的 Linux 隔离测试和公网测试均完成真实 treePL 计算。部署记录位于项目父目录的 `62_PublicMcpContractDeployment/README.md`。

其他平台仍需单独安装和验证 treePL。未经验证时，基因树云的定年路径应明确报错。软件不能用示意坐标冒充定年结果。关闭基因树云时，物种树与冲突统计饼图可使用相对显示布局。

GNfinder 与 GNparser 的 macOS 第三方可执行文件未提交到 GitHub；完整本机备份包保留它们。云端需自行安装对应 Linux 发行版，或使用页面已有的内置学名格式回退规则。名称识别能力需按部署平台单独验收。仓库内的 `tools/gnfinder/README.md` 与 `tools/gnparser/README.md` 记录版本、许可和上游来源。

`mcp-server/.env.example` 只有占位配置。真正的令牌和部署环境文件必须在仓库外管理。当前 MCP 代码与网页共用渲染器，但 GitHub 提交不会自动更新公网网站或 MCP 服务；分别部署并做健康检查和真实出图验证。
# 交互网页默认启动（审计整改后的当前行为）

各栏目默认均为空白，不自动载入树。`?workspace=phylogeny`仅选普通树工作区；演示需要`?demo=1`。`?phylorender-agent=1`是空白的MCP专用启动。
本机开发可通过 `defaults/cloud-workspace.local.js` 提供预先计算的云树快照；它同时被 Git 与 Docker 忽略，避免提交或发布研究数据。没有该文件时显示云树导入工作台。
