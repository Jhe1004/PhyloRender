# 开发架构、验收与AI交接

## 当前入口与部署边界

本文件所在仓库是111号GitHub私有仓库正式开发基线，所有路径相对仓库根，功能内容继承110号验收源码；111号以前的历史阶段只读保留，后续不再创建新的编号源码阶段，直接使用Git分支、提交、PR和标签管理版本。详细行为见docs/110_READABLE_TIP_DEFAULTS_CHANGELOG.md；GitHub分支、提交与审查要求见docs/GITHUB_DEVELOPMENT_WORKFLOW.md。此前科学、稳定性及绘图契约全部保留。
启动：`python3 tools/local_server.py --host 127.0.0.1 --port 8765`。端口占用时选择8765–8774中可用者，以终端输出URL为准。
大文件和基因树集合必须通过本机HTTP启动器使用 Worker；内置基因树冲突统计直接在专属 Worker 中运行，treePL 仍需要本机HTTP服务。直接打开index.html时仅允许小型单树的受限兼容回退。MCP：`npm --prefix mcp-server run start:http`。
共享服务是否重启由用户决定，改文件不会替换已运行进程。
默认不加载树；?workspace=time等只切换工作区，?demo=1才是显式演示。

## 依赖方向

|层|责任|禁止|
|---|---|---|
|core、cloud-tree、tree-rooting、conflict-tree|纯科学模型、统计、时间、几何|访问DOM、用CSS决定统计|
|figure-contract|默认值、单位、能力边界|网页/MCP各一份缺省含义|
|app、index、styles|中文工作台、英文图文、导入事务|静默改科学数据|
|ui/sample-names|明确元素的名称工作台；调用名称操作接口|全局查找控件、持有整份state、直接发原生请求|
|ui/numeric-controls|通过显式DOM端口把有界数值参数统一成减号／输入／加号，并同步历史控件|改变参数范围、步长、单位、默认值或科学含义|
|agent-bridge|语义配置、报告、同源渲染|另写一套绘图算法|
|MCP store/jobs/runtime|并发、版本、幂等、生命周期|无界任务、半成品发布|
|本机API|受限原生引擎调用|暴露项目目录、拼shell、无超时|

app.js仍有历史性大体量。78/80阶段抽出时间模型、分析身份、HTTP策略和任务状态机；82阶段进一步抽出样品身份、学名样式、树坐标、标签几何、文档状态、协作调度和节点标签排版。
83阶段再抽出纯时间显示模型、Dating/云树共用时间背景，以及Dating树和时间节点标签渲染。控件读取、年龄验证、导入原子提交和中文状态反馈仍在适配层；旧函数只委托，不能复制回算法。

Dating渲染器不得复用普通树的支持率呈现。时间图只组合节点年龄与可选其他节点数字；posterior/bootstrap等支持率可以保留为输入审计信息，但不得进入标签、节点标记或满支持率粗枝。Dating界面隐藏支持率上传、精度、阈值、满值和支持率圆点控件；MCP time配置拒绝support_trees。
84阶段继续抽出云树枝线/私有缓存、饼图及完整占位搜索、整体组合渲染。它们只读科学模型切片并操作传入SVG；样式使用本次快照。隐藏或时间过滤不可改变布局占位与统计，取消不可提交缓存。导入/定年/统计、菜单、原子事务和反馈继续归适配层；公共名称/分组回调仍是后续待拆边界。
85阶段再抽出双树枝线、支持率协作避让和组合呈现。支持率分类由适配层调用共用support-values按所选字段、量纲及显示精度生成，绘制只读快照；完整诊断返回后才提交到当前文档。量字、名称、字体应用和字号下限同步仍由明确回调接入，不宣称它们已经完全无状态化。
86阶段再抽出样品名称操作与名称工作台。原始身份验证仍唯一复用sample-identity；GUI与桥接的旧改名入口只委托同一名称操作。字体识别、字体加载、量字和名称排版内容仍属于明确的待拆边界，不因抽出控件就宣称整个名称系统完全解耦。样品上下间距继续走已有共用数值与密度规则，本轮不另建引擎。
110阶段将样品名称的可读默认值收口到figure-contract：普通树和双树冲突图15 pt，Dating树和基因树—物种树冲突图18 pt；四工作区默认自动字形间距。app只负责测量实际字形并调用共享间隙函数，MCP不得另算一套。密集树通过减小字形之间的空白压缩，不通过缩小文字；节点标注避让不得放大样品行距。显式字号或手动间距继续覆盖默认值。
后续模块边界、明确可变数据和下一步迁移顺序见 [MODULAR_ARCHITECTURE.md](MODULAR_ARCHITECTURE.md)。采用小步迁移和等价测试，不一次重写后只看截图。

2026-11-11，用户将自动行距的目标改为整图协调：普通树、Dating和云图在auto模式优先高/宽1.25，适量增加真实行距；最大3 em及既有72 px上限，80–120样品平滑回到原紧凑基线。已高于目标的图保持紧凑，极少样品允许自然比例，双树不增加竖向舒展。字号、名称、原树及科学数值不变；手动行距和明确比例优先。唯一计算在figure-contract.planAutomaticRows，渲染器只传入本次实际高度、行数及字体快照，见AUTOMATIC_PORTRAIT_LAYOUT_CHANGELOG。

## 科学范围与决定

组名默认字号在普通树、Dating和云树中动态跟随当前样品名字号 +3 u，
唯一计算在 figure-contract.resolveCladeTypography。网页 checkbox 与
typography.clades.follow_tip_size 无损往返；明确字号但没有标记的旧配置
保留固定值，明确分段字号也保留。双树继续没有此参数。模式切换、字体
重置和失败回滚要一并保留自动／手动状态，见 CLADE_RELATIVE_SIZE_CHANGELOG。

- 仅支持同时代末端时间树。异时采样和非零末端年龄暂不扩展，检测后明确拒绝；采样祖先不纳入支持或开发计划。失败保留原始输入和上一有效图，不能归零、补枝或剪节点。普通ML树的非超度量枝长不属于这种时间模型限制。
- 末端零点按2026-11-11用户确认允许正根年龄×64×Number.EPSILON内的浮点残差。原始数值不变，派生显示使用present且在MCP报告记录容差、接受末端及原值上界；超限、负值、无效年龄和倒置继续拒绝。精确零输入行为和报告不变，详见TERMINAL_AGE_ROUNDOFF_CHANGELOG。
- 多树Nexus先选择/汇总；绘图入口不完成burn-in、MCC或后验推断。
- 共有类群年龄相等用于图形对齐，不是基因谱系共祖时间等于物种分化时间的证据。
- 内置treePL接口仅display_alignment：numsites=100000000为合成显示参数，smooth=100、seed=1固定。
  不是用真实序列长度、交叉验证平滑、化石先验设计的通用分子定年接口。
- 云树保留上述现有做法，不增加独立年代推断或另一套独立年代叠绘模式。2026-11-02用户确认的完整范围见[PRODUCT_SCOPE.md](PRODUCT_SCOPE.md)。
- 用户根/冠群年龄是输入约束，不是软件验证过的化石校准；单位和未确认状态保留。
- 基因树冲突统计由独立 JavaScript 引擎实现；统计定义引用 Smith et al. (2015)，不把 PhyParts 方法声称为原创，也不把本引擎称为官方 PhyParts。

## 状态与任务

导入候选 → 验证 → 计算 → 原子提交 → 呈现；失败恢复上一有效模型。
Dating树的中文工作台将这条流程明确显示为两步：先“导入树”，再“确定时间单位和年龄来源”。两步必须在同一导入栏目中有序出现；用户从该栏目成功选择文件后，栏目保持展开，步骤2直接可见。普通栏目进入页面时仍默认收起；界面重组不得更换控件ID、导入事务或数据含义。
所有可直接调整的有界数值参数统一使用“减号／数字输入／加号”，单位紧邻标签或输入值；不再显示重复滑块、当前值和“精确输入”。允许空白且空白具有业务含义的年龄边界仍用普通数字输入，不强行加步进器。可展开帮助统一用问号，普通说明统一用hint；错误仍必须是可见alert，不能为了外观统一而降级。
编辑：inspect → revision → 带base_revision提交 → 新revision；冲突时重新读取，不能自动覆盖。
长任务：start_figure_job → queued/running → succeeded/failed/cancelled。cancelling需继续查询。
已原子提交的结果可以先于迟到的取消完成，成功图不会被取消操作删除。
treePL和名称辅助程序受独立进程监护器管理；主动取消先停止其专属进程组，再确认终态。服务强制退出时控制管道 EOF 触发同样回收，不信号其他用户进程。基因树冲突统计在独立 Worker 中运行，取消或超时直接终止该 Worker。
treePL单棵最多30秒、单批总计300秒；基因树冲突统计最多300秒。原生任务30秒没有所有者轮询会取消；名称任务另有客户端10秒/服务端60秒时限。取消不是瞬间完成，必须继续等待终态。
网页导入总时限600秒，普通输入 Worker最多120秒，冲突统计 Worker 最多300秒；大型解析、基因树筛选与统计不得放回主线程。普通/Dating导入使用同一渲染生成器协作让出执行权，不按耗时改变布局算法。
具体硬性拒绝边界及回收保证范围见 docs/STABILITY_POLICY.md。旧同步API仅保留兼容，有原生时限/服务崩溃保护，但没有任务编号及断连租约；新网页/MCP禁止使用这些旧接口进行长计算。
本机服务同时接纳2个计算/body请求；可选学名识别最多占其中1个，避免快速换树时挤占核心计算。超额请求明确返回可重试的429，不无限排队。
渲染总时限600秒、队列最多8项；图件任务结果保留1小时、最多64项。
超时不拿部分基因树冒充完整分析；更大任务应设计分块恢复，而不是无限加上限。
重启后中断图件任务标记PROCESS_INTERRUPTED，不自动恢复原生计算；重新提交用新幂等键。
同一输出目录只允许一个服务进程写入；HTTP/stdio 启动强制获取 `.writer-lease.json`，第二个写入者拒绝启动。
崩溃遗留租约不自动删除：核对记录的主机/PID已停止后才可人工清理；多个本地agent优先共用HTTP服务。
这不是互不信任的多租户隔离；多租户仍需要身份、所有权与配额。
用户于2026-11-02决定将多租户隔离放在最后阶段处理，现阶段不实施；完成前仍按同一可信研究组部署，不提前承诺陌生用户间的数据或资源隔离。

## 验收矩阵

|检查|命令|
|---|---|
|模块边界、旧文件体量、加载及打包覆盖|node tools/check-module-boundaries.cjs|
|纯逻辑、科学反例、并发、Python、schema、构建|node tools/check-project.cjs|
|完整浏览器/MCP、配置往返、审计反例|node tools/check-project.cjs --integration|
|四工作区名称事件、批量原子性、原始模型及同源渲染|node mcp-server/tests/sample-name-workbench.mjs EVIDENCE_DIR|
|云层分组颜色、实际GUI分组／颜色事件、六组网页MCP全属性一致|node mcp-server/tests/cloud-group-colors.mjs|
|云层抖动、实际滑块、配置往返、24组网页MCP全属性一致|node mcp-server/tests/cloud-jitter.mjs|
|地质年代全称／缩写实测适配、过窄文字省略、无相邻碰撞、单次不透明边框、Dating网页／MCP一致|node mcp-server/tests/time-typography.mjs|
|固定ICS来源、0–4567 Ma连续背景、前寒武纪实际层级、超范围中性色块、Dating／云树网页与MCP精确一致|node mcp-server/tests/geologic-range.mjs|
|云树上下时间轴、过窄文字省略、无相邻碰撞、与Dating共用年代栏边框|node mcp-server/tests/cloud-time-background.mjs|
|真实大文件最大抖动及取消恢复（需指定真实夹具目录）|node mcp-server/tests/cloud-jitter-stability.mjs|
|四项缺陷：配置无损往返、真实键盘标题、英文图例、HPD预检与回滚|node mcp-server/tests/acceptance-defects.mjs|
|四工作区全部标签页数值控件、帮助提示及1440／820／390视口|node mcp-server/tests/ui-consistency.mjs EVIDENCE_DIR|
|解析身份、整套配置回滚、取消/超时/忙碌保护及四模式公共错误|node mcp-server/tests/acceptance-urgent.mjs|
|科学专项（treePL需当前平台可用；冲突统计内置）|node tools/check-project.cjs --native-science|
|源码与构建指纹一致|node tools/build-manifest.cjs --check|
|schema由当前代码生成|node mcp-server/scripts/generate-schema.mjs --check|
|发布许可门禁|node tools/check-release.cjs|

字体、布局和统计分别测试。不能把截图像素一致当成唯一科学标准；
文字、坐标、拓扑、时间、分母必须可追溯，字体/系统差异在结果中可见。
小合成树通过不等于13,797棵真实基因树压力测试完成；该验收应独立编号并测峰值资源。
配置导入测试必须先记录旧画布、原始模型与完整导出配置，再上传失败反例；失败后在请求新重绘之前核验画布，之后核验模型与导出。只弹出错误或只看屏幕仍像旧图不能证明事务成功。旧/新调用方共享解析器时，拓扑指纹相等也不能证明样品名读取正确；原始叶节点 label 必须有独立预期。
架构迁移还应运行 `node mcp-server/tests/modular-equivalence.mjs BASELINE_ROOT EVIDENCE_DIR`，显式传入本轮只读基线。该脚本忽略SVG构建metadata，比较所有图形属性、文字、顺序及真实PNG。不得把“新网页与新MCP相等”冒充“新旧版本相等”。

## 交接模板

需求与不变量；模块改动；行为变化和迁移提醒；命令与退出码；新增反例；
图件/报告链接；build_id；不支持/未验证内容；部署状态。
审计关闭必须有测试或硬性拒绝策略，不可只写“已解决”。

当前绘图尺寸规范：整图（包括双树整体）固定宽1000单位。figure-units是唯一u/旧设计坐标转换边界；网页显示、MCP schema、配置往返、手动标注位移、混合分组字号和导出必须一致。*_pt和旧像素字段只作固定参考换算兼容。内部设计坐标不受毫米或DPI影响，SVG导出统一投影到1000宽；线条随图幅缩放。印刷宽度0取400 mm（双树800 mm），显式毫米只改物理大小；横向拉伸不能改变整图单位基准。宽高比增加高度时保留内容；内容过高时以可读性优先。门禁包括mcp-server/tests/drawing-units.mjs、physical-units.mjs以及完整integration。

## 发布前审计补充契约

支持率量纲按来源／列确定，0/1 歧义须显式声明。2026-11-02用户确认：满支持绘图按当前显示精度舍入后的各列满值判断，“保持原值”仍按原值；低支持率阈值及冲突统计不受显示舍入影响。原始支持率不改写，缺失来源不能算满支持。见 [SUPPORT_ROUNDED_FULL_CHANGELOG.md](SUPPORT_ROUNDED_FULL_CHANGELOG.md)。时间注释在进入数值目录前由 tree-input 读取原始条目，禁止无效字段回落。模块边界、错误码和 stdio 限额见 [PUBLICATION_AUDIT_CHANGELOG.md](PUBLICATION_AUDIT_CHANGELOG.md)。新增直接回归：`tests/support-scale-batch.test.cjs`、`tests/support-values.test.cjs`、`tests/raw-age-annotations.test.cjs`；真实入口回归：`mcp-server/tests/support-scale-display.mjs`、`mcp-server/tests/raw-time-annotations.mjs`。

分组名称默认auto：对齐组名优先整体旋转90°，重叠则错列；nearby普通树利用已有横向空隙并避让样品名。旧配置明确横／竖方向不覆盖。几何只在core/clade-layout中计算，方向切换不启动科学引擎；自动意图必须无损往返。见AUTO_CLADE_ORIENTATION_CHANGELOG。

用户于2026-11-04更新显示规则：以本图已显示样品名自然字形宽度的中位数为参照，上限为中位数的1.25倍，替代旧0.8/3画布比例；偶数取中间两项均值，双树合并两侧名称。只横向压缩超限字形，保持高度、全文和身份，短名称不变。四工作区共用figure-contract及render/tip-width；分组、连线和避让读取压缩后的边界。不得改成缩字号、换行或截断。
