#!/bin/bash
# 把 .parts/ 下的片段拼成单文件 index.html（WebGL 片段逐字取自原 3D 城市原型）
set -e; cd "$(dirname "$0")"
{
echo '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"><meta name="theme-color" content="#0d1119"><title>境界 · 认知世界（真实数据版）</title>'
cat .parts/style.css .parts/02-extra.css
echo '</style></head>'
cat .parts/03-body.html
echo '<script>'
echo "'use strict';"
echo '/* 境界 · 认知世界：真实数据层 / 认知关系层 / 可视化世界三层分离。WebGL 渲染沿用原 3D 城市原型。 */'
cat .parts/gl-init.js .parts/00-state.js .parts/10-data.js .parts/11-link.js \
    .parts/gl-core.js .parts/gl-math.js .parts/20-world.js .parts/30-ui.js \
    .parts/40-cards.js .parts/gl-render.patched.js .parts/50-boot.js
echo '</script></body></html>'
} > index.html
echo "index.html $(wc -c < index.html) bytes"
