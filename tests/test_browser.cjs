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
  // 删除记录不能让现有认知关系悬空，也不能破坏之后的关系保存。仅操作本地模拟仓库。
  const linkedRow=rows.find(r=>rels.rels.some(x=>x.from===r.uid||x.to===r.uid));
  assert(linkedRow?.uid,"真实数据中必须有被关系引用的 RL 记录");
  await page.evaluate(async uid=>{
    const i=D.p.rl.rows.findIndex(r=>r.uid===uid);
    await delRow(i);
    await delRow(i);
  },linkedRow.uid);
  assert(store.get("projects/rl/rows.json").some(r=>r.uid===linkedRow.uid),
    device+": 已关联原始认知不能被删除并留下无效关系");
  assert(!putFiles.includes("projects/rl/rows.json"),device+": 被拒绝的删除不得写入");
  const unlinked=rows.filter(r=>r.uid!==focus&&!read("cogtree.json").up[r.uid]&&
    !rels.rels.some(x=>x.from===r.uid||x.to===r.uid)&&!rels.chains.some(c=>c.members.includes(r.uid))).slice(0,2);
  assert.equal(unlinked.length,2,"真实数据中必须有两个无关联的 RL 记录");
  await page.evaluate(async ids=>{
    for(const uid of ids)await delRow(D.p.rl.rows.findIndex(r=>r.uid===uid));
  },unlinked.map(r=>r.uid));
  assert(unlinked.every(r=>store.get("projects/rl/rows.json").some(saved=>saved.uid===r.uid)),
    device+": 点两条不同记录的删除按钮，不能算确认删除");
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
  // 拖动必须按真实指针来：鼠标按下-移动-松手、手指长按-移动-松手。
  // 以前用 dragTo 走 HTML5 drag-and-drop，Playwright 能触发，真浏览器不能——
  // 整行就是一个 <button>，在按钮上按下不会启动原生拖拽，于是真机拖不动而测试全绿。
  assert(await page.locator('#tree .item[draggable="true"]').count()===0,
    device+": 不能再依赖 HTML5 原生拖拽，整行是按钮时真浏览器不会启动它");
  const rectOf=async loc=>{await loc.scrollIntoViewIfNeeded();return await loc.boundingBox()};
  const ba=await rectOf(from),bb=await rectOf(to);
  if(device==="mobile"){
    const cdp=await context.newCDPSession(page);
    const touch=(type,x,y)=>cdp.send("Input.dispatchTouchEvent",{type,
      touchPoints:type==="touchEnd"?[]:[{x,y,radiusX:8,radiusY:8,force:1,id:1}]});
    await touch("touchStart",ba.x+20,ba.y+ba.height/2);
    await page.waitForTimeout(420);                       // 长按超过阈值才算拖
    assert(await page.locator("#tree .item.dragging").count()===1,
      device+": 手指长按之后必须进入拖动状态");
    await touch("touchMove",bb.x+20,bb.y+bb.height/2);
    await page.waitForTimeout(150);
    assert(await page.locator("#tree .item.dropok").count()===1,
      device+": 手指拖到目标上必须高亮，之前浏览器会当成滑页面把拖动掐掉");
    await touch("touchEnd",bb.x+20,bb.y+bb.height/2);
  }else{
    await page.mouse.move(ba.x+20,ba.y+ba.height/2);
    await page.mouse.down();
    await page.mouse.move(ba.x+40,ba.y+ba.height/2,{steps:3});
    assert(await page.locator("#tree .item.dragging").count()===1,
      device+": 在文字（按钮内部）上按下并移动必须进入拖动状态");
    await page.mouse.move(bb.x+20,bb.y+bb.height/2,{steps:10});
    assert(await page.locator("#tree .item.dropok").count()===1,device+": 拖到目标上必须高亮");
    await page.mouse.up();
  }
  await page.waitForTimeout(350);
  const trace=await page.evaluate(()=>({events:window.__dragTrace,
    dialog:!!document.querySelector(".relsheet")}));
  assert(trace.dialog,device+": 真实指针拖放未弹出选择框："+JSON.stringify(trace.events));
  await page.locator(".relsheet [data-member='1']").click();
  await page.locator(".relsheet [data-i='1']").click(); // 修正
  await page.locator(".relsheet [data-dir='1']").click(); // B → C
  // 合并动画：两条认知要先塌下去，人才看得见「它们被合进链里了」。
  // CSS 一直都在，但有一阵子没有任何代码去加这两个 class，动画就静默消失了。
  const sank=await page.waitForFunction(
    ()=>document.querySelectorAll("#tree .item.merging").length,{timeout:3000})
    .then(h=>h.jsonValue()).catch(()=>0);
  assert(sank>0,device+": 合并时两条认知必须有塌陷动画，不能瞬间消失");
  await page.waitForFunction(()=>document.querySelector(".toast")?.textContent?.includes("已写回仓库"));
  const popped=await page.waitForFunction(
    ()=>document.querySelectorAll("#tree .item.merged").length,{timeout:3000})
    .then(h=>h.jsonValue()).catch(()=>0);
  assert(popped>0,device+": 新生成的演化链必须有出现动画");
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
  if(device!=="mobile"){
    // 拖到屏幕边缘要能自动滚动：树很长，目标经常不在同一屏，
    // 而 elementFromPoint 对视口外的点返回 null，不滚就永远够不着。
    await page.evaluate(()=>{S.topen={};const t=buildTree();
      const w=(id,pre,seen)=>{if(seen.includes(id))return;const k=pre?pre+"/"+id:id;S.topen[k]=1;
        (t.T[id]?.children||[]).forEach(x=>w(x,k,seen.concat(id)))};t.roots.forEach(r=>w(r,"",[]));render()});
    await page.waitForTimeout(400);
    const anyRow=page.locator('#tree .item[data-id^="A"] > .line .node-label').first();
    await anyRow.scrollIntoViewIfNeeded();await page.waitForTimeout(250);
    const src=await anyRow.boundingBox();
    const top=()=>page.evaluate(()=>document.body.scrollTop||document.scrollingElement.scrollTop);
    await page.mouse.move(src.x+20,src.y+src.height/2);await page.mouse.down();
    await page.mouse.move(src.x+45,src.y+src.height/2,{steps:3});
    const y0=await top();
    await page.mouse.move(src.x+45,(await page.evaluate(()=>innerHeight))-20,{steps:6});
    await page.waitForTimeout(700);
    const y1=await top();
    await page.mouse.up();await page.waitForTimeout(250);
    await page.evaluate(()=>document.querySelector(".relsheet")?.closest(".cog")?.remove());
    assert(y1>y0,device+": 拖到屏幕底边必须自动滚动，否则够不到屏幕外的节点（"+y0+" → "+y1+"）");
  }
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
  // 删除记录也必须先写成功；失败时原行与焦点保持不变。
  await page.evaluate(()=>{
    confirmDel=true;
    return delRow(D.p.rl.rows.findIndex(x=>x.uid==="A000000067"));
  });
  assert(JSON.stringify(store.get(rlPath))===beforeRows,device+": 删除失败不能丢掉原始认知");
  assert(await page.evaluate(()=>D.p.rl.rows.some(x=>x.uid==="A000000067")),
    device+": 删除失败应恢复本地认知");
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
  // A later explicit choice must supersede a previous switch that never committed global.
  denyFile="global.json";
  const failedSwitch=await page.evaluate(()=>pick("rl"));
  assert.equal(failedSwitch,false,device+": stale intent must begin with an interrupted switch");
  assert.equal(store.get("global.json").current,"quant");
  assert.equal(store.get("projects/rl/current.json").focus.syncPending,true);
  denyFile=null;
  assert(await page.evaluate(i=>setFocus("quant",i),quantIndex),device+": later explicit choice");
  await page.reload();
  await page.waitForFunction(()=>D.index.filter(x=>x.state!=="archived").every(x=>!!D.p[x.id])&&
    D.p.rl&&D.p.rl.current?.focus?.syncPending!==true);
  assert.equal(store.get("global.json").current,"quant",device+": interrupted older switch must not undo later choice");
  assert.equal(store.get("widget.json").focusUid,quantUID,device+": older switch must not redirect widget");
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
  await page.waitForFunction(()=>D.global?.current==="quant"&&!!D.p.quant&&
    D.p.quant.current?.focus?.syncPending===undefined&&D.widget?.project==="quant");
  assert(store.get("widget.json").project==="quant",device+": 刷新后补完小组件项目");
  assert(!store.get("projects/quant/current.json").focus.syncPending,
    device+": 三处同步完成后清除待恢复标记");
  console.log("Chromium "+device+"：global 成功 / widget 失败，刷新恢复成功");
  // 反例 1b：焦点 UID 已失效时不执行重新分析，也绝不发出写入请求。
  await page.waitForFunction(()=>!!D.p.rl); // 切到 quant 后其余项目后台异步载入
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
