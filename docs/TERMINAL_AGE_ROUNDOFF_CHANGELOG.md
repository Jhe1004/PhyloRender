# 末端零点的浮点残差容差（2026-11-11）

用户确认“这个误差可以让软件设置的更宽松一些”。原始StarBEAST汇总树在约97.53的时间量级上，末端`height`和`height_median`带有约1e-14的正残差；严格`>0`将合格的同时代时间树误拒绝。原数据不应为绘图改写。

## 唯一规则与范围

- `cloud-tree.importedDatedAges`统一计算`rootAge * (64 * Number.EPSILON)`，仅在数值下溢时以最小正浮点数兜底。没有固定绝对时间阈值，没有新增用户选项。
- 容差使用所选整树年龄来源的正根年龄，随Ma、年等单位线性变化；这是约1.42e-14的浮点相对误差预算，不是较大的生物学年龄比例。
- 原始`height`、`height_mean`、`height_median`以及年龄回调的所有末端值均检查，不能通过改来源、回调省略或关闭HPD绕过。任一正值超过容差仍以`TIME_NONCONTEMPORANEOUS_TIPS`拒绝。
- 容差内仅派生`ages`映射的末端视为present（0）；原始树、注释、长度、HPD、身份和原文不改。父子年龄倒置、负值、NaN、无效或冲突HPD等校验不放宽。
- 有接受残差时返回`terminalAgeValidation`及明确warning，记录策略版本、输入单位容差、每个接受末端的最大原值、接受数量、派生末端年龄及源树未改。精确零输入不增加诊断或warning，以保持原有输出。

## 网页与MCP

Dating的`core/time-model.profile`透传该诊断；MCP报告输出`time.terminal_age_validation`。云树导入将同一结果放入现有`importedDating`来源元数据，报告为`cloud.imported_dating.terminalAgeValidation`。网页/MCP共用同一科学校验，不在接口或Skill复制阈值；schema和绘图默认选项不变。图内不添加说明行。

## 验证

- 新反例先红后绿：`tests/terminal-age-roundoff.test.cjs`。
- 原严格拒绝反例全部保留；容差内的原用例按用户确认的新契约验证接受、原值不变及报告，超限用例仍拒绝。原始27样品研究示例字节保留，其微小残差改为正例；默认合成示例不切换。
- `mcp-server/tests/raw-time-annotations.mjs`覆盖两入口、原始输入往返、报告、真实非零/倒置失败后的事务恢复。
- 本地忽略目录保存本轮基线、命令日志、macOS平台和真实输入散列。构建、完整项目门禁及真实MCP重跑的最终结果以实际日志为准，不能把本文件当作已通过证明。

本变更不支持异时采样、化石末端或采样祖先，不更改云树display_alignment解释，不改用户源数据，也不授权推送、提交或部署。
