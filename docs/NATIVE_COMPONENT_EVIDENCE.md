# 原生组件证据

2026-10-30 本地核对记录。这里记录可验证的对应关系，不将历史构建材料当作重新构建成功，也不替代最终分发审核。

## macOS arm64：2026-11-01 当前源码重建包

`vendor/native/macos-arm64/manifest.json`记录当前分发文件与构建工具散列。
OpenMP 20.1.8、ADOL-C 2.6.3、NLopt 2.4.2和treePL均从固定源码构建。
在长度不同的两个全新目录中独立构建，三个完整文件含加载命令和签名均逐字节相同：

| 文件 | SHA-256 |
| --- | --- |
| treePL | 9029eda14113d39b0476e1c30a63b295577ea110e4f64dd75cf4fa821ce1cf6b |
| libadolc.2.dylib | 09f8b082e44dedc26e7c8a9ef5681eb9e4b05df47058c80f812f17a9aadad7db |
| libomp.dylib | dbe541f291364f7381edf6eb1ebfd76f5a4e8778a303b5f277139ea08230bb0b |

四线程归约连续五次通过；四末端合成和57末端ML基因树计算参考经process_supervisor运行，
完整Newick与历史版一致，原输入未改。它们不是所有输入等价证明。全部命令、失败尝试、
输出和完整收据在私有`mcp-server/var/reproducibility-20261101/`保留。
工具、固定输入与相对链接ID处理见NATIVE_BUILD及REPRODUCIBILITY。Apple clang 21.0.0、
macOS26.5 SDK、CMake3.31.6为外部前提；未声称整个工具链或操作系统源码重建。
以下保留历史追溯，不能将其“未重建OpenMP”状态当作当前包的状态。

## macOS arm64：2026-10-30 历史包

历史23阶段三个文件的 SHA-256（保留不动，已非当前入口）：

| 文件 | SHA-256 |
| --- | --- |
| treePL | 89e015179300010425d4fe9d519d3d349dbb4eba259437d1249dd5261c964322 |
| libadolc.2.dylib | c33c530b5e5b765cc9376d6ec7c4835dd7890d1102aeaa99fdbbd11c3d9abf4d |
| libomp.dylib | b51fbcd514f4abd29ab96de1d305c258255331b67ad9b3d73a2ecb26614aaf86 |

- 三个文件均与历史 portable 目录中的文件字节相同。
- 历史 treePL 构建目录的 33 个源码／配置输入与保留源码包的对应条目逐一字节相同。包 SHA-256 为 `d31d23a66ed7b34b2076ac62e7ed0fb75aaaf2f903bee58d56cd6dad6bb39e31`，其中包含 ADOL-C 2.6.3 和 NLopt 2.4.2 源码包。
- 对历史构建产物／当前安装依赖与分发副本逐段比较：treePL、ADOL-C、OpenMP 分别有 12、11、13 个可比较的文件支持 Mach-O section，全部字节相同，均包括 `__TEXT/__text`。这项检查不比较加载命令、签名或段外数据，不能称为整个文件相同。
- OpenMP 对照的安装元数据为 `llvm-openmp 20.1.8 he822017_0`；包散列为 `94f079719bbbad632ae2250bbf8d423618b3094aea9a5b96a76d8bd2e99cb485`。官方 [20.1.8 版本](https://github.com/llvm/llvm-project/releases/tag/llvmorg-20.1.8)及该版本的 [OpenMP 许可](https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-20.1.8/openmp/LICENSE.TXT)可供版本／条款核对。这不是从该上游 tag 完整重建安装包的证明。
- `otool -L` 确认当前分发副本的私有依赖使用 `@loader_path`，另依赖 macOS 系统库。历史 configure 记录、编译器适配脚本和对象文件仍保留。

完整逐文件、逐 section 的散列和本机来源路径保存在私有 `mcp-server/var/publication-audit-20261030/mac-native-historical-trace.json`，不将这些本机路径作为生产配置。

独立构建步骤现已提供在 `docs/NATIVE_BUILD.md`、`tools/build_treepl_macos.py` 和
`tools/native_build_support.py`，固定输入清单及未改动的LLVM OpenMP头文件随源码保留。
公开工具已实际完成离线源码构建、staged安装、链接路径处理及无时间戳ad-hoc签名验证。
构建命令全部经process_supervisor受管执行，原有三个分发文件散列未变。

最终工具版本再次构建生成treePL散列为 `2974371433b93dd929bb5881d9aef03d0051459411c0bf6e8ee584fb7c0f8610`。
两个受管计算用例（四末端合成校准、57末端ML基因树计算参考）与现有版输出Newick逐字节一致，
不构成所有输入的普遍等价证明。新旧treePL／ADOL-C的text section不同；OpenMP的13个被比较section相同。
OpenMP仍是记录了版本、散列及完整条款的二进制依赖，不声称从上游源码重建。
对应20.1.8官方OpenMP、共用CMake、compiler-rt源码和原安装包的BSD许可配方已保留在
`vendor/native-sources/`。安装包335299字节及其完整散列与原安装元数据相同；
配方明确包含arm64链接compiler-rt补丁，完整配方、补丁及声明原样保留。
组件源码包、原完整tag源码URL和散列分别记录，不把组件包称为原完整包的字节副本。
命令、退出码及逐section检查保存于私有审计目录的`mac-native-public-build-02/`，首轮构建和检查也保留。
最终分发归档仍须保留对应源码、此构建步骤和完整声明，并按实际分发内容审核。

## Linux 历史私有测试与最终候选镜像

本轮在隔离 Docker 环境中，从上述散列固定的源码包编译 treePL 和 ADOL-C；使用该镜像中记录的 NLopt 系统包。编译后的 treePL SHA-256 为 `ed2cefeb0061e03d86e92446065dd41cdfc9739652a4438292a0e3ef2e4d0dc2`。环境、动态链接、镜像 ID、命令退出码和科学测试结果均另存私有审计目录。

上述ed2cefeb…为历史私有测试镜像的原生文件记录，不代表最终候选二进制。最终候选镜像、实际treePL SHA、系统NLopt/OpenMP依赖版本及真实验收见IMAGE_ACCEPTANCE。Linux使用镜像中的系统包，不能用macOS的NLopt2.4.2构建收据证明这些系统依赖已源码重建。源许可记录和精确镜像技术收据分别保留；Windows未验收，未公开推送或部署。
