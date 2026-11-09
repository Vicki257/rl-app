# 源片段

`../assemble.sh` 按下面的顺序把它们拼成 `../index.html`：

```
gl-init → 00-state → 10-data → 11-link → gl-core → gl-math
→ 20-world → 30-ui → 40-cards → gl-render.patched → 50-boot
```

- `style.css`、`gl-init.js`、`gl-core.js`、`gl-math.js`、`gl-render.patched.js`
  **逐字来自原《境界 · 3D认知城市》HTML 原型**（美术方向与 WebGL 渲染保持不变）。
  `gl-render.patched.js` 相对原型只有三处改动：等数据加载完再渲染、
  `districts[4]` 改成不写死的 `districts[0]`、加一行 `drawMarkers(now)`。
- `03-body.html`、`02-extra.css` 是新界面，沿用原型的 class 命名。
- `10-data / 11-link / 20-world / 30-ui / 40-cards / 50-boot` 是新写的：
  导入器、认知关系层、召回、数据驱动的世界、界面。

改完任何片段后跑一次 `./assemble.sh`。
