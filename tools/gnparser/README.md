# GNparser 本地组件

PhyloRender 随包集成 [GNparser](https://github.com/gnames/gnparser) v1.15.0，用于把规范学名拆分为属名、种加词、种下加词、等级词和命名人。当前内置文件为 Apple silicon 原生版本：

- 文件：`bin/gnparser-darwin-arm64`
- 上游压缩包：`gnparser-v1.15.0-mac-arm.tar.gz`
- 压缩包体积：4,812,475 bytes
- 解压后二进制体积：12,826,898 bytes
- 二进制 SHA-256：`81c988965feef4de1605fab6f92d62ab55d2009b52c2ad3371b288eff455fb05`
- 上游发布页：<https://github.com/gnames/gnparser/releases/tag/v1.15.0>
- 许可证：MIT，全文见 `LICENSE`

`tools/local_server.py` 会优先选择与当前系统和 CPU 匹配的随包二进制；若没有对应文件，再查找系统 `PATH` 中的 `gnparser`。这使后续加入 Intel macOS、Linux 或 Windows 版本时不必修改接口逻辑。

GNparser 的 `normalized` 字段不会直接替换树文件中的名称。PhyloRender 只读取语义词类和字符边界，并仅接受质量等级 1–2 的分词结果；等级词的显示规范化仍由项目内的保守规则完成。原始 Newick/Nexus 数据始终保持不变。
