# 模块边界与后续扩展：AI agent 必须遵守

## 目的和当前边界

本次采取保留算法的小步拆分，不重写科学方法。目的是让名称、身份、几何和状态的修改有明确归属，并使跨功能风险在测试阶段暴露。
82阶段主文件从10,207行缩至8,418行；83阶段再缩至7,946行；84阶段为7,604行；85阶段为7,149行；86阶段为6,967行。时间树、共用背景、云树和双树呈现，以及样品名称操作与工作台已分离，但仍然有历史性的其他工作台适配、公共名称/字体回调及导入协调。不能宣称整个软件已经完全解耦，也不能将模块数当成质量保证。

## 依赖方向

云图图例的新图默认位置由 figure-contract 唯一声明为 lower-left；桥接读取此缺省，网页初始选项与之对应。cloud-tree 原有各位置的避让算法不变，显式旧配置保留原位置；图例移动不进入科学缓存身份或触发计算。见 CLOUD_LEGEND_DEFAULT_CHANGELOG。

`core/gene-rooting` 通过 create({identity,input,rooting}) 接收明确依赖，负责验证物种树现有根一侧的显式外群列表、核验基因树已出现外群的完整分支及派生边定根。物种树只读，不猜测多外群，不剪样品。cloud-tree 保留兼容委托，批次准备在 Worker 中复用同一实例；外群列表进入科学缓存键。详见 MULTIPLE_OUTGROUPS_CHANGELOG。

原生构建工具独立于浏览器模块：`tools/build_treepl_macos.py`编排固定源码的离线构建，
`tools/openmp_build.py`只负责OpenMP及共用CMake源码的构建；`tools/native_build_support.py`
负责完整预检后解压、受管命令收据及副本链接路径处理。三者通过`build_tools`清单单独限制体量，
不导入应用服务器、不进入浏览器加载顺序，工具本身不激活产物。
当前macOS分发包在`vendor/native/macos-arm64/`，缺失不回退到历史23阶段；三个文件和清单
均进入构建指纹。HTTP白名单拒绝原生库及构建工具。Docker保留对应源码和构建步骤，Linux
运行时仍使用独立构建的Linux程序。历史阶段保持只读。完整许可、两次独立构建及受管计算
边界见`docs/NATIVE_BUILD.md`和`docs/REPRODUCIBILITY.md`。

`render/png-raster.js`是网页、MCP整图、预览与面板共用的栅格转换入口。显式接收SVG、尺寸、
比例、DPI、上限及浏览器原语端口，不能读取应用state、查控件或修改SVG/科学输入。
统一CPU偏好Canvas、物理像素一次取整与白底填充；范围来自figure-contract，DPI元数据归figure-units。
网页在canvas-finalizer后加载，MCP私有页面只加载同一模块；HTTP的render白名单、Docker COPY
及构建指纹均覆盖。取消与失败释放临时Blob，旧revision既有图件补生成前先精确验证。

```text
网页控件 / MCP语义配置
         ↓
app.js：历史兼容适配器，读取选项并提交结果
         ├── document-state：新建文档、完整快照与恢复
         ├── sample-identity：原始样品身份与一对一匹配
         ├── tree-order：四工作区共用的阶梯化、同数分支排序和可见样品行计数
         ├── figure-report：四工作区共用的输出尺寸与字体可移植性报告字段
         ├── sample-name-state：当前文档名称字段的原子验证和操作
         ├── ui/sample-names：具体元素的名称控件与实例监听器
         ├── ui/numeric-controls：显式DOM端口下的统一数字编辑器与历史控件同步
         ├── name-format：学名文字片段，不参与身份匹配
         ├── tree-geometry：树的派生坐标与显示诊断
         ├── tree-panels：长树最多拆两张，第二张保留完整单系分支
         ├── clade-hierarchy：嵌套分组拓扑层级、线型推导与对称闭合虚线几何
         ├── clade-layout：分组竖条列分配、标题避让与层级对齐
         ├── label-geometry：碰撞、箭头、候选位置和罚分
         ├── geologic-timescale：冻结的官方年代边界、层级、配色及来源
         ├── time-display：显式接收年代数据，处理单位、字号、范围
         ├── geologic-grid：显式SVG端口绘制统一年代栏外框与分界线
         ├── time-background：Dating/云树共用时间轴与地质背景
         ├── time-tree：时间枝、HPD、名称和时间节点标签
         ├── cloud-branches：显式年龄/行坐标画树，实例私有行缓存
         ├── cloud-pies：饼图、隐藏点、图例和完整占位搜索
         ├── cloud-tree：共用背景、云层、物种树与饼图组合
         ├── conflict-branches：显式坐标、分组色及支持率分类画树枝
         ├── conflict-support：快照字号、几何、支持率协作避让与标记
         ├── conflict-tree：双树、实测名称边界、连线及完整诊断
         ├── canvas-finalizer：四工作区完成标题、图例和标签后的统一实测画布收口
         └── node-label-layout：由端口提供必要选项与渲染操作
                         ↓
                 render-scheduler：同一生成器的协作执行
```

MCP仍通过agent-bridge调用相同浏览器应用、模块和渲染器，不产生第二份布局算法。
纯模型不能反向引用app.js、agent-bridge、DOM或控件。渲染模块可以操作传入的SVG元素，但不能自己寻找工作台控件或读取应用单例。

## 逐模块契约

|模块|输入和输出|允许修改的内容|禁止|
|---|---|---|---|
|figure-contract|工作区、样品数、字号及显式配置 → 默认值、可读间隙和单位转换|只创建新配置；冻结默认策略|读DOM或state；网页/MCP复制默认常数；节点标注反向扩大样品行距|
|sample-identity|原始名称、树、显式映射 → 键、对齐、显示改名表|不改树和输入名称|按斜体/显示改名决定科学匹配|
|tree-order|只读树、阶梯化方向与显式身份键 → 末端顺序、树副本内姐妹分支旋转、可见行数|只允许改变渲染副本的姐妹分支次序；同样大小时按同一身份键稳定排序|改变无根拓扑、修改科学原树、各工作区另写同数分支规则|
|figure-report|物理输出、画布、布局和字体快照 → 共用报告片段|只创建报告对象|读DOM、改SVG、按工作区删改同名字段|
|sample-name-state|当前名称字段读写端口、sample-identity → 复制快照、原子覆盖、删除/清空|仅限定名称字段及识别缓存失效回调|DOM、树、整个state；用显示名替换身份|
|ui/sample-names|具体元素、名称操作、限定呈现/识别回调 → 控件、对话框和监听器|传入控件、名称操作；绑定可dispose|全局查DOM/state、直接原生计算、改科学树|
|ui/numeric-controls|显式DOM端口、控件清单、单位和回退值 → 统一步进器与刷新接口|创建表现控件；同步原有range/number事件|自行查全局DOM/state；改变范围、步长、默认值或配置字段|
|name-format|文字、识别结果 → 斜体/正体片段|仅新建样式片段|改输入文字、树或身份|
|tree-geometry|渲染树及布局参数 → 统计/坐标映射|treeStats/assignCoordinates只写派生depth/distance/x/y；调用者必须传渲染副本|改变原始length/support/children拓扑|
|tree-panels|已定根树、阶梯化方向、末端统计及复制端口 → 一张完整树或两张树计划|只改渲染副本；第二张复制一个完整内部节点子树；第一张以英文占位末端替换该子树|递归拆分第三张；裁切单系分支；移动外类群到第二张；修改原树|
|clade-hierarchy|分组集合或树、显式tier/bar_style设置 → 严格包含单调层级、生效线型及端帽闭合dashArray|只创建纯结果；提供分组Map清理辅助|访问DOM、全局状态、修改科学树或改变样品身份|
|clade-layout|分组框几何、文字尺寸、对齐策略与层级端口 → 列坐标、文字方向与实测间距|只创建新布局对象；多层分组锁定同层括号严格共线、保持全竖排文字并在同层冲突时仅向右错开文字槽位|读控件、写树、让内层分组跨到外层列之外或拆散同层列|
|label-geometry|数值、矩形、线段、显式画布范围 → 候选及罚分|新建几何结果|读控件、调用原生引擎、改变字号规则|
|document-state|显式初始化参数/完整快照 → 独立文档|创建新Map/Set；恢复声明的文档字段|快照包含DOM派生排版、部分字段先提交|
|ui/import-state|完整模型读写、具体控件/标签、辅助状态、同步和协作重绘端口 → 可重复恢复快照|限定模型/控件恢复；派生画布重新生成|全局查DOM/state、自行开启科学计算、吞恢复失败|
|figure-input-validation|配置与已知字段/选项/工作区集合 → 工作区或拒绝|只读结构验证|修改模型、调用渲染、把结构检查冒充完整科学验证|
|render-scheduler|生成器、AbortSignal、时钟/暂停/进度回调 → 最终结果|推进和关闭该生成器|取消其他任务、改变算法迭代次序|
|node-label-layout|明确端口和当前标签 → SVG、排版结果|布局矩形、传入SVG、人工位置及结果回调|读取整个state、$、document或重新计算科学统计|
|geologic-timescale|显式Ma范围 → 只读年代区间及来源|冻结表；超范围返回中性区间|推断年龄、读取文件/DOM/网络|
|time-display|显式年代表、单位/字号/范围 → 换算及显示设置|只创建新结果；地质配色表冻结|推断或重算年龄、改变原始范围、读控件|
|geologic-grid|SVG工厂、区间几何、行尺寸 → 年代栏框线|追加到传入SVG|读取状态、计算年代、改变坐标|
|time-background|SVG工厂、量字回调、刻度函数、显示模型、框线端口；显式单位/字号/尺寸 → 背景SVG|追加到传入SVG|另建时间模型、改字体大小、读工作台|
|time-tree|已验证渲染树、profile、样式快照、当前文档集合、明确端口 → SVG及计数|派生x/y/displayNodeLabel、当前人工位置、传入SVG、publishGeometry|修改length/timeAge/HPD/children、定年、读控件、整份state|
|cloud-branches|显式树、年龄、行坐标、颜色 → SVG线条及线段、行坐标|传入SVG；实例私有WeakMap缓存只在搜索完成后提交|写树/年龄/颜色；跨工厂共享缓存；改变搜索顺序|
|cloud-group-colors|已对齐科学树、主树有效色快照 → 祖先索引与基因颜色Map|仅新建派生索引和颜色Map；逐节点yield|DOM、科学写入、显示名／跨树ID匹配、多数归色、RGB合并分组、持久缓存|
|cloud-jitter|已验证树、年龄/行坐标与显示参数 → 可复现枝线路径Map|仅新建快照、视觉种子和路径；逐节点yield|DOM、科学写入、节点位移、横向时间扰动、随机重画、持久缓存|
|cloud-pies|四类统计、完整节点位置、范围及隐藏集合 → SVG饼图、图例、计数|传入SVG和新建几何结果|改变统计；隐藏后删布局占位；读控件或触发计算|
|cloud-tree|已验证模型切片、样式快照、时间背景及限定端口 → SVG及计数|传入SVG、派生分组视图和publishSize|改科学树/年龄；整份state；菜单/导入事务/科学计算|
|conflict-branches|节点、位置、颜色、支持率分类 → SVG树枝及线段|传入SVG、新建线段|修改原节点、匹配身份或重新分类支持率|
|conflict-support|条目、字号/半径/箭头/画布快照及量字端口 → 生成器排版、诊断和SVG|局部候选、传入SVG；无持久化缓存|控件、整份state、重选字段、同步穷举绕过取消|
|conflict-tree|prepared只读模型、原主树、颜色/样式/名称切片和限定回调 → SVG及完整结果|传入SVG、新建几何和publishSize；commitFontSettings只回写界面字号下限|写prepared/原节点、主树重排、科学输入修补、事务回滚|
|canvas-finalizer|SVG、初始尺寸、完整内容边界、工作区上限 → 最终width/height/viewBox|只更新传入SVG和背景尺寸，并通过显式端口发布最终尺寸|裁切文字、缩小字号、改变树坐标、越过40/80厘米上限|

同名旧函数目前保留为短委托，保证已有工作台和桥接入口兼容。不得在旧委托中再复制算法。

107阶段把分散在app中的数字控件适配迁入`ui/numeric-controls`。原有input/change事件仍是唯一参数提交入口，新模块只统一呈现并转发事件；隐藏的历史range继续作为兼容数据源。允许空白表示“未设置”的年龄上下界不进入步进器，以免把空白错误改成0。

110阶段把样品名称的可读默认策略集中到`figure-contract.tipReadability`和`automaticTipGap`。普通树／双树冲突图默认15 pt，Dating／基因树—物种树冲突图默认18 pt；所有工作区自动间距默认开启。app只能提供浏览器实测字形高度，再加共享规则返回的可见间隙；MCP仍通过同一个页面渲染。节点标注布局只移动标注本身和引导线，不能参与样品中心距计算。用户显式字号、显式手动间距及各工作区独立状态仍为最高优先级。

## 2026-10-29 四工作区公共策略收口

本轮不是把四种图强行改成同一种图，而是把它们重复使用的基础规则集中到一处。科学专用逻辑继续留在各自模块：Dating年龄与HPD、云图四类冲突统计与时间对齐、双树对应和支持率布局都没有搬进公共层。

- `core/tree-order.js`是阶梯化和可见样品行计数的唯一公共入口。普通树、Dating树、云图和双树在姐妹分支末端数相同时，统一按规范化原始样品身份稳定排序。双树左右并排，自动行距按两边较大的可见行数计算，不能把两棵树的样品数相加后错误压缩。
- `core/sample-identity.js`明确区分`exact`、`conflict`和`auxiliary`三种身份策略。显示改名、斜体和分类等级格式仍不能参与科学匹配；调用者必须声明策略，不能在各工作区临时猜名字。
- `render/canvas-finalizer.js`在标题、图例、分组名和末端名全部进入SVG后统一实测并收口画布。普通树、Dating树和云图上限为400 mm，双树为800 mm；超限返回明确错误，不裁字。
- `core/figure-report.js`统一输出尺寸和字体可移植性报告字段，网页与MCP不再为不同工作区拼出形状不同的报告。
- `figure-contract.js`现在声明每个工作区真正支持的配置。四工作区统一使用`options.layout.ladderize`和`options.layout.tip_order`；旧`cloud.ladderize`、`conflict.primary_ladder`和`conflict.primary_order`只作导入兼容，并立即规范化。显式传入当前工作区不会使用的参数时必须报错，不能表面接受却悄悄忽略。
- 共用的`layout.branch_width_pt`在云图中现在实际控制基因线和物种树线宽；双树渲染不再覆盖用户选定的末端名称和节点字体。

公共层只能统一“所有图都必须做的事”。任何年龄解释、冲突统计、基因树筛选、两树定根或支持率语义变化，仍须在对应科学模块中单独提出、测试和审查。

正式Git开发阶段新增`tree-panels`作为长树拆图的唯一决策模块。普通树和Dating树超过阈值时只允许拆一次；第二张必须是从最终定根、阶梯化后的显示树复制出的完整内部节点子树。第一张保留外类群和其余拓扑，用英文占位末端指向Panel 2。网页按钮、agent bridge和MCP都读取同一计划；不得恢复按纸张递归分页或另写MCP拆分算法。

## 文档状态与生命周期

默认组名字号由 figure-contract.resolveCladeTypography 显式读取
typography.tips.size_u 与 clades.follow_tip_size，创建新配置并仅派生
clades.size_u=样品字号+3 u。physicalOptions 将没有标记的明确组字号
归为固定模式；MCP store 和 bridge 在同一共享函数解析后才提交。
网页 clade-font-auto 为当前模式的呈现控件，cladePresentationByMode
快照保存 followTipSize，完整导入事务继续捕获该控件；不新增未声明的
根状态或第二个字号字段。applyTypographySettings／getOptions 前同步
原字号控件，数值编辑关闭自动，普通字体变化不触发科学计算。

`createDocument`每次生成全新的根对象、Map、Set和嵌套状态。根对象seal，以便新增未声明字段尽早报错。
`capture`和`restore`只处理文档模型，排除labelPlacements、branchSegments、currentLayoutInfo；这些由渲染重新生成。
恢复前验证快照键集合完整，验证失败时不得部分写入。恢复重新克隆，不能消耗或污染快照。
控件快照、服务请求和任务所有权仍由现有导入事务协调；本次没有把所有生命周期字段都迁进状态模块。
90阶段把模型与控件的快照/恢复整理到 ui/import-state；app 仍是唯一事务协调者，agent-bridge 的整套配置入口必须加入它。桥接私有分组ID、人工标签、根报告和云分析缓存由显式辅助快照端口保留。每次恢复重新生成派生画布，并传播失败，不能静默返回旧画布和新模型的混合状态。figure-input-validation 只做纯结构检查，后续树与数据的科学校验仍在同一外层事务内，不代表新建了完整离线候选文档模型。
嵌套cloud/conflict字段目前为历史兼容保留可扩展对象，不能误称为完全类型安全。后续先列举所有写入者，再以分工作区操作接口逐步替代。

## 渲染端口

Dating数字标注的候选位置统一委托普通树的`label-geometry.candidatePlacements`：使用同样的距离档、分支空隙搜索和候选顺序，仅按时间绘图区裁定允许位置。`time-tree`须传入本次真实枝条线段，不能另建时间图专用的环形搜索。年龄文字组合、HPD与时间范围筛选仍属于Dating模块；公共评分与最终整理继续复用`node-label-layout`。普通树现有放置标准保持不变。

节点标签排版工厂需显式提供：geometry、readContext、readOptions、svgEl、nodeLabelInkRect、appendNodeLabelArrow、enableLabelDrag、formatSupportValue、nodeLabelFontSettings、countResidualCollisions、updateLabelWarnings、publishPlacements、publishCollisions、mapRenderSteps。
`readContext`只暴露manualLabels/currentSvgSize/branchSegments，`readOptions`只暴露autoLabels/leaderLines/nodeRadius。模块不得要求返回整份state。
`publishPlacements/publishCollisions`由适配器决定写到哪里。几何函数需要画布和箭头开关时，必须作为参数传入；不设隐藏全局回退。
样品身份、字号和节点时间不由该模块修改。传入的manualLabels属于当前文档，现有局部位置修正会修改该集合；跨文档复用集合是错误。

## 强制修改流程

1. 写明责任模块、输入输出、允许的副作用和涉及的工作区。
2. 缺陷先直接测试模块接口，构造失败反例。重构则记录旧算法和基线指纹。
3. 优先改所属模块。新功能超过约150行应建立新模块，不继续堆入app或桥接。
4. 每增加接口同步更新适配器、模块测试、架构清单、浏览器加载、静态服务及Docker打包。
5. 跑架构门禁和完整单元，再跑真实浏览器四工作区、配置往返、网页/MCP一致性；涉及导入/定年跑原生专项。
6. 结构迁移显式指定只读基线，精确对比SVG和PNG。唯一可排除的是构建metadata。字号、属性、图层顺序和坐标不能被忽略。
7. 复验真实大文件、取消、超时和崩溃回收。源码改动不能削弱80阶段稳定性保障。
8. 提交/交付按本轮相对基线比较，不能把继承的脏Git状态算成本次成果。更新项目导航前确认所有必需门禁退出0。

架构清单有体量上限。这只是防止继续无约束堆积的自动检查，并不能证明无循环依赖或正确功能隔离。
不得压缩排版、删注释、降低断言或提高上限来让它通过。确需放宽边界时，必须有明确设计理由、新的反例测试和人工审查；不得由agent自行解除限制。

## 83阶段时间渲染端口与剩余适配

`time-display.create`显式接收冻结的geologic-timescale数据端口；`time-background.create`只接收svgEl、timeTextWidth、niceTickStep、time-display实例和geologic-grid端口。每次绘图明确传字体与单位，没有隐式当前工作区；Dating和云树都走它。数据模块先于显示模块加载，框线模块先于背景模块加载。core/render目录沿用现有静态白名单、构建指纹和Docker目录复制规则；模块清单同时登记两个新模块。

`time-tree.create`只接收专用的`composeTimeNodeAnnotation`，不得接收普通树的`fullSupportBranchAttributes`或`composeNodeAnnotation`。它只绘制年龄、HPD、可选其他节点数字和普通等宽树枝；输入树中的支持率不改变Dating图的文字、圆点或线宽。
time-background仍是年代标签选择与年代栏边框的唯一入口。它根据实测文字宽度依次选全称、短缩写或最短缩写；原本能放下的格子保持原字号不变；当默认字号连最短缩写也放不下时，仅对该格子按可用净宽单独缩小最短缩写字号（行内`font-size`）使其完整放入色块内部，低于`4 px`可读下限的微观线缝才省略文字，不跨界也不外置。色块只填色，每行统一追加一个不透明外框和去重后的公共分隔线，避免相邻色块重复半透明描边。图中不绘制“缩写 = 全称”列表、箭头、外置名称或独立图例；全称解释由论文图注承担。Dating和云树只调用该实现，不各自判断文字、边框或年代边界。时间背景字号默认值由figure-contract统一定义，网页和MCP不得复制常数。
Dating和云树均不在画布底部绘制时间来源说明，也不为说明预留高度。time-tree和cloud-tree只负责图形；节点年龄来源、标签范围、HPD、时间单位与校准来源由配置和MCP报告保存，论文图注负责说明。旧`key_size_pt`只保留配置兼容性。
`time-tree.create`接收geometry/treeGeometry/display/scale/background，以及SVG、箭头、拖动、共同标签修复、碰撞报告、横向几何、分组条和标签内容等限定回调。renderSteps每次明确传svg、root、stats、profile、units、timeFonts、spacing、options、cladeColors、manualLabels与labelSettings。
options在适配层读取成当前次绘图快照，包含年龄范围、HPD、名称跟色及复用排版等选择。manualLabels仅允许来自当前文档；其他集合不得共享。树必须由适配层复制、阶梯化和验证后传入，不得把renderSteps当解析或定年入口。
尺寸与布局中途通过publishGeometry同步给历史公共标签回调，保留其既有依赖顺序。模块返回tipGroup、注释数、碰撞数与HPD显示数，中文状态和工作台计数由外层更新。
这些回调尚包含历史名称、分组、保留位置与共同标签修复适配，并未全部变成无状态模块；它们是明确的剩余边界。不能把本轮称为完整工作台或整个渲染系统解耦。

## 下一阶段的合理顺序

1. 时间树标签和地质背景已在83阶段迁出；后续保持其共用接口，不复制算法回主文件。
2. 云树整体呈现已在84阶段迁出；双树枝线、支持率布局和整体呈现已在85阶段迁出。后续维持这些模块的只读科学模型与快照配置边界，不把算法复制回app。
3. 名称操作与工作台已在86阶段迁出；接下来优先拆分组工作台与分组字段操作，再拆导入/导出。公共字形/识别与文字测量仍需单独规划，不能混入UI模块。

## 86阶段名称操作与界面端口

sample-name-state接收readOriginals/readOverrides/replaceOverrides、识别失效、待改名身份读写端口及sample-identity。每次调用重新读取当前工作区；恢复文档后不持有旧Map。apply先验证整批名称再替换Map；remove/clear保留历史原地删除语义，snapshot复制数组与Map。返回值不包含树。当前普通/Dating/双树仍共用历史非云树覆盖表，云树覆盖表独立，本轮没有改变该行为。

ui/sample-names接收23个具体元素、名称操作及createElement/baseLabel/displayLabel/syncTipSize/renderTree/recognize/requestSettingsRender/showMessage/parseMappingFile/downloadTemplate/deferFocus/canRenameFromFigure。它不接收document、$、原树或整个文档。bind重复调用不重复监听，dispose只删除本实例监听器；生产入口仍绑定一次。GUI事件与桥接沿用旧app函数，最终进入同一个apply/remove/clear操作。

姓名识别的native信号、10秒客户端时限、缓存键与迟到结果防护继续归app协调；字体加载、量字、文字片段落入SVG、密度间距与全部导入事务本轮未重写。颜色事件保留原CSS即时更新，字体/斜体与等级事件保留原重绘/识别调用顺序；不启动treePL/PhyParts。
4. 收敛cloud/conflict历史动态字段，加入明确文档操作与schema迁移；之后才考虑去掉短委托和更换模块打包系统。

每阶段独立验收，不为“架构漂亮”一起改算法、默认值和用户交互。当前剩余7,149行属于已知后续债务，本次不是最终架构终点。

## 内置基因树冲突统计边界

`core/phyparts-engine.js`是四类冲突统计的唯一算法实现。它只接受`gene-preparation.js`生成的安全`T00000`编号树、原始名称表、阈值和显示模式，不访问DOM、文件系统、网络、应用state或treePL。返回值一次性包含完整节点表、引擎名、算法版本、树数、阈值和耗时；失败或取消不返回部分表。

网页通过`core/input-worker.js`调用该模块。`core/input-tasks.js`只负责Worker生命周期、进度、超时和取消；app负责事务提交与中文状态，不得复制统计循环。兼容HTTP入口通过`tools/phyparts_cli.cjs`调用同一核心，不能形成第二套算法。MCP仍通过真实网页路径得到同一结果。

本实现依据并引用Smith et al. (2015)发表的rooted bipartition方法，不含上游PhyParts代码、二进制或Java依赖。v2按观测内群建立候选，合并同内群的已观测外围排除样品；以双侧包含关系计算每个候选的唯一基因树数，允许部分树支持多个候选，主冲突取最大值。该策略不等同于官方实现。v1首次匹配贪心分箱会拆散外围缺样品组合不同的同一关系，故提高算法版本及缓存版本并保留反例。旧图的来源记录继续保留在SVG metadata和MCP报告中。

## 84阶段云树呈现端口与剩余适配

三个cloud渲染模块采用工厂实例，返回冻结的接口。它们不查找控件、不拿全局state，也不调用原生引擎。cloud-branches的缓存键保留根对象身份、末端顺序、根年龄、top/step及每个节点年龄；取消搜索不会写缓存。实例间不共享WeakMap。
cloud-pies在隐藏或时间范围过滤之前为所有匹配节点搜索位置，之后只改变可见性。手工隐藏和时间过滤返回独立计数，不修改输入隐藏Set、范围、年龄或统计。两部分/四部分均来自同一完整统计。
cloud-tree接收speciesRoot/geneRoots/datedAges/datedRootAge/引擎来源/导入标记/计数表/颜色/隐藏集合，不接收导入任务、控件、其他工作区或完整文档。科学节点只读；分组条使用有派生x/y的副本。时间轴与地质背景仍调用唯一time-background实例。
93阶段云层先取物种树的最终行位置，再按完整后代样品集合为共有内部节点创建只读显示锚点。基因树搜索不能移动锚点，独有节点继续使用原避让评分。锚点状态和值进入实例缓存键；未知节点、末端锚点、非有限或超出后代跨度的坐标拒绝。参考／匹配表逐内部节点yield，取消不发布不完整缓存。即使不显示物种树，基因云层也使用当前物种树布局作为参考。科学树和年龄不变。
app收集单次绘图选项、元数据和名称数据源；对颜色、隐藏集合与geneRoots数组做快照。菜单打开时延迟重画、统计/定年、导入提交、失败恢复和中文工作台反馈仍在app。publishSize与共同名称/分组回调保留既有执行顺序，这些历史回调仍有适配层依赖。不能据此宣称所有UI或科学文档操作已经完全解耦。

## 95阶段云线显示扰动

新增cloud-jitter显示模型，cloud-tree通过jitterModel与jitterLimits显式端口调用。cloud-branches可接收本次生成的路径Map；不传或强度0时使用原直线字符串。科学行缓存与共有锚点规则不变，样式值不进入科学缓存。共享figure-contract、bridge、schema和网页控件共同支持options.cloud.jitter；禁止在MCP另写抖动算法。

## 85阶段双树呈现端口与剩余适配

conflict-branches.create仅需要svgEl。appendBranches接收两边只读root、positions、nodeGroups和已按所选字段、量纲及显示精度解析的annotations；不能重新猜测量纲或读取其他工作区。
conflict-support.create需要geometry、measureText、svgEl、appendNodeLabelArrow。layoutSteps接收entries、两边bounds、branches、tipRects、nodePoints，以及fonts/nodeRadius/leaderLines/font/canvasSize快照。候选生成、几何去重、五层采样数量和评分顺序沿用基线。每个候选yield；取消没有缓存或文档提交。
conflict-tree.create接收model/treeGeometry/branches/support及svgEl、publishSize、measureTip、appendTipLabelContent、displayTipLabel、applyTypography、commitFontSettings限定端口。renderSteps每次明确传svg、prepared、originalPrimary、groupAssignments、options、labelSource。布局先发布尺寸，名称插入SVG后实测getBBox，再路由连线；最后返回groupColors/supportEntries/supportLayout/branchSegments。
模块不写prepared报告或应用文档。app在生成器完成后统一提交诊断、计数与交互绑定；导入出错仍由既有完整事务恢复。commitFontSettings保留原字体下限回写点，不在量字之前改变行距或画布字体。
公共名称格式化、支持率显示格式化、字体应用及Canvas量字仍是适配回调；它们尚有控件/当前文档依赖。下一轮必须先列出名称有关的全部读写、各工作区隔离和MCP语义入口，再抽ui模块，不能把整个state传进新模块以伪装完成解耦。

当前绘图尺寸规范：整图（包括双树整体）固定宽1000单位。figure-units是唯一u/旧设计坐标转换边界；网页显示、MCP schema、配置往返、手动标注位移、混合分组字号和导出必须一致。*_pt和旧像素字段只作固定参考换算兼容。内部设计坐标不受毫米或DPI影响，SVG导出统一投影到1000宽；线条随图幅缩放。印刷宽度0取400 mm（双树800 mm），显式毫米只改物理大小；横向拉伸不能改变整图单位基准。宽高比增加高度时保留内容；内容过高时以可读性优先。门禁包括mcp-server/tests/drawing-units.mjs、physical-units.mjs以及完整integration。

## 公开发布前审计新增边界（2026-10-30）

- `core/support-scale`：原始支持率证据与概率／百分数量纲，无 DOM、无状态写入；批量基因树必须先确定整批量纲。
- `core/support-values`：按来源和复合列解释支持率；低支持率阈值用原值，满支持绘图与文字共用当前显示精度的舍入结果，保持原值模式使用未舍入数值。精度是显式参数，不读DOM或改科学输入；缺失列／来源不视为满支持。2026-11-02用户确认，见SUPPORT_ROUNDED_FULL_CHANGELOG。
- `ui/support-units`：显式传入容器、元素创建端口和回调，管理附加来源单位选择及实例监听器；不解析树、不调用科学计算。
- `core/tree-input.validateTimeAnnotations`：年龄与 HPD 原始条目的唯一校验入口，time-model 和 cloud-tree 委托它，不借数值目录忽略不合法字段。

行为和反例记录见 [PUBLICATION_AUDIT_CHANGELOG.md](PUBLICATION_AUDIT_CHANGELOG.md)。这些是有反例支持的语义修复，不作为保持旧错误图件等价的结构迁移。

`render/canvas-finalizer.runAtCanonicalScale` 是四工作区统一的视图／量测边界：显式 SVG 与操作回调，不取得应用 state 或控件。临时视图变换不能改动科学树；失败和取消恢复旧变换，完成的渲染器视图保留。此处与最终画布边界共用同一模块；不得在各绘图入口再复制量测尺度处理。

末端零点浮点容差唯一归`cloud-tree.importedDatedAges`，按正根年龄×64×Number.EPSILON计算；原始注释和科学树只读，仅派生ages映射使用present。存在残差时`terminalAgeValidation`由time-model透传，Dating桥接报告输出terminal_age_validation，云树导入放入既有importedDating来源对象。没有新全局状态、配置参数或网页/MCP两份阈值；精确零输入不增加来源字段。见TERMINAL_AGE_ROUNDOFF_CHANGELOG。

自动竖版行距唯一由figure-contract.planAutomaticRows计算，默认常数在同一契约的automaticRowLayout。time-tree/cloud-tree经显式planRows端口接收该纯函数，只传当前高度、实际行数、基线行距及rowLayout样式快照；不得读取DOM或重启科学计算。app对普通树调用同一入口，双树保持基线。实际行距和原基线属于派生currentLayoutInfo，用源树引用标记有效布局；旧布局与恢复文档不匹配时，非渲染读数使用已恢复的数字控件值，重绘总是重新量字计算，不以旧图高度为新图输入。core/figure-report统一透传automatic_row_layout诊断；无新增持久化根字段或绘图参数。见AUTOMATIC_PORTRAIT_LAYOUT_CHANGELOG。

公开发布审计补充：agent-bridge 导出云树配置时，自动冲突统计带原始基因树与参数用于重算，不能额外回灌无来源人工表覆盖计算元数据；用户显式人工表继续保留。该选择只属于语义配置适配，统计仍唯一归 core/phyparts-engine，科学 metadata 同属严格往返核验范围。

报告布局前置条件：桥接buildReport只读取已完成的布局。loadFigure在调用前排版一次；currentFigure在调用前通过serializedSvg刷新待处理设置、验证字体并复用布局。上下两图独立排版及恢复仍归原协调层。SVG的冲突统计科学来源不包含运行耗时；实际elapsedSeconds仍由运行报告承载，不能为重绘比较删除其他科学字段。

figure-units.normalizeSvg在单位投影结束后固定SVG根属性顺序，保留属性节点及命名空间和值；子层及其文字、字体、坐标、顺序不变。它不读取应用状态；克隆图件在调用前已写齐根属性。该确定性序列化规则不改变u／mm／DPI契约。

core/tree-panel-report为纯报告模块：planned只接收tipCounts、maximumPanels、rooted；rendered只接收页面摘要和明确的最小字号。不读DOM、树或全局state，不排版、不调用原生程序。app保留分图算法，仅委托报告格式。runtime经桥接第二参数传递includePanels，不写document-state或绘图配置。模块已登记，并由原core静态／构建／Docker路径分发。

figure-units.canonicalizeSvgAttributes 同时服务完成的屏幕绘图和导出克隆，固定根属性顺序而不改值、命名空间或子节点。字体环境探测仍由 app 统一协调，缓存真实 local FontFace 结果；不在 MCP 复制字体判断。

共用time-background的年代背景填色终点是显式传入的bottomPeriodY，不是plotBottom；绘图区与底部年代条之间的布局间隔继续保留其几何坐标，但必须被背景连续覆盖。两种工作区不得为消缝移动树、时间轴或年代条。见GEOLOGICAL_BACKGROUND_GAP_CHANGELOG。

自动组名方向与对齐的几何规则唯一归core/clade-layout：接收已测量条目、实际样品边界、对齐模式、末端是否齐平（tipsAligned）和本次高度，只返回派生副本，不接收树／DOM／整份state。末端齐平的图（Dating、云树及普通树的cladogram/aligned或无枝长拓扑树）在auto模式下对单层与多层分组均使用共享右列对齐；普通树phylogram单层分组保留nearby局部位置，且nearby按括号与文字的真实构件框检测碰撞并优先向右共线消解，不再以合并包围盒制造假交错。app的buildCladeBarLayout只收集与测量；Dating／云树通过同一端口传入边界与高度。详见AUTO_CLADE_ORIENTATION_CHANGELOG。

## 样品名横向压缩（2026-11-03）

2026-11-04：figure-contract.tipLabelWidth唯一声明自然名称宽度中位数的1.25倍上限，maximumTipLabelWidth显式接收自然宽度数组；偶数中位数取中间两项均值，空／全零数组不压缩。此规则替代旧0.8/3画布比例。render/tip-width.fitAll接收已连接的SVG文字集合及共享纯函数，先清除本模块旧压缩，再整批测量和拟合；textLength／spacingAndGlyphs只改变横向比例。app只委托；Dating、云树、双树通过fitTipLabelWidth显式端口，在组名／连线／节点避让之前完成。双树预估通过显式widthPolicy端口调用共享契约，两侧名称合并取中位数。预估和实测都不读取整份state；派生压缩比例只保存在本次SVG，不进入文档、身份或科学缓存。保留连线通道，以剩余正宽度分配树体；所有名称都异常长且仍放不下时明确拒绝，不回退旧画布比例，不改变科学长度。详见TIP_LABEL_WIDTH_CHANGELOG。
