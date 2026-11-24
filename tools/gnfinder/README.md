# GNfinder 本地组件

PhyloRender 使用 [Global Names Finder](https://github.com/gnames/gnfinder) 定位样品字符串中的科学名称。当前随包附带的是 GNfinder v1.1.6 macOS x86_64 可执行文件；在 Apple silicon Mac 上通过 Rosetta 2 运行。

- 上游版本：v1.1.6（2024-06-11）
- 上游许可：MIT，见 `LICENSE`
- 当前二进制 SHA-256：`55bb66fcd79d581ca8d0bcc5655e0050743692a00f3d069af82e08ebae19a1f6`
- 上游发布页：<https://github.com/gnames/gnfinder/releases/tag/v1.1.6>

GNfinder 的科学名称检出可完全离线运行；其名称核验和分类级别查询需要连接 Global Names 验证服务。PhyloRender 不调用该远程服务，而是在 GNfinder 返回的字符位置上应用本地植物命名排版规则，因此样品名不会上传到外部服务。

`tools/local_server.py` 会优先调用 `bin/` 中与当前操作系统匹配的文件；若未随包附带，则尝试调用 `PATH` 中用户自行安装的 `gnfinder`。Linux 和 Windows 发行包可分别放入：

- `bin/gnfinder-linux-x86_64`
- `bin/gnfinder-windows-x86_64.exe`

即使没有 GNfinder，页面也会自动改用内置规则，不影响树的解析、排版和导出。
