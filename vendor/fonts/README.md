# PhyloRender embedded fonts

PhyloRender bundles redistributable fonts for portable SVG text. The Arial option prefers genuinely installed system Arial. If it is unavailable, controls explicitly switch to Arimo, a persistent notice and MCP metadata record the fallback, and layout uses actual Arimo metrics. Arimo is never labelled as actual Arial. An Arial SVG needs Arial on the viewing system; a fallback Arimo SVG embeds the required open-source subsets. Arial files are not copied, converted, hosted, embedded as web-font data, or distributed by this repository. PNG captures the rendered appearance without viewer font dependencies.

- Libre Baskerville Variable 5.3.0 (SIL Open Font License 1.1): Georgia-style serif choice.
- Source Serif 4 Variable 5.3.0 (SIL Open Font License 1.1): Times-style serif choice.
- Source Sans 3 Variable 5.3.0 (SIL Open Font License 1.1): optional sans-serif family.
- Arimo Variable 5.2.8 (SIL Open Font License 1.1): separately named open-source alternative, not Arial.
- Noto Sans SC Variable 5.3.0 (SIL Open Font License 1.1): deterministic CJK fallback.

The original license text is retained in each family directory. Font files came from the corresponding `@fontsource-variable/*` package.
