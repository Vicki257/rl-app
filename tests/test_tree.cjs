// 运行：node tests/test_tree.cjs
// 取 index.html 里真实的认知树代码，喂进真实的 rl-data（有就用，没有就用内置样本），
// 验证树能建起来、关系能落到链上。不触网，不写任何仓库。
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const assert=require("node:assert/strict");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const a=html.indexOf("/* ============ 认知树 ============ */");
const b=html.indexOf("function parentIn(");
const b2=html.indexOf("\n",html.indexOf("return null}",b));
assert(a>=0&&b>a&&b2>b,"未找到认知树代码");
const fa=html.indexOf("function focusRowOf("),fb=html.indexOf("const PendingFocus",fa);
assert(fa>=0&&fb>fa,"未找到真实焦点定位");
const CODE=html.slice(fa,fb)+html.slice(a,b2).replace(/async function saveRels\(\)?[\s\S]*?\n\}\n/,"");

const DD=path.join(__dirname,"..","..","rl-data","data");
const has=fs.existsSync(DD);
const J=p=>JSON.parse(fs.readFileSync(path.join(DD,p),"utf8"));
const sample={
  index:[{id:"rl",state:"active"}],
  p:{rl:{project:{name:"强化学习系统",goal:"G",reward:"R",
      sop:{nodes:[{uid:"A000000002",id:"continuity",name:"Continuity",q:"Q",
        pains:[{ref:"2026-08-25",text:"痛点一",solved:false,gap:"缺口"}]}],
        cos:[{uid:"B000000083",id:"2344",name:"某公司",state:"已完成",why:"便宜",verdict:"不投资"}]},
      tracks:[{name:"路线一",sops:[{name:"一套 SOP",when:"什么时候用",
        nodes:[{uid:"A000000300",name:"环一",q:"问"}]}]}]},
    rows:[{uid:"A000000063",date:"2026-07-06",q:"问题一",f:"够用了",cols:{"碰现实了吗":"有"}},
          {uid:"A000000060",date:"2026-07-17",q:"问题二",f:"待改",cols:{}},
          {uid:"A000000061",date:"2026-07-18",q:"问题三",f:"不做",cols:{}},
          {uid:"A000000075",date:"2026-11-18",q:"问题四",f:"待改",cols:{}}],
    current:{rowDate:"2026-11-18",focus:{uid:"A000000075",date:"2026-11-18",idx:3,q:"问题四",manual:true}}}},
  meth:{cats:["做产品"],methods:[
    {id:"m-1",uid:"A000000100",name:"方法一",cat:"做产品",what:"W",when:"WH",refs:["2026-08-03"]},
    {id:"m-2",uid:"A000000101",name:"方法二",cat:"做产品",what:"W2",when:"WH2",refs:["2026-08-10"]}]},
  hist:[{uid:"A000000200",date:"2026-07-09",text:"历史一"},
        {uid:"A000000201",date:"2026-07-10",text:"历史二"}],
  cogtree:{up:{A000000063:"continuity"},struct:{roots:["product","shared"],
    nodes:{product:{name:"产品",children:["proj:rl"]},shared:{name:"跨项目共用",children:["methods","history"]}}}},
  rels:{rels:[
    {from:"A000000063",to:"A000000060",rel:"修正",dir:"后者改掉了前者的部分判断",why:"因为",state:"候选"},
    {from:"A000000060",to:"A000000061",rel:"继承",dir:"后者保留了前者的有效部分",why:"因为",state:"候选"},
    {from:"A000000200",to:"A000000100",rel:"支持",dir:"前者是证据",why:"因为",state:"候选"},
    {from:"A000000201",to:"A000000101",rel:"关联",dir:"没有方向",why:"因为",state:"候选"}],chains:[]},
};

const D=has?{
  index:J("projects/index.json").filter(x=>x.state!=="archived"),
  p:Object.fromEntries(J("projects/index.json").filter(x=>x.state!=="archived").map(x=>[x.id,{
    project:J(`projects/${x.id}/project.json`),rows:J(`projects/${x.id}/rows.json`),
    current:J(`projects/${x.id}/current.json`)}])),
  meth:J("methods.json"),hist:J("history.json"),
  cogtree:J("cogtree.json"),rels:JSON.parse(JSON.stringify(J("rels.json"))),
  global:{current:"rl"},
}:{...sample,global:{current:"rl"}};
D.rels.chains=D.rels.chains||[];

const ctx={D,S:{},console,Date,Object,Array,JSON,Math,String,Number,Boolean,RegExp,Set,
  esc:s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),
  cur:()=>D.global.current, trF:(o,k)=>o[k]||"",
  curRow:P=>P.rows.find(r=>r.date===P.current.rowDate)||P.rows[P.rows.length-1],
  topBar:()=>"",nav:()=>"",put:async()=>{},toast:()=>{},go:()=>{},render:()=>{},
};
vm.createContext(ctx);
vm.runInContext(CODE+"\nthis.api={rowColumns,buildTree,mergeChain,relsOf,chainsOf,okRels,relBetween,relsBetween,relsTouching,chainOfUid,openPath,curUid,isEvo,realCogUid,validateRels,TREEOF:()=>TREE};",ctx);
const {rowColumns,buildTree,mergeChain,relsOf,chainsOf,okRels,relBetween,relsBetween,relsTouching,chainOfUid,openPath,curUid,isEvo}=ctx.api;

let n=0;const ok=(c,m)=>{assert(c,m);n++};
const t=buildTree();
ok(Object.keys(t.T).length>(has?100:5),"树应该建出节点，实际 "+Object.keys(t.T).length);
ok(t.roots.length>0,"应该有顶层节点");
// 每个 children 指向的 id 都必须存在
Object.values(t.T).forEach(x=>(x.children||[]).forEach(c=>ok(t.T[c],x.id+" 指向了不存在的 "+c)));
// 没有节点把自己当孩子
Object.values(t.T).forEach(x=>ok(!(x.children||[]).includes(x.id),x.id+" 把自己当成了孩子"));
// 认知节点能回到它原本的页面
const goable=Object.values(t.T).filter(x=>x.go);
ok(goable.length>0,"应该有节点能跳回原页面");
goable.forEach(x=>ok(x.arg!==undefined&&x.arg!=="","节点 "+x.id+" 缺少跳转参数"));
// 当前位置找得到，并且能展开到它
ok(curUid(),"应该能算出当前停在哪一条");
ok(openPath().length>0,"应该能把当前位置那条路径展开");
 // 反例：数组重排或旧下标不能让「定位当前」指到别人的认知。
 {
   const P=D.p.rl,uid=curUid(),saved=JSON.parse(JSON.stringify(P.current.focus||{}));
   P.rows.reverse();ok(curUid()===uid,"行重排不能改变当前认知 UID");
   P.rows.reverse();
   P.current.focus={focusUid:"__missing_uid__",idx:0,manual:true};
   ok(curUid()==="","失效的 UID 不能回退到易漂移的 idx");
   P.current.focus=saved;
   const other=P.rows.find(r=>r.uid&&r.uid!==uid)?.uid;
   if(other&&uid){
     D.rels.chains=[{id:"chain-focus-test",name:"定位测试链",parent:"proj:rl",members:[uid,other]}];
     buildTree();
     ok((ctx.api.TREEOF().inChain||{})[uid]==="chain-focus-test","链内当前认知应指向它所在的链");
     ok(openPath().length>0,"链内当前认知的父路径可展开");
     D.rels.chains=[];buildTree();
   }
 }
// 关系 → 链（只有演化关系才成链）
const r=relsOf().find(x=>["推翻","修正","继承"].includes(x.rel)&&t.T[x.from]&&t.T[x.to]);
ok(r,"应该有可以成链的演化关系");
const id=mergeChain(r.from,r.to,"测试链");
const c=chainsOf().find(x=>x.id===id);
ok(c,"合并应该产生一条链");
ok(c.members.includes(r.from)&&c.members.includes(r.to),"用户确认的两条都要在链里");
ok(c.links===undefined,"链里不存关系，关系只有 rels.json 一个来源");
ok(t.T[c.parent],"链要挂在一个真实存在的节点下，实际 "+c.parent);
// 链成员按时间排，且不再单独挂在树上
const t2=buildTree();
const dates=c.members.map(u=>(t2.T[u]||{}).d||"").filter(Boolean);
ok(dates.slice().sort().join()===dates.join()||c.members.length<2,"链成员应按时间排序");
ok(t2.T[id],"链应该出现在树里");
c.members.forEach(u=>{
  let found=false;(function w(ids,anc){for(const x of ids){if(anc.includes(x))continue;
    if(x===u){found=true;return}w((t2.T[x]||{}).children||[],anc.concat([x]))}})(t2.roots,[]);
  ok(!found,"被合并的 "+u+" 不该再单独挂在树上")});
ok(chainOfUid(r.from)?.id===id,"应该能从认知找回它所在的链");
// 关系查询必须认准这两个 UID，方向写死在 rels.json 里
r.state="已确认";
// 同一对 UID 之间可以不止一条关系（真实数据里就有：一条候选的修正、一条你确认过的继承），
// 查询必须把这一条也带回来，不能只挑第一条。
ok(relsBetween(r.from,r.to).includes(r),"查这两个 UID 要能拿回这一条关系");
const outsider=Object.values(t2.T).find(x=>x.go&&x.id!==r.from&&x.id!==r.to);
if(outsider)ok(!relBetween(r.from,outsider.id),"没确认过的两端之间不能凭空有关系");
r.state="候选";
D.rels.chains=[];
// ---- 反例：关系端点、重复链、环、横向关系、悬空引用 ----
// 关系必须落在用户确认的那两个 UID 上，不能因为排序挂到别人头上
const t3=buildTree();
const evoRels=relsOf().filter(x=>["推翻","修正","继承"].includes(x.rel)&&t3.T[x.from]&&t3.T[x.to]);
ok(evoRels.length>0,"应该有可以成链的演化关系");
{
  const r1=evoRels[0];
  D.rels.chains=[];
  const idA=mergeChain(r1.from,r1.to,"第一条");
  const cA=chainsOf().find(x=>x.id===idA);
  ok(cA.members.includes(r1.from)&&cA.members.includes(r1.to),"链要含用户确认的两端");
  ok(cA.links===undefined,"链里不该自己存一份关系，关系只认 rels.json");
  // 接第三条：原来确认过的关系不能丢，也不能凭空多出关系
  const third=Object.values(buildTree().T).find(x=>x.go&&!cA.members.includes(x.id));
  if(third){
    const idB=mergeChain(idA,third.id,"接长");
    const cB=chainsOf().find(x=>x.id===idB);
    ok(cB.members.length===cA.members.length+1,"接长后成员数加一");
    ok(!chainsOf().some(x=>x.id===idA),"旧链要被取代，不能两条并存（现有 "
      +JSON.stringify(chainsOf().map(z=>z.id))+"，旧链 "+idA+"，新链 "+idB+"）");
    r1.state="已确认";
    const seen=[];
    const ms=cB.members.slice().sort((x,y)=>{const a=(buildTree().T[x]||{}).d||"",b=(buildTree().T[y]||{}).d||"";
      return a&&b?(a<b?-1:a>b?1:0):a?-1:b?1:0});
    for(let i=1;i<ms.length;i++)seen.push(...relsBetween(ms[i-1],ms[i]));
    // 一对之间可以有多条关系，全部取回来，不只取「恰好一条」的情况
    const all=cB.members.flatMap((x,i)=>cB.members.slice(i+1).flatMap(y=>relsBetween(x,y)));
    ok(all.includes(r1),"用户确认过的那条关系必须还在链上找得到");
    all.forEach(rr=>ok(rr.state==="已确认","链上出现了没确认过的关系："+rr.from+"→"+rr.to));
    r1.state="候选";
  }
  // 传链里的成员 UID（不是链 ID）也要正确取代旧链，不能变成两条
  const idC=mergeChain(chainsOf()[0].members[0],
    (Object.values(buildTree().T).find(x=>x.go&&!chainsOf()[0].members.includes(x.id))||{}).id||r1.to,"用成员接长");
  ok(chainsOf().length===1,"用成员 UID 接长之后仍然只有一条链，实际 "+chainsOf().length);
  const seenU={};
  chainsOf().forEach(c=>c.members.forEach(u=>{ok(!seenU[u],"认知 "+u+" 进了两条链");seenU[u]=1}));
  D.rels.chains=[];
}
// 横向关系（迁移/支持/关联）不该把节点从树上搬走
{
  const side=relsOf().find(x=>["迁移","支持","关联"].includes(x.rel));
  if(side){
    side.state="已确认";
    const t4=buildTree();
    const onTree=u=>{let f=false;(function w(ids,anc){for(const x of ids){if(anc.includes(x))continue;
      if(x===u){f=true;return}w((t4.T[x]||{}).children||[],anc.concat([x]))}})(t4.roots,[]);return f};
    ok(onTree(side.from)&&onTree(side.to),"横向关系确认后两端都要留在树上原位");
    ok(!chainsOf().length,"横向关系不该生成演化链");
    ok(relsTouching(side.from).includes(side),"横向关系要能从节点那边查到");
    side.state="候选";
  }
}
// 树里不能有多节点的环
{
  const t5=buildTree(),state={};let cyc=null;
  const walk=id=>{if(state[id]===1){cyc=id;return}if(state[id]===2)return;state[id]=1;
    ((t5.T[id]||{}).children||[]).forEach(walk);state[id]=2};
  t5.roots.forEach(walk);
  ok(!cyc,"树里出现了环，起点 "+cyc);
  ok(!t5.missing.length,"有指向不存在节点的边："+t5.missing.slice(0,3).join("、"));
}
// 每日思考日志不作为独立树枝
{
  const t7=buildTree();
  ok(!t7.T["proj:journal"],"每日思考日志不该在树上单独占一枝");
  if(has)ok((D.index||[]).some(x=>x.id==="journal"),"但它仍然在项目清单里（数据照常加载）");
}
// 认知树只显示有永久 UID 的认知，流程示意节点只在原 SOP 画布显示，不能混进认知树
{
  const project=D.p.rl.project;
  const fake={id:"__ui_only__",name:"你／前台（仅流程示意）",kind:"plain",q:"模拟有说明文字但没有 UID 的装饰节点"};
  project.sop.nodes.push(fake);
  const preview=buildTree();
  ok(!preview.T["sop:rl:__ui_only__"],"没有永久 UID 的装饰节点不能出现在认知树，即使它有其他文字字段");
  project.sop.nodes.pop();
  const clean=buildTree();
  for(const pid of ["rl","quant","wealth","people"]){
    const p=D.p[pid]?.project;if(!p)continue;
    const nodes=[...(p.sop?.nodes||[])];
    for(const tk of p.tracks||[])for(const so of tk.sops||[])nodes.push(...(so.nodes||[]));
    for(const item of nodes){
      if(item.uid)ok(!!clean.T[item.uid],pid+" 的认知 "+item.uid+" 必须保留在树中");
      else if(pid==="rl"&&item.id&&["you","ui","chat","raw"].includes(item.id))
        ok(!Object.values(clean.T).some(n=>n.name===item.name&&n.id.startsWith("sop:rl:")),
           "不展示流程示意节点："+item.name);
    }
  }
}
// 新方法在 ids.py 分配 UID 前只是待发号记录，不得伪装为认知节点。
{
  const methods=D.meth.methods;
  const unnumbered={id:"m-pending-test",name:"尚未领取永久 UID",cat:"测试分类",what:"等待发号"};
  methods.push(unnumbered);
  const pendingTree=buildTree();
  ok(!pendingTree.T["m:m-pending-test"],"无 UID 的已提交方法不得出现为认知叶节点");
  ok(!Object.values(pendingTree.T).some(n=>n.name===unnumbered.name),
     "待发号方法不能通过别的名称进入认知树");
  methods.pop();
}
// 目标/奖励和 pains 只保留在详情，不得成为没有 UID 的独立叶节点。
{
  const t=buildTree();
  for(const pid of ["rl","quant","wealth","people"]){
    ok(!t.T[pid+":goal"]&&!t.T[pid+":reward"],pid+" 目标和奖励不能伪装为独立认知");
    const project=D.p[pid]?.project;
    for(const n of project?.sop?.nodes||[]){
      if(!n.uid)continue;
      const inTree=t.T[n.uid];
      ok(!!inTree,"原 SOP 真实 UID 必须保留："+n.uid);
      ok(!(inTree.children||[]).some(u=>String(u).includes(":pain")),
         "pains[] 无 UID，不得当作认知叶节点："+n.uid);
    }
  }
}
// 同一对 UID 有多条关系时，不能只挑第一条
{
  const r=relsOf()[0];
  const extra={from:r.from,to:r.to,rel:r.rel==="修正"?"支持":"修正",dir:"测试用",why:"测试用",state:"已确认"};
  const keep=r.state;r.state="已确认";D.rels.rels.push(extra);
  const all=relsBetween(r.from,r.to);
  // 期望值按数据现算：这一对在仓库里可能本来就有别的已确认关系
  const expected=okRels().filter(x=>(x.from===r.from&&x.to===r.to)||(x.from===r.to&&x.to===r.from)).length;
  ok(expected>=2&&all.length===expected,"这一对的全部已确认关系都要拿回来，应 "+expected+" 实际 "+all.length);
  ok(all.includes(r)&&all.includes(extra),"不能漏掉任何一条");
  D.rels.rels.pop();r.state=keep;
}
// 历史认知不默认已完成
if(has){
  const t8=buildTree();
  const h=(D.hist||[]).filter(x=>x.uid);
  ok(h.length>0,"应该读到历史认知");
  ok(h.every(x=>!(t8.T[x.uid]||{}).status),"历史认知没有验收记录，不该默认标成已完成");
}
// 公司必须用真实 UID 当身份
if(has){
  const t6=buildTree();
  const cos=(D.p.quant?.project?.sop?.cos)||[];
  cos.forEach(c=>{
    ok(c.uid&&t6.T[c.uid],"公司 "+c.id+" 要用它自己的永久 UID 当节点");
    ok(t6.T[c.uid].go==="co"&&t6.T[c.uid].arg==="quant|"+c.id,
       "公司 "+c.id+" 点击后必须进入 quant|"+c.id+"，不是裸代码");
  });
  ok(cos.length===16,"这批应该恰好验证 16 家公司，实际 "+cos.length);
  // 真正的 rels.json 所有端点必须来自数据记录的 uid，而不是链或层级 ID。
  relsOf().forEach(r=>{
    ok(ctx.api.realCogUid(r.from)&&ctx.api.realCogUid(r.to),
       "rels.json 存在非法或悬空认知端点："+r.from+" → "+r.to);
  });
  ctx.api.validateRels(D.rels);ok(true,"真实关系和链 UID 安全校验通过");
}
// 有内容的字段永远要显示：每日思考迁过来的 7 条曾经因为字段名不在项目栏目里，
// 页面上全是空的，看起来就像内容丢了。
{
  const pj={columns:["优先程度","为什么要改动","改了什么（第几版）"]};
  const r1={cols:{"为什么要改动":"x","结论":"藏着的内容","空栏":""}};
  const c1=rowColumns(pj,r1);
  ok(c1.includes("结论"),"不在项目栏目里、但有内容的字段必须显示，实际 "+c1.join("／"));
  ok(!c1.includes("空栏"),"空的非项目字段不必显示");
  ok(!c1.includes("优先程度"),"优先程度在页头单独显示，不重复列出");
  const r2={columns:["结论","依据与验证状态","优先程度"],cols:{"结论":"a","依据与验证状态":"b","为什么要改动":"旧"}};
  const c2=rowColumns(pj,r2);
  ok(c2[0]==="结论"&&c2[1]==="依据与验证状态","这一条有自己的栏目时按自己的顺序");
  ok(c2.includes("为什么要改动"),"自己的栏目之外、仍有内容的字段也不能藏");
  if(has){
    const moved=(D.p.rl.rows||[]).filter(r=>r.from==="每日思考日志");
    ok(moved.length===7,"从每日思考迁来的应是 7 条，实际 "+moved.length);
    moved.forEach(r=>{
      ok(!("详细" in (r.cols||{})),r.uid+" 不该再有揉成一团的「详细」");
      const cs=rowColumns(D.p.rl.project,r);
      ok(cs[0]==="结论"&&cs[1]==="依据与验证状态",r.uid+" 应按原日志的栏目显示，实际 "+cs.join("／"));
      ok(String(r.cols["结论"]||"").trim(),r.uid+" 的「结论」不能是空的");
    });
  }
}
// 独立研究分支和演化链分开：不改变原有认知的永久 UID 和关系。
{
  const P=D.p.rl, savedRows=P.rows.slice(), savedChains=D.rels.chains;
  const parent=P.rows.find(r=>r.uid==="A000000075")||P.rows.find(r=>r.uid);
  const other=P.rows.find(r=>r.uid&&r.uid!==parent.uid);
  const child={uid:"A999999991",date:"2026-11-26",q:"候选方案",parentUid:parent.uid,f:"待改",cols:{}};
  const grand={uid:"A999999992",date:"2026-11-26",q:"候选方案的细节",parentUid:child.uid,f:"待改",cols:{}};
  D.rels.chains=[];
  P.rows.push(child,grand);
  let tr=buildTree();
  ok(tr.T[parent.uid].children.includes(child.uid),"普通认知应有独立子节点");
  ok(tr.T[child.uid].children.includes(grand.uid),"子节点也能继续分枝");
  ok(Object.values(tr.T).filter(x=>x.children.includes(child.uid)).length===1,"子认知不可重复出现在树上");
  D.rels.chains=[{id:"chain-child-test",name:"有分支的演化链",parent:"proj:rl",members:[parent.uid,other.uid]}];
  tr=buildTree();
  ok(tr.T["chain-child-test"].children.includes(child.uid),"父认知合入演化链后分支仍可见");
  ok(tr.T[child.uid].children.includes(grand.uid),"演化链下仍保留多层分支");
  ok(!tr.T["chain-child-test"].children.includes(parent.uid),"不改变链成员原有展示语义");
  child.parentUid=grand.uid; // 制造循环引用：不能让两条记录消失
  D.rels.chains=[];
  tr=buildTree();
  const reachable=new Set(),visit=u=>{if(reachable.has(u))return;reachable.add(u);(tr.T[u]?.children||[]).forEach(visit)};
  tr.roots.forEach(visit);
  ok(reachable.has(child.uid)&&reachable.has(grand.uid),"循环引用必须安全退回原位置");
  P.rows=savedRows;D.rels.chains=savedChains;buildTree();
}
if(!has){
  const strict=process.env.TREE_TEST_REQUIRE_REAL_DATA==="1"||process.argv.includes("--require-real-data");
  const msg="找不到相邻的 rl-data 仓库（"+DD+"），这一轮跑的是内置样本，不能当作真实数据的验证。";
  if(strict){console.error("认知树测试失败："+msg);process.exit(1)}
  console.warn("⚠ "+msg);
}
console.log("认知树测试通过：",n,"项断言（数据源："+(has?"真实 rl-data":"内置样本，未覆盖真实数据")+"）");
