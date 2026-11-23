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
const [selected,target]=others;
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
  let denyWrites=false,writeCount=0;
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
      writeCount++;
      if(denyWrites)return fulfill(401,{message:"simulated denial"});
      const payload=JSON.parse(req.postData()||"{}");
      if(payload.branch!==branch)return fulfill(400,{message:"wrong write branch"});
      if(payload.sha!=="rev"+(revs.get(file)||1))return fulfill(409,{message:"stale SHA"});
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
  const outsider=rows.map(x=>x.uid).find(x=>![focus,selected,target].includes(x));
  assert(outsider,"缺少额外认知用于失败反例");
  const countBefore=store.get("rels.json").rels.length;
  await page.locator('#tree .item[data-id="'+outsider+'"] > .line > .name')
    .dragTo(page.locator('#tree .item[data-id="'+newId+'"] > .line > .name'));
  await page.locator(".relsheet [data-member='0']").click();
  await page.locator(".relsheet [data-i='4']").click(); // 支持：横向
  await page.locator(".relsheet [data-dir='0']").click();
  await page.waitForFunction(()=>document.body.textContent.includes("没能写回仓库"));
  assert(store.get("rels.json").rels.length===countBefore,device+": 失败保存不应修改正式数据");
  assert(writeCount>=2,device+": 测试必须真正发生模拟 GitHub PUT");
  await context.close();
  console.log("Chromium "+device+"：当前定位、链成员拖动、方向、保存、刷新与失败回滚通过");
}
(async()=>{await listen();const browser=await chromium.launch({headless:true});
  try{await scenario(browser,"desktop");await scenario(browser,"mobile")}
  finally{await browser.close();await close()}
})().catch(e=>{console.error(e);process.exitCode=1;close().catch(()=>{})});
