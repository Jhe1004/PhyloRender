# 默认显示名称保留编号内部下划线（2026-11-02）

用户发现 `Delphinium_caeruleum_2023080906_1` 被画成
`Delphinium caeruleum 2023080906 1`。旧的公共显示函数无差别替换了所有下划线。

`core/sample-identity.baseTipDisplayLabel` 继续作为四工作区的既有公共显示入口，
只将首个含数字的名称片段之前的下划线显示为空格。从这个编号片段开始，
保留后缀中的全部下划线。例如默认显示为 `Delphinium caeruleum 2023080906_1`；
`SRR123456_1` 和 `2021BL017192_run_2` 同样保留编号内的分隔符。
未含数字的名称沿用原有空格规则；这不是对任意名称格式进行通用编号推断。
用户显式设置的显示名称原样优先，不自动改写。

这是显示行为修复。原始树、原始叶标签、exact/conflict/auxiliary 匹配键、
拓扑、枝长、支持率、年龄与 HPD 不变；旧的空格形式别名仍按既有规则解析。
没有增加参数、配置字段或网页/MCP独立算法，也不需要改写输入文件。

直接反例：`tests/sample-accession-display.test.cjs`，先红后绿。
四工作区真实浏览器反例：`mcp-server/tests/sample-name-workbench.mjs`，
检查默认编号、完整SVG属性与文字、显示覆盖、原始科学数据、配置往返及不启动科学计算。
带证据目录运行时保存默认与编辑后的 SVG/PNG。
网页与MCP图件比对使用网页导出的同一份有效配置，不能把网页可能继承的设置
与一份省略参数的全新MCP请求混比；只排除构建metadata，不忽略data属性。

全量回归暴露了新增比对用例的另一个前置条件：前一轮名称控件启动的异步识别
必须已经结束。失败工件中仅三个 `data-name-engine` 属性不同：网页为
`browser-rules`，MCP为 `gnfinder+gnparser`，图形文字、字体和坐标相同。
用例现在等待 `PhyloRenderNativeClient.activeCount===0`，明确完成本次真实名称
识别与重绘后再比较。两边使用同一识别环境；来源字段及科学metadata全部保留，
可选识别工具的生产回退机制保持现有契约，不承诺不同识别来源的SVG字节相同。

本轮日志与图件保存在 Git 忽略的
`mcp-server/var/sample-id-underscores-20261102/`。以实际退出码为验收依据；
不将本机测试写成其他平台验收或公共部署。

最终验收：macOS 26.5 arm64。直接反例先失败、修复后通过；401项JavaScript、
15项状态／接口及27项Python测试通过；`node tools/check-project.cjs --integration`
完整退出0。实际SVG/PNG、四工作区同配置精确比对、科学metadata及原始输入保护均通过。
构建ID为 `2a313814c0cf0ef00f0cdb31ba38b193e45bb6442485e283ee8eff2bda96f8e3`。
本机共享MCP已加载此构建，709个历史图件／来源文件校验值不变，旧服务8个所属进程
全部退出。未提交、推送或部署公网，未重测Linux/Docker/Windows。
