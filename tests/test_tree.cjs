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
const CODE=html.slice(a,b2).replace(/async function saveRels\(\)?[\s\S]*?\n\}\n/,"");

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
  focusRowOf:P=>P.rows.find(r=>r.date===P.current.rowDate)||P.rows[P.rows.length-1],
  curRow:P=>P.rows.find(r=>r.date===P.current.rowDate)||P.rows[P.rows.length-1],
  topBar:()=>"",nav:()=>"",put:async()=>{},toast:()=>{},go:()=>{},render:()=>{},
};
vm.createContext(ctx);
vm.runInContext(CODE+"\nthis.api={buildTree,mergeChain,relsOf,chainsOf,okRels,relBetween,relsTouching,chainOfUid,openPath,curUid,isEvo,TREEOF:()=>TREE};",ctx);
const {buildTree,mergeChain,relsOf,chainsOf,okRels,relBetween,relsTouching,chainOfUid,openPath,curUid,isEvo}=ctx.api;

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
ok(relBetween(r.from,r.to)===r,"查这两个 UID 要拿回同一条关系");
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
    for(let i=1;i<ms.length;i++){const rr=relBetween(ms[i-1],ms[i]);if(rr)seen.push(rr)}
    const all=cB.members.flatMap((x,i)=>cB.members.slice(i+1).map(y=>relBetween(x,y))).filter(Boolean);
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
// 公司必须用真实 UID 当身份
if(has){
  const t6=buildTree();
  const cos=(D.p.quant?.project?.sop?.cos)||[];
  cos.forEach(c=>{ok(c.uid&&t6.T[c.uid],"公司 "+c.id+" 要用它自己的永久 UID 当节点")});
  ok(cos.length>0,"应该读到公司档案");
}
if(!has){
  const strict=process.env.TREE_TEST_REQUIRE_REAL_DATA==="1"||process.argv.includes("--require-real-data");
  const msg="找不到相邻的 rl-data 仓库（"+DD+"），这一轮跑的是内置样本，不能当作真实数据的验证。";
  if(strict){console.error("认知树测试失败："+msg);process.exit(1)}
  console.warn("⚠ "+msg);
}
console.log("认知树测试通过：",n,"项断言（数据源："+(has?"真实 rl-data":"内置样本，未覆盖真实数据")+"）");
