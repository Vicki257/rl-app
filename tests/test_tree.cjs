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
        pains:[{ref:"2026-08-25",text:"痛点一",solved:false,gap:"缺口"}]}]}},
    rows:[{uid:"A000000063",date:"2026-07-06",q:"问题一",f:"够用了",cols:{"碰现实了吗":"有"}},
          {uid:"A000000060",date:"2026-07-17",q:"问题二",f:"待改",cols:{}}],
    current:{rowDate:"2026-07-17"}}},
  meth:{cats:["做产品"],methods:[{id:"m-1",uid:"A000000100",name:"方法一",cat:"做产品",what:"W",when:"WH",refs:["2026-08-03"]}]},
  hist:[{uid:"A000000200",date:"2026-07-09",text:"历史一"}],
  cogtree:{up:{A000000063:"continuity"},struct:{roots:["product","shared"],
    nodes:{product:{name:"产品",children:["proj:rl"]},shared:{name:"跨项目共用",children:["methods","history"]}}}},
  rels:{rels:[{from:"A000000063",to:"A000000060",rel:"修正",why:"因为",state:"候选"}],chains:[]},
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
vm.runInContext(CODE+"\nthis.api={buildTree,mergeChain,relsOf,chainsOf,chainOfUid,openPath,curUid,TREEOF:()=>TREE};",ctx);
const {buildTree,mergeChain,relsOf,chainsOf,chainOfUid,openPath,curUid}=ctx.api;

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
// 关系 → 链
const r=relsOf()[0];
ok(r,"应该有候选关系");
const id=mergeChain(r.from,r.to,r.rel,"测试链");
const c=chainsOf().find(x=>x.id===id);
ok(c,"合并应该产生一条链");
ok(c.members.includes(r.from)&&c.members.includes(r.to),"两条认知都要在链里");
ok(Object.values(c.links).includes(r.rel),"确认过的关系要落在链上");
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
// 链再接一条，关系不会被乱安
const other=Object.values(t2.T).find(x=>x.go&&!c.members.includes(x.id));
if(other){
  const id2=mergeChain(id,other.id,"继承","再接一条");
  const c2=chainsOf().find(x=>x.id===id2);
  ok(c2.members.length===c.members.length+1,"接长之后成员数应该加一");
  ok(Object.values(c2.links).filter(v=>v==="继承").length===1,"新关系只能落在一段上，不能替别的段做主张");
  ok(Object.values(c2.links).includes(r.rel),"原来确认过的关系不能丢");
  ok(!chainsOf().some(x=>x.id===id),"旧链应该被新链取代，不能两条并存");
}
console.log("认知树测试通过：",n,"项断言（数据源："+(has?"真实 rl-data":"内置样本")+"）");
