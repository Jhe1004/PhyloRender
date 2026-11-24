# 2026-10-05 审计整改开发版

当前阶段为78。保留既有0.8.0包版本作为开发基线，以生成的build_id唯一标识源码；这不是新的公开发行版本。

## 不兼容变化（防止静默产生错误图）

- 单树入口拒绝多树Nexus；用户先明确选择或用适当软件生成汇总树。内置历史测试选择第一棵是夹具定义，不是用户入口。
- Dating与已定年云树使用同一整树年龄模型；非零末端年龄、倒置年龄、所选字段不完整会报错，不再静默修补。
- PhyParts自动尺度识别遇混合0–1/0–100报错；手工计数必须为非负整数且满足守恒。
- 未定年ML树的任何非根缺失枝长都不能补0后进入treePL。
- MCP update_figure必须base_revision；高成本新建使用start_figure_job与idempotency_key。
- 多个HTTP/stdio服务不能共享同一输出目录写入；优先共用本机HTTP服务，或分别指定PHYLORENDER_OUTPUT_ROOT。
- 本机原生服务只接受回环Host、同源请求和JSON。file://仍可纯前端绘图；原生计算请从本机HTTP网页进入。
- 可选学名识别并发最多1项，不能占满2个本机请求名额而阻断基因树计算；新增真实导入回归及确定性并发反例。

## 科学解释

基因树与物种树共有类群的年龄约束仍保留，但明确为display_alignment，不是独立的基因共祖时间估计。
treePL所用合成numsites、固定smooth/seed及二进制指纹随结果记录。用户提供真实单位不等于软件验证了校准设计。

## Agent必读顺序

AGENTS.md → PUBLICATION_POSITIONING.md → docs/DEVELOPMENT_STANDARD.md → 本次需求相关模块/反例。
禁止先对万行app.js做大范围机械重构，再只用一张截图验收。

## 运行能力与发布

phylorender://capabilities和HTTP /health包含原生组件可用性探测；available表示已安装，不表示真实分析或大数据压力测试通过。
已提供本机macOS验证，不宣称Windows/Linux全矩阵已验证。CI配置是未来提交后的自动门禁，本轮没有远程运行CI。
许可门禁仍阻断公开发行；现有共享服务、公网、GitHub和个人Skill未替换。
