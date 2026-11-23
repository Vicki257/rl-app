// Chromium 真实拖放/点击/刷新测试：使用 checkout 下来的真实 RL-data；写入被本地 HTTP 模拟拦截。
const {chromium}=require("playwright");
const http=require("node:http"),fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const ROOT=path.join(__dirname,".."),DATA=path.join(ROOT,"..","rl-data","data");
assert(fs.existsSync(path.join(DATA,"rels.json")),"需要真实 RL-data");
const read=p=>JSON.parse(fs.readFileSync(path.join(DATA,p),"utf8"));
const current=read("projects/rl/current.json"),rows=read("projects/rl/rows.json").filter(x=>x.uid);
const focus=current.focus?.focusUid;
assert(focus&&rows.some(x=>x.uid===focus),"必须有真实 focusUid");
const others=rows.filter(x=>x.uid!==focus).map(x=>x.uid);
assert(others.length>=2,"至少还需要两条真实认知");
const selected=others[0];let target=others[1];
const branch="claude/loving-cerf-ufxzgm";
const server=http.createServer((req,res)=>{
  if(req.url!=="/"){res.writeHead(404);res.end();return}
  res.writeHead(200,{"content-type":"text/html; charset=utf-8"});
  res.end(fs.readFileSync(path.join(ROOT,"index.html")));
});
const listen=()=>new Promise(r=>server.listen(0,"127.0.0.1",r));
const close=()=>new Promise(r=>server.close(r));
async function scenario(browser,device){
  const context=await browser.newContext(device==="mobile"
    ?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}
    :{viewport:{width:1280,height:800}});
  const page=await context.newPage(),store=new Map(),revs=new Map();
  let denyWrites=false,writeCount=0,denyFile=null;const putFiles=[];
  const rels=read("rels.json");
  rels.chains=[{id:"chain-browser",name:"测试既有链",parent:"proj:rl",members:[focus,selected]}];
  store.set("rels.json",rels);
  page.on("dialog",d=>d.accept(d.type()==="prompt"?"浏览器测试演化链":undefined));
  await page.route("https://fonts.googleapis.com/**",r=>r.abort());
  await page.route("https://fonts.gstatic.com/**",r=>r.abort());
  await page.route("https://api.github.com/**",async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method();
    const fulfill=(status,body)=>route.fulfill({status,contentType:"application/json",
      headers:{"access-control-allow-origin":"*","access-control-allow-methods":"GET, PUT, OPTIONS",
       "access-control-allow-headers":"*"},body:typeof body==="string"?body:JSON.stringify(body)});
    if(method==="OPTIONS")return fulfill(200,{});
    if(decodeURIComponent(url.pathname).endsWith("/branches/"+branch))
      return fulfill(200,{name:branch});
    const prefix="/repos/Vicki257/rl-data/contents/data/";
    const pathname=decodeURIComponent(url.pathname);
    if(!pathname.startsWith(prefix))return fulfill(404,{message:"unexpected API"});
    const file=pathname.slice(prefix.length),onDisk=path.join(DATA,file);
    if(file.includes(".."))return fulfill(400,{message:"bad path"});
    if(method==="GET"){
      if(url.searchParams.get("ref")!==branch)return fulfill(400,{message:"wrong read ref"});
      if(!store.has(file)){
        if(!fs.existsSync(onDisk))return fulfill(404,{message:"not found"});
        store.set(file,read(file));
      }
      return fulfill(200,{sha:"rev"+(revs.get(file)||1),
        content:Buffer.from(JSON.stringify(store.get(file)),"utf8").toString("base64")});
    }
    if(method==="PUT"){
      writeCount++;putFiles.push(file);
      if(denyWrites||file===denyFile)return fulfill(401,{message:"simulated denial"});
      const payload=JSON.parse(req.postData()||"{}");
      if(payload.branch!==branch)return fulfill(400,{message:"wrong write branch"});
      if(store.has(file)&&payload.sha!=="rev"+(revs.get(file)||1))return fulfill(409,{message:"stale SHA"});
      if(!store.has(file)&&payload.sha)return fulfill(409,{message:"new file sha unexpected"});
      const next=JSON.parse(Buffer.from(payload.content,"base64").toString("utf8"));
      const n=(revs.get(file)||1)+1;revs.set(file,n);store.set(file,next);
      return fulfill(200,{content:{sha:"rev"+n}});
    }
    return fulfill(405,{message:"method"});
  });
  await page.addInitScript(v=>localStorage.setItem("rl.cfg",JSON.stringify(v)),
    {owner:"Vicki257",repo:"rl-data",branch,token:"fixture-token"});
  await page.goto("http://127.0.0.1:"+server.address().port+"/");
  await page.waitForFunction(()=>document.querySelector('[data-tab="tree"]')!==null);
  await page.locator('[data-tab="tree"]').click();
  await page.locator("#tree .item[data-id='chain-browser']").waitFor();
  await page.waitForFunction(()=>D.index.filter(x=>x.state!=="archived").every(x=>!!D.p[x.id]));
  // 反例 1：手动焦点 A75 与自动最高优先 A67 不同。重新分析只更新 A75 的分析状态。
  const baselineFocus=await page.evaluate(()=>({
    chosen:focusRowOf(D.p.rl)?.uid,automatic:focusRow(D.p.rl)?.uid}));
  assert.equal(baselineFocus.chosen,"A000000075",device+": 真实手动焦点");
  assert.equal(baselineFocus.automatic,"A000000067",device+": 最高优先级反例");
  assert(await page.evaluate(()=>reanalyze("rl")),device+": 重新分析必须成功");
  assert.equal(store.get("projects/rl/current.json").focus.focusUid,"A000000075",
    device+": 重新分析不得暗改用户手动焦点");
  assert.equal(store.get("widget.json").focusUid,"A000000075",
    device+": 小组件同步原手动焦点");
  console.log("Chromium "+device+"：手动 A75 / 自动 A67，重新分析仍保留 A75");
  await page.locator("[data-tfocus]").click();
  const highlighted=page.locator('#tree .item.current[data-id="chain-browser"]');
  await highlighted.waitFor({state:"visible"});
  assert(await highlighted.count()===1,device+": 当前 UID 在链内必须高亮整条链");
  await page.waitForTimeout(650); // 等待 smooth scroll 完成
  const box=await highlighted.boundingBox();
  assert(box&&box.y>=-10&&box.y<page.viewportSize().height,
    device+": 定位当前应真正滚动到可视区域");
  // 展开所有祖先；随后拖放仍由 Chromium 真实鼠标/触摸模拟执行。
  await page.evaluate(()=>{
    const t=buildTree();S.topen={};
    const walk=(id,pre,visited)=>{
      if(visited.includes(id))return;
      const key=pre?pre+"/"+id:id;
      S.topen[key]=1;
      (t.T[id]?.children||[]).forEach(c=>walk(c,key,visited.concat(id)));
    };
    t.roots.forEach(x=>walk(x,"",[]));render();
  });
  // 16 家真实公司逐一点击，检查进入的项目和公司代码，而非只核对静态参数。
  const cos=read("projects/quant/project.json").sop.cos;
  assert(cos.length===16,"真实项目公司数量必须为 16");
  for(const company of cos){
    await page.locator('#tree .item[data-id="'+company.uid+'"] > .line > .name').click();
    await page.waitForFunction(expected=>S.screen==="co"&&S.arg===expected,"quant|"+company.id);
    assert((await page.locator(".body").innerText()).includes(company.name),
      device+": 公司详情必须显示 "+company.id+" 的真实公司名称");
    await page.locator("[data-back]").click();
  }
  // 拖动的是认知标题到链标题，不能把带子节点的整块容器中心当作落点。
  // 用户在同一视野内拖到链标题；避免 Playwright 自动滚动造成远处拖动起点被覆盖。
  target=await page.evaluate(candidates=>{
    const host=document.querySelector('#tree .item[data-id="chain-browser"] > .line');
    const y=host.getBoundingClientRect().top+window.scrollY;
    return candidates.map(uid=>{
      const el=Array.from(document.querySelectorAll("#tree .item")).find(x=>x.dataset.id===uid);
      const rect=el?.querySelector(":scope > .line")?.getBoundingClientRect();
      return {uid,distance:rect?Math.abs(rect.top+window.scrollY-y):Infinity};
    }).sort((a,b)=>a.distance-b.distance)[0].uid;
  },others.slice(1));
  console.log("拖动源 UID："+target);
  const from=page.locator('#tree .item[data-id="'+target+'"] > .line > .name');
  const to=page.locator('#tree .item[data-id="chain-browser"] > .line > .name');
  await from.waitFor({state:"visible"});await to.waitFor({state:"visible"});
  await page.evaluate(()=>{
    window.__dragTrace=[];
    for(const ev of ["dragstart","dragover","drop","dragend"])
      document.querySelector("#tree").addEventListener(ev,e=>
        window.__dragTrace.push([ev,e.target.closest(".item")?.dataset.id,dragId]),true);
  });
  await from.dragTo(to);
  const trace=await page.evaluate(()=>({events:window.__dragTrace,
    dialog:!!document.querySelector(".relsheet"),source:document.querySelector(".dragging")?.dataset.id}));
  console.log("拖动追踪："+JSON.stringify(trace));
  assert(trace.dialog,device+": 真实拖放未弹出选择框："+JSON.stringify(trace.events));
  await page.locator(".relsheet [data-member='1']").click();
  await page.locator(".relsheet [data-i='1']").click(); // 修正
  await page.locator(".relsheet [data-dir='1']").click(); // B → C
  await page.waitForFunction(()=>document.querySelector(".toast")?.textContent?.includes("已写回仓库"));
  const saved=store.get("rels.json");
  assert(saved.rels.some(x=>x.from===selected&&x.to===target&&x.rel==="修正"&&x.state==="已确认"),
    device+": 保存必须使用所选成员 UID");
  assert(saved.chains.length===1&&new Set(saved.chains[0].members).size===3,
    device+": 只应保留一条扩展后的演化链");
  assert(saved.rels.every(x=>!String(x.from).startsWith("chain-")&&!String(x.to).startsWith("chain-")),
    device+": rels.json 不得有链 ID 端点");
  await page.reload();await page.locator('[data-tab="tree"]').click();
  await page.waitForFunction(()=>D.index.filter(x=>x.state!=="archived").every(x=>!!D.p[x.id]));
  const newId=saved.chains[0].id;
  await page.locator('#tree .item[data-id="'+newId+'"]').waitFor({state:"visible"});
  await page.locator('[data-tfocus]').click();
  assert(await page.locator('#tree .item.current[data-id="'+newId+'"]').isVisible(),
    device+": 刷新后仍能定位当前演化链");
  // 拒绝 PUT 时不得改变正式关系状态。
  denyWrites=true;
  await page.evaluate(()=>{
    const t=buildTree();S.topen={};
    const walk=(id,pre,seen)=>{
      if(seen.includes(id))return;
      const key=pre?pre+"/"+id:id;S.topen[key]=1;
      (t.T[id]?.children||[]).forEach(x=>walk(x,key,seen.concat(id)));
    };
    t.roots.forEach(id=>walk(id,"",[]));render();
  });
  const outsider=await page.evaluate(({candidates,id})=>{
    const dst=document.querySelector('#tree .item[data-id="'+id+'"] > .line');
    const y=dst.getBoundingClientRect().top+window.scrollY;
    return candidates.map(uid=>{
      const item=Array.from(document.querySelectorAll("#tree .item")).find(x=>x.dataset.id===uid);
      const rect=item?.querySelector(":scope > .line")?.getBoundingClientRect();
      return {uid,distance:rect?Math.abs(rect.top+window.scrollY-y):Infinity};
    }).sort((a,b)=>a.distance-b.distance)[0]?.uid;
  },{candidates:rows.map(x=>x.uid).filter(x=>![focus,selected,target].includes(x)),id:newId});
  assert(outsider,"缺少链旁的额外认知用于失败反例");
  const countBefore=store.get("rels.json").rels.length;
  await page.locator('#tree .item[data-id="'+outsider+'"] > .line > .name')
    .dragTo(page.locator('#tree .item[data-id="'+newId+'"] > .line > .name'));
  await page.locator(".relsheet [data-member='0']").click();
  await page.locator(".relsheet [data-i='4']").click(); // 支持：横向
  await page.locator(".relsheet [data-dir='0']").click();
  await page.waitForFunction(()=>S.toast?.includes("没能写回仓库"));
  assert(store.get("rels.json").rels.length===countBefore,device+": 失败保存不应修改正式数据");
  console.log("保存失败诊断："+JSON.stringify({putCount:writeCount,toast:await page.evaluate(()=>S.toast)}));
  assert(writeCount>=2,device+": 测试必须真正发生模拟 GitHub PUT");
  // 真正的屏幕触摸：无需 HTML5 拖放，点选两条认知并确认关系。
  denyWrites=false;
  const activate=loc=>device==="mobile"?loc.tap():loc.click();
  await activate(page.locator('[data-rpick]'));
  await activate(page.locator('#tree .item[data-id="'+newId+'"] > .line > .name'));
  await activate(page.locator('#tree .item[data-id="'+outsider+'"] > .line > .name'));
  await activate(page.locator(".relsheet [data-member='0']"));
  await activate(page.locator(".relsheet [data-i='5']")); // 关联，不改变归属
  await activate(page.locator(".relsheet [data-dir='0']"));
  await page.waitForFunction(()=>S.toast?.includes("已写回仓库"));
  assert(store.get("rels.json").rels.some(r=>r.from===focus&&r.to===outsider&&r.rel==="关联"),
    device+": 触摸点选必须建立真实 UID 关系");
  console.log("Chromium "+device+" 真实触摸 tap 点选建立关系通过");

  // 方法库：新增 → 保存 → 刷新 → 编辑 → 归档，原有 UID 不丢。
  await page.locator('[data-tab="tree"]').click();
  await page.evaluate(()=>{
    const t=buildTree();S.topen={};const walk=(id,pre,seen)=>{
      if(seen.includes(id))return;const key=pre?pre+"/"+id:id;S.topen[key]=1;
      (t.T[id]?.children||[]).forEach(c=>walk(c,key,seen.concat(id)))};
    t.roots.forEach(x=>walk(x,"",[]));render();
  });
  const realMethods=read("methods.json").methods;
  const originalUID=realMethods[0].uid;
  await page.locator('#tree .item[data-id="'+originalUID+'"] > .line > .name').click();
  await page.locator('[data-addm]').click();
  await page.locator('#m_name').fill("浏览器新增方法测试");
  await page.locator('#m_what').fill("测试可长期保存");
  await page.locator('[data-savem]').click();
  await page.waitForFunction(()=>!!D.meth?.methods.find(x=>x.name==="浏览器新增方法测试"));
  const savedMethod=store.get("methods.json").methods.at(-1);
  assert(savedMethod.name==="浏览器新增方法测试"&&!savedMethod.uid,
    device+": 浏览器不得手动猜永久 UID，必须交由 ids.py");
  assert(store.get("methods.json").methods.length===realMethods.length+1);
  const mid=savedMethod.id;
  await page.reload();await page.waitForFunction(()=>!!D.meth);
  await page.evaluate(id=>go("method",id),mid);
  assert((await page.locator(".body").innerText()).includes("浏览器新增方法测试"),
    device+": 刷新后应能找到方法");
  await page.locator('[data-edit]').click();
  await page.locator('#m_name').fill("浏览器编辑方法测试");
  await page.locator('[data-savem]').click();
  await page.waitForFunction(()=>D.meth?.methods.some(x=>x.name==="浏览器编辑方法测试"));
  assert(store.get("methods.json").methods.at(-1).name==="浏览器编辑方法测试");
  await page.locator('[data-edit]').click();
  await page.locator('[data-delm]').click();
  await page.locator('[data-delm]').click();
  await page.waitForFunction(()=>D.meth?.methods.some(x=>x.id==="m-001")&&S.screen==="tree");
  assert(store.get("methods.json").methods.at(-1).archived===true,
    device+": 删除方法只能归档，不删除原文或 UID");
  assert(store.get("methods.json").methods[0].uid===originalUID,
    device+": 原方法 UID 不能改变");
  // 方法保存 401 时保留输入框文字，D.meth 与真实 methods.json 均不改变。
  denyWrites=true;
  await page.evaluate(id=>go("method",id),realMethods[0].id);
  await page.locator('[data-edit]').click();
  await page.locator('#m_name').fill("故意保存失败的方法");
  await page.locator('[data-savem]').click();
  await page.waitForFunction(()=>document.querySelector(".save-method-note")?.textContent?.includes("保存失败"));
  assert(await page.locator('#m_name').inputValue()==="故意保存失败的方法",
    device+": 方法保存失败后输入不能被清空");
  assert(store.get("methods.json").methods[0].name===realMethods[0].name,
    device+": 失败不能修改原方法内容或 UID");
  denyWrites=false;
  // 新增内容正式落仓库而非本地草稿，模拟换设备重新读取。
  await page.evaluate(uid=>go("cog",uid),outsider);
  await page.locator('.record-editor').fill("跨设备长期认知补充验证");
  await page.locator('.save-record').click();
  await page.waitForFunction(()=>D.notes&&Object.values(D.notes).includes("跨设备长期认知补充验证"));
  assert(store.get("cognotes.json")[outsider]==="跨设备长期认知补充验证");
  await page.reload();await page.waitForFunction(()=>!!D.p.rl);
  await page.evaluate(uid=>go("cog",uid),outsider);
  assert(await page.locator(".record-editor").inputValue()==="跨设备长期认知补充验证",
    device+": 跨设备应从仓库读取正式补充内容");
  // 补充记录保存失败不改变仓库值，也不清空当前及重新打开后的本机草稿。
  denyWrites=true;
  await page.locator('.record-editor').fill("保存失败但必须保留的草稿");
  await page.locator('.save-record').click();
  await page.waitForFunction(()=>document.querySelector(".save-note")?.textContent?.includes("保存失败"));
  assert(await page.locator(".record-editor").inputValue()==="保存失败但必须保留的草稿");
  assert(store.get("cognotes.json")[outsider]==="跨设备长期认知补充验证",
    device+": 写入失败不能覆盖正式补充");
  await page.reload();await page.waitForFunction(()=>!!D.p.rl);
  await page.evaluate(uid=>go("cog",uid),outsider);
  assert(await page.locator(".record-editor").inputValue()==="保存失败但必须保留的草稿",
    device+": 草稿应保留并不自动覆盖远端");
  denyWrites=false;
  // 反例 3/4：行状态或优先级 PUT 被拒绝，必须回滚，不能更新当前焦点。
  await page.waitForFunction(()=>!!D.p.rl);
  const rlPath="projects/rl/rows.json";
  const beforeRows=JSON.stringify(store.get(rlPath));
  const previousFocus=store.get("projects/rl/current.json").focus.focusUid;
  const beforeCurrentPuts=putFiles.filter(x=>x.endsWith("/current.json")||x==="widget.json").length;
  denyFile=rlPath;
  const statusOK=await page.evaluate(()=>{
    S.screen="list";S.arg="rl";render();
    return setStatus(D.p.rl.rows.findIndex(x=>x.uid==="A000000067"),"够用了");
  });
  assert(statusOK===false,device+": rows 保存被拒绝时改状态必须报告失败");
  assert(JSON.stringify(store.get(rlPath))===beforeRows,device+": 拒绝保存不能改写真实行");
  assert(await page.evaluate(()=>D.p.rl.rows.find(x=>x.uid==="A000000067")?.f)==="待改",
    device+": 改状态失败后本地恢复");
  const field=page.locator('[data-pri="'
    +read("projects/rl/rows.json").findIndex(x=>x.uid==="A000000067")+'"]').first();
  await field.fill("9999");
  await field.dispatchEvent("change");
  await page.waitForFunction(()=>S.toast?.includes("保存失败"));
  assert(JSON.stringify(store.get(rlPath))===beforeRows,device+": 优先级失败不能写入仓库");
  assert(await page.evaluate(()=>D.p.rl.rows.find(x=>x.uid==="A000000067")?.cols?.[PRI])==="10",
    device+": 优先级失败要还原内存");
  assert(store.get("projects/rl/current.json").focus.focusUid===previousFocus,
    device+": 优先级失败后不能改变当前研究 UID");
  assert(putFiles.filter(x=>x.endsWith("/current.json")||x==="widget.json").length===beforeCurrentPuts,
    device+": rows 保存失败后绝不能同步焦点");
  denyFile=null;
  console.log("Chromium "+device+"：状态/优先级保存失败均回滚，未写 current/widget");

  // 三文件写入中间失败后保留 pending，并在重新打开时自动补完。
  await page.waitForFunction(()=>!!D.p.quant);
  denyFile="global.json";
  const quantUID=read("projects/quant/current.json").focus.focusUid;
  const quantIndex=read("projects/quant/rows.json").findIndex(r=>r.uid===quantUID);
  assert(quantIndex>=0);
  await page.evaluate(i=>setFocus("quant",i),quantIndex);
  await page.waitForFunction(()=>D.p.quant?.current?.focus?.syncPending===true);
  assert(store.get("projects/quant/current.json").focus.syncPending,
    device+": 第二笔失败保留待恢复标识");
  denyFile=null;await page.reload();
  await page.waitForFunction(()=>D.global?.current==="quant"&&D.p.quant?.current?.focus?.syncPending!==true);
  assert(store.get("widget.json").focusUid===quantUID,
    device+": 刷新后同步 widget 的唯一焦点 UID");
  // 旧焦点只按唯一日期+正文补号，绝不能按过期 idx 猜身份。
  const oldFocus=read("projects/rl/current.json");
  delete oldFocus.focus.focusUid;oldFocus.focus.idx=9999;
  store.get("global.json").current="rl";
  store.set("projects/rl/current.json",oldFocus);
  revs.set("projects/rl/current.json",(revs.get("projects/rl/current.json")||1)+1);
  await page.reload();
  await page.waitForFunction(uid=>D.p.rl?.current?.focus?.focusUid===uid,focus);
  assert(store.get("projects/rl/current.json").focus.focusUid===focus,
    device+": 唯一日期和正文必须能迁移回永久 UID");
  const invalid=JSON.parse(JSON.stringify(store.get("projects/rl/current.json")));
  invalid.focus.focusUid="A999999999";invalid.focus.idx=0;
  store.set("projects/rl/current.json",invalid);
  revs.set("projects/rl/current.json",(revs.get("projects/rl/current.json")||1)+1);
  await page.reload();await page.waitForFunction(()=>!!D.p.rl);
  assert(await page.evaluate(()=>curUid())==="",
    device+": 已失效的焦点 UID 不能退回过期 idx");
  // 反例 2：切换项目时 global 写成功、widget 写失败，刷新后从 syncPending 恢复。
  denyFile="widget.json";
  const pickOK=await page.evaluate(()=>pick("quant"));
  assert(pickOK===false,device+": 第二笔写失败应报告项目切换部分成功");
  assert(store.get("global.json").current==="quant",device+": 已成功写入的 global 不能假装回滚");
  assert(store.get("projects/quant/current.json").focus.syncPending===true,
    device+": 目标项目留下待恢复标记");
  denyFile=null;await page.reload();
  await page.waitForFunction(()=>D.global?.current==="quant"&&
    D.p.quant?.current?.focus?.syncPending!==true&&D.widget?.project==="quant");
  assert(store.get("widget.json").project==="quant",device+": 刷新后补完小组件项目");
  assert(!store.get("projects/quant/current.json").focus.syncPending,
    device+": 三处同步完成后清除待恢复标记");
  console.log("Chromium "+device+"：global 成功 / widget 失败，刷新恢复成功");
  // 反例 1b：焦点 UID 已失效时不执行重新分析，也绝不发出写入请求。
  const beforeBad=writeCount;
  const badResult=await page.evaluate(()=>{
    D.p.rl.current.focus={focusUid:"A999999999",idx:0,manual:true};
    return reanalyze("rl");
  });
  assert(badResult===false&&writeCount===beforeBad,
    device+": 失效 UID 拒绝重新分析，不能退回数组 idx");
  console.log("Chromium "+device+"：失效 UID 阻止重新分析与写入");
  console.log("Chromium "+device+"：方法增改归档、正式补充、触摸点选、部分失败恢复通过");
  await context.close();
  console.log("Chromium "+device+"：当前定位、链成员拖动、方向、保存、刷新与失败回滚通过");
}
(async()=>{await listen();const browser=await chromium.launch({headless:true});
  try{await scenario(browser,"desktop");await scenario(browser,"mobile")}
  finally{await browser.close();await close()}
})().catch(e=>{console.error(e);process.exitCode=1;close().catch(()=>{})});
