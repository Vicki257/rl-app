#!/usr/bin/env python3
"""两次 UID 自动补号互相竞争的离线回归，不修改真实数据。"""
import json, shutil, subprocess, tempfile
from pathlib import Path
SRC=Path(__file__).resolve().parents[2]/"rl-data"
wf=SRC/".github"/"workflows"
migrators=[p.name for p in wf.glob("*.yml") if "tools/ids.py migrate" in p.read_text()]
assert migrators==["ids.yml"], "必须仅有一套自动 UID 分配流程："+str(migrators)
script=(wf/"ids.yml").read_text()
assert "group: ids-" in script and "reset --hard FETCH_HEAD" in script
assert "git push origin HEAD:" in script and "--force" not in script

def cmd(root,*args,ok=True):
    p=subprocess.run(["git","-C",str(root),*args],capture_output=True,text=True)
    if ok and p.returncode:raise AssertionError(p.stderr)
    return p.returncode

def clone(remote,target):
    cmd(remote.parent,"clone","-q",str(remote),str(target))
    cmd(target,"config","user.name","UID test")
    cmd(target,"config","user.email","uid@example.invalid")

def add(root,id,name):
    p=root/"data"/"methods.json"
    d=json.loads(p.read_text())
    d["methods"].append({"id":id,"proj":"rl","cat":"每天怎么跑","name":name,"what":"竞争测试"})
    p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+"\n")
    cmd(root,"add","data/methods.json")
    cmd(root,"commit","-qm",name)

def migrate(root):
    for action in ["migrate","verify"]:
        subprocess.run(["python3","tools/ids.py",action],cwd=root,check=True,capture_output=True)

with tempfile.TemporaryDirectory() as t:
    root=Path(t);seed=root/"seed";seed.mkdir()
    shutil.copytree(SRC/"data",seed/"data",ignore=shutil.ignore_patterns(".ids.lock"))
    shutil.copytree(SRC/"tools",seed/"tools",ignore=shutil.ignore_patterns("__pycache__","*.pyc"))
    shutil.copyfile(SRC/".gitignore",seed/".gitignore")
    cmd(seed,"init","-q","-b","dev")
    cmd(seed,"config","user.name","UID test")
    cmd(seed,"config","user.email","uid@example.invalid")
    cmd(seed,"add",".");cmd(seed,"commit","-qm","baseline")
    remote=root/"remote.git"
    cmd(root,"init","-q","--bare","-b","dev",str(remote))
    cmd(seed,"remote","add","origin",str(remote))
    cmd(seed,"push","-q","origin","HEAD:dev")
    author=root/"author";clone(remote,author)
    before=json.loads((author/"data"/"methods.json").read_text())
    stable={m["id"]:m["uid"] for m in before["methods"]}
    add(author,"m-race-first","写入者甲")
    cmd(author,"push","-q","origin","HEAD:dev")
    first=root/"runner-first";clone(remote,first)
    add(author,"m-race-second","写入者乙")
    cmd(author,"push","-q","origin","HEAD:dev")
    second=root/"runner-second";clone(remote,second)
    migrate(first);cmd(first,"add","data");cmd(first,"commit","-qm","旧快照补号")
    assert cmd(first,"push","origin","HEAD:dev",ok=False)!=0,"并发快照必须拒绝覆盖"
    migrate(second);cmd(second,"add","data");cmd(second,"commit","-qm","最新快照补号")
    cmd(second,"push","-q","origin","HEAD:dev")
    cmd(first,"fetch","-q","origin","refs/heads/dev")
    cmd(first,"reset","--hard","FETCH_HEAD")
    migrate(first)
    assert cmd(first,"diff","--exit-code")==0,"重读远端后不可重复补号"
    dest=root/"check";clone(remote,dest);migrate(dest)
    data=json.loads((dest/"data"/"methods.json").read_text())
    by={m["id"]:m for m in data["methods"]}
    a,b=by["m-race-first"]["uid"],by["m-race-second"]["uid"]
    assert a!=b and a.startswith("A") and b.startswith("A")
    assert all(by[k]["uid"]==v for k,v in stable.items()),"原始 UID 不可改"
    assert len(data["methods"])==len(before["methods"])+2
    assert by["m-race-first"]["name"]=="写入者甲" and by["m-race-second"]["name"]=="写入者乙"
    print("UID 并发反例通过：被拒绝的旧提交重读远端，两次新编号不重号；原始方法保持不变：",a,b)
