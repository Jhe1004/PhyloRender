FROM mcr.microsoft.com/playwright:v1.61.1-noble AS upstream-browser

# Retain only the headless browser required for drawing and rasterization.
# This removes the full browser's separately licensed Widevine DRM module.
RUN test "$(find /ms-playwright -mindepth 1 -maxdepth 1 -type d -name 'chromium_headless_shell-*' | wc -l)" -eq 1 \
    && find /ms-playwright -mindepth 1 -maxdepth 1 ! -name 'chromium_headless_shell-*' -exec rm -rf {} + \
    && set -- /ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux*/chrome-headless-shell \
    && test "$#" -eq 1 && test -x "$1" \
    && ln -s "$1" /usr/local/bin/phylorender-chromium

# A deletion in a normal child image would leave the restricted binary in an
# inherited layer. Copy the cleaned filesystem into a fresh layer instead.
FROM scratch AS clean-browser
COPY --from=upstream-browser / /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    LANG=C.UTF-8 LC_ALL=C.UTF-8 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PHYLORENDER_BROWSER_EXECUTABLE=/usr/local/bin/phylorender-chromium
LABEL org.opencontainers.image.base.name="mcr.microsoft.com/playwright:v1.61.1-noble" \
      org.opencontainers.image.version="24.04"
RUN chown pwuser:pwuser /home/pwuser

FROM clean-browser AS runtime

WORKDIR /app/mcp-server
COPY mcp-server/package.json mcp-server/package-lock.json ./
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm ci --omit=dev --registry="${NPM_REGISTRY}"

WORKDIR /app
COPY LICENSE* README.md ./
COPY docs/RELEASE_STATUS.json ./docs/RELEASE_STATUS.json
COPY docs/LICENSE_DECISION.md ./docs/LICENSE_DECISION.md
COPY docs/DEMO_DATA_PERMISSION.md ./docs/DEMO_DATA_PERMISSION.md
COPY docs/RELEASE_PERMISSION_EVIDENCE.md docs/NATIVE_BUILD.md docs/NATIVE_COMPONENT_EVIDENCE.md docs/REPRODUCIBILITY.md ./docs/
COPY THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md
COPY tools/check-release.cjs ./tools/check-release.cjs
# Permission evidence is a release prerequisite, not a bypassable build flag.
RUN node tools/check-release.cjs
COPY index.html styles.css ui-shell.css ui-controls.css app.js cloud-tree.js conflict-tree.js agent-bridge.js figure-contract.js tree-rooting.js time-scale.js taxon-rank-normalizer.js tip-label-mapping.js figure-units.js panel-resize.js ./
COPY defaults ./defaults
COPY tools ./tools
COPY vendor ./vendor
COPY core ./core
COPY render ./render
COPY ui ./ui
COPY evaluation ./evaluation
COPY tests ./tests
COPY mcp-server ./mcp-server

# Both gene-tree conflict statistics and penalized-likelihood display alignment
# run inside PhyloRender's independent JavaScript modules without C++ compilation.
COPY .gitignore .dockerignore ./
COPY deploy ./deploy
RUN mkdir -p /data/figures && chown -R pwuser:pwuser /data/figures

WORKDIR /app/mcp-server
ENV NODE_ENV=production \
    PHYLORENDER_MCP_HOST=0.0.0.0 \
    PHYLORENDER_MCP_PORT=8766 \
    PHYLORENDER_OUTPUT_ROOT=/data/figures
EXPOSE 8766
VOLUME ["/data/figures"]
USER pwuser

CMD ["node", "src/http.mjs"]
