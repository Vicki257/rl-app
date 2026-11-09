# 境界 · 认知世界（真实数据版）

把 RL-data 的真实历史导入 3D 认知城市，并在原始数据之上加一层**认知关系层**，
让不同日期、不同项目产生的认识可以连接、逐层深入、接受现实验证。

## 跑起来

```bash
cd rl-app && python3 -m http.server 8000
```

然后打开 `http://localhost:8000/world/`。
（`file://` 下浏览器会拦掉 fetch，所以必须用本地服务器。）

默认读本地快照 `world/snapshot.json`（RL-data commit 7e37c86 的无损副本）。
想直连 GitHub 实时读取：浏览器控制台执行

```js
localStorage.setItem("rlworld.source","live"); location.reload()
```

重新生成快照：

```bash
node world/build.mjs ../rl-data
```

跑验收（需要先起上面的服务器，端口 8099）：

```bash
URL=http://localhost:8099/world/ node world/acceptance.mjs
```

## 三层

| 层 | 内容 | 存在哪 |
|---|---|---|
| 真实数据层 | RL-data 原始 JSON 全文，无损 | `world/snapshot.json`（只读） |
| 认知关系层 | 节点、关系、认知事件、证据状态、变更历史 | 浏览器 localStorage `rlworld.cog.v2` |
| 可视化世界 | WebGL 城市，外形随认知数据变化 | `world/index.html` |

**当前阶段只读 RL-data，任何操作都不会写回 GitHub。**

## 文件

- `index.html` — 单文件应用（由 `assemble.sh` 从 `.parts/` 拼出，WebGL 片段逐字取自原 3D 城市原型）
- `assemble.sh` / `.parts/` — 源片段
- `build.mjs` — 生成无损快照
- `acceptance.mjs` — 真实数据验收脚本
- `1-诊断.md` / `2-数据导入设计.md` / `3-验收报告.md`
