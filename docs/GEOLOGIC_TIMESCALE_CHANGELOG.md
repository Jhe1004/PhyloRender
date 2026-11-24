# 地质背景完整时间范围（2026-11-06）

旧背景表止于145 Ma，时间轴本身没有90 Ma上限。较古老的树会在左侧留下无地质背景的区段。本次仅替换背景数据与共用绘制接线，不更改树、年龄、HPD、支持率、单位换算或冲突统计。

## 固定来源

- International Commission on Stratigraphy，International Chronostratigraphic Chart，2026/06，<https://stratigraphy.org/ICSchart/ChronostratChart2026-06.pdf>。
- 核验PDF：698578 bytes，SHA-256 `1909daecaf1fc15a8f9d432ea3af4f65f4dc9126a4a6a6b09a030aa71bb67ddc`。原PDF及徽标仅作本地核验，不随软件再分发。
- `core/geologic-timescale.js`人工整理官方名义边界及色块事实；颜色为PyMuPDF 1.26.5读取官方PDF矢量填色后转换的sRGB，不能声称它是出版印刷色的独立规范。绘图区背景使用90%白色混合的浅色。
- 使用名义年龄，不把官方边界误差当作树节点HPD，不伪造年龄精度。表中约数边界保留approximate标记，SVG标题用`~`提示；Cambrian Series 2保留非正式单位标记。
- 白垩纪起点更新为143.1 Ma，古近纪／新近纪边界更新为23.04 Ma。现有浅年代图的相应色界、色彩也会随固定来源更新。

## 显示契约

完整覆盖0–4567 Ma。显生宙上、下两行使用纪／世；元古宙使用代／纪；太古宙使用宙／代；冥古宙保持未细分的宙。SVG逐块记录实际rank，不能把前寒武纪强行称为纪／世。更老的输入或时间轴留白扩展部分使用中性灰色`Outside ICS range`，不外推地质名称，也不因此更改或拒绝原树年龄。

Dating和云树共用同一份数据及`render/time-background`，`render/geologic-grid`仅提取原有框线算法。时间轴单位、默认字号、全称→缩写→省略、色块边框以及既有消缝规则保留。空间不足时省略文字，色块仍保留；不新增外置名称、箭头或图例。相对或未确认时间单位仍只是示意配色，不能据此声称真实年代。MCP报告`geological_timescale`记录版本、来源、范围和层级规则，无背景时为null。

## 验证入口

- `node --test tests/geologic-range.test.cjs`：完整连续覆盖、固定边界、冻结表、层级、超范围策略；修改前反例失败，修改后通过。
- `node mcp-server/tests/geologic-range.mjs [私有证据目录]`：Dating／云树150、250、500、1000、2500、4500、5000 Ma，真实SVG全宽覆盖、文字不越界、配置往返、网页／MCP精确一致及原始树文本保留。传入证据目录时另保存150、250、5000 Ma真实PNG。
- 可选`PHYLORENDER_GEOLOGIC_BASELINE`指向修改前私有源码快照，核验提取框线算法的SVG／PNG逐字节等价，并核验四工作区关闭地质背景时的旧／新输出等价。
- 完整门禁继续执行`node tools/check-project.cjs --integration`。具体实跑结果与平台记录在本地证据目录，文档中列出命令不等于已经通过。
