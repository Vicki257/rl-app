// 运行：node tests/test_degrade.cjs
// 反例：仓库里缺 cogtree.json / rels.json 时，app 必须还能打开（认知树降级），
// 而 401/403/网络故障仍然必须报错，不许被当成空数据。
// 用真实 rl-data 的其余文件；所有请求都被拦截，不触网、不写任何仓库。
const {chromium}=require("playwright");
const fs=require("node:fs"),path=require("node:path");
const assert=require("node:assert/strict");

const APP=path.join(__dirname,"..","index.html");
const DATA=path.join(__dirname,"..","..","rl-data","data");
const hasReal=fs.existsSync(DATA);
const strict=process.env.TREE_TEST_REQUIRE_REAL_DATA==="1"||process.argv.includes("--require-real-data");
if(!hasReal){
  const msg="找不到相邻的 rl-data 仓库（"+DATA+"），这个用例必须用真实数据跑。";
  if(strict){console.error("降级测试失败："+msg);process.exit(1)}
  console.warn("⚠ "+msg+" 已跳过。");process.exit(0);
}
let n=0;const ok=(c,m)=>{assert(c,m);n++};

async function open(browser,{missing=[],status=404,body='{"message":"Not Found"}'}={}){
  const p=await browser.newPage({viewport:{width:1100,height:900}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  const miss=new Set(missing);
  await p.route("**/*",async r=>{
    const u=new URL(r.request().url());
    if(u.hostname==="api.github.com"){
      if(u.pathname.includes("/branches/"))
        return r.fulfill({status:200,contentType:"application/json",body:"{}"});
      const f=decodeURIComponent(u.pathname.split("/contents/data/")[1]||"");
      if(miss.has(f))return r.fulfill({status,contentType:"application/json",body});
      const fp=path.join(DATA,f);
      if(!fs.existsSync(fp))return r.fulfill({status:404,body:"nf"});
      return r.fulfill({status:200,contentType:"application/json",
        body:JSON.stringify({sha:"s"+f,content:fs.readFileSync(fp).toString("base64")})});
    }
    if(u.hostname==="vicki257.github.io")
      return r.fulfill({status:200,contentType:"text/html",body:fs.readFileSync(APP,"utf8")});
    return r.abort();
  });
  // 旧用户的配置：只有用户名、仓库和令牌，没有 branch
  await p.addInitScript(()=>localStorage.setItem("rl.cfg",
    JSON.stringify({owner:"Vicki257",repo:"rl-data",token:"x"})));
  await p.goto("https://vicki257.github.io/rl-app/");
  await p.waitForTimeout(2200);
  return {p,errs};
}

(async()=>{
const b=await chromium.launch();

// ① 正式版（读 main）缺这两张新表：必须照常打开
{
  const {p,errs}=await open(b,{missing:["cogtree.json","rels.json","cognotes.json"]});
  ok(await p.evaluate(()=>branch())==="main","正式 Pages 仍然读写 main");
  const nav=await p.locator("nav.nav button").count();
  ok(nav>0,"缺 cogtree/rels 时 app 必须还能打开，实际导航按钮 "+nav);
  const txt=await p.locator("#app").innerText();
  ok(!/读取失败/.test(txt),"不该停在读取失败页：\n"+txt.split("\n").slice(0,3).join(" | "));
  // 认知树降级：没有结构表就没有树枝，但不能炸
  await p.locator("nav.nav button[data-tab=tree]").click();
  await p.waitForTimeout(600);
  const t=await p.evaluate(()=>{try{const x=buildTree();
    return {roots:x.roots.length,missing:x.missing.length,rels:relsOf().length,chains:chainsOf().length}}
    catch(e){return {err:e.message}}});
  ok(!t.err,"缺表时 buildTree 不能抛错："+t.err);
  ok(t.rels===0&&t.chains===0,"缺 rels.json 时关系与链都应为空");
  ok(t.missing===0,"降级时不该出现悬空引用");
  ok(errs.length===0,"不该有未捕获异常："+errs.slice(0,2).join("；"));
  await p.close();
}

// ② 同样两张表，但服务器返回 403（权限/网络类故障）：必须报错，不许当成空数据
{
  const {p}=await open(b,{missing:["cogtree.json"],status:403,body:'{"message":"Forbidden"}'});
  const txt=await p.locator("#app").innerText();
  ok(/读取失败/.test(txt),"403 必须报错停下，不能伪装成空数据：\n"+txt.split("\n").slice(0,2).join(" | "));
  ok(await p.locator("nav.nav button").count()===0,"报错页不应进入正常界面");
  await p.close();
}

// ③ 500 也一样
{
  const {p}=await open(b,{missing:["rels.json"],status:500,body:"boom"});
  const txt=await p.locator("#app").innerText();
  ok(/读取失败/.test(txt),"500 必须报错停下：\n"+txt.split("\n").slice(0,2).join(" | "));
  await p.close();
}

// ④ 文件齐全时一切照旧
{
  const {p,errs}=await open(b,{missing:[]});
  await p.locator("nav.nav button[data-tab=tree]").click();await p.waitForTimeout(700);
  const t=await p.evaluate(()=>{const x=buildTree();
    return {nodes:Object.keys(x.T).length,rels:relsOf().length,cur:curUid()}});
  ok(t.nodes>400,"文件齐全时树应正常，实际 "+t.nodes+" 个节点");
  ok(t.rels===29,"应读到 29 条候选关系，实际 "+t.rels);
  ok(t.cur&&/^[A-D]\d{9}$/.test(t.cur),"当前位置应是一个永久 UID，实际 "+t.cur);
  ok(errs.length===0,"不该有未捕获异常："+errs.slice(0,2).join("；"));
  await p.close();
}

await b.close();
console.log("降级与读取失败测试通过：",n,"项断言（真实 rl-data）");
})().catch(e=>{console.error("降级测试失败：",e.message);process.exit(1)});
