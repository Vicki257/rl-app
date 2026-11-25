#!/usr/bin/env python3
"""离线复制真实 RL-data 后，用原始 tools/ids.py 发放新方法 UID，绝不修改真实仓库。"""
import json, os, shutil, subprocess, tempfile
from pathlib import Path

source = (Path(__file__).resolve().parent.parent.parent / "rl-data")
assert (source / "tools" / "ids.py").exists(), "没有真实 RL-data 的 UID 分配器"
with tempfile.TemporaryDirectory() as temp:
    dest = Path(temp) / "rl-data"
    shutil.copytree(source, dest, ignore=shutil.ignore_patterns(".git", ".ids.lock"))
    path = dest / "data" / "methods.json"
    original = json.loads(path.read_text(encoding="utf-8"))
    original_uid = {m["id"]: m.get("uid") for m in original["methods"]}
    before = json.loads((dest / "data" / "ids.json").read_text(encoding="utf-8"))
    existing = len(original["methods"])
    original["methods"].append({
        "id": "m-uid-allocator-test", "proj": "rl", "cat": "每天怎么跑",
        "name": "验证新方法编号", "what": "仅限测试", "when": "", "src": ""
    })
    path.write_text(json.dumps(original, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for cmd in ("migrate", "verify"):
        subprocess.run(["python3", "tools/ids.py", cmd], cwd=dest, check=True)
    after = json.loads(path.read_text(encoding="utf-8"))
    issued = next(m for m in after["methods"] if m["id"] == "m-uid-allocator-test")
    assert issued.get("uid","").startswith("A"), "必须由现有工具发放 A 序列"
    assert all(m.get("uid") == original_uid[m["id"]] for m in after["methods"] if m["id"] in original_uid), "原 UID 不可变化"
    newcounter = json.loads((dest/"data"/"ids.json").read_text(encoding="utf-8"))["counters"]["A"]
    assert newcounter > before["counters"]["A"], "新增方法必须推进计数器"
    assert len(after["methods"]) == existing + 1
    print(f"ids.py 新方法正式编号测试通过：{issued['uid']}；已有 {existing} 条方法 UID 完整保留")
