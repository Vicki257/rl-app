// 四种拖动方式和非法端点的反例。使用真实 rl-data，绝不写远端。
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const start=html.indexOf("/* ============ 认知树 ============ */");
const parent=html.indexOf("function parentIn(",start);
const end=html.indexOf("\n",html.indexOf("return null}",parent));
assert(start>=0&&end>start,"无法提取真实认知树函数");
const DD=path.join(__dirname,"..","..","rl-data","data");
assert(fs.existsSync(path.join(DD,"rels.json")),"真实 RL-data 不存在，禁止以样本冒充通过");
const J=p=>JSON.parse(fs.readFileSync(path.join(DD,p),"utf8"));
const index=J("projects/index.json").filter(x=>x.state!=="archived");
const D={index,p:Object.fromEntries(index.map(x=>[x.id,{project:J("projects/"+x.id+"/project.json"),
 rows:J("projects/"+x.id+"/rows.json"),current:J("projects/"+x.id+"/current.json")}])),
 global:{current:"rl"},meth:J("methods.json"),hist:J("history.json"),cogtree:J("cogtree.json"),rels:{rels:[],chains:[]}};
const ids=(D.p.rl?.rows||[]).filter(x=>x.uid).map(x=>x.uid);
assert(ids.length>=5,"缺少至少五条真实 UID 认知");
const [a,b,c,d,e]=ids;
let writes=[],fail=false,nativeDialogs=0;
const ctx={D,S:{},console,Date,JSON,Object,Array,Math,Set,String,Number,Boolean,RegExp,
 copyJSON:x=>JSON.parse(JSON.stringify(x)),esc:x=>String(x??""),cur:()=>D.global.current,
 trF:(o,k)=>o[k]||"",focusRowOf:P=>P.rows[0],curRow:P=>P.rows[0],
 topBar:()=>"",nav:()=>"",confirm:()=>{nativeDialogs++;return true},prompt:()=>{nativeDialogs++;return "新链"},toast:()=>{},render:()=>{},
 put:async(p,x)=>{if(fail)throw Error("模拟远端保存失败");writes.push(JSON.parse(JSON.stringify(x)))}
};
vm.createContext(ctx);
vm.runInContext(html.slice(start,end)+"\nthis.api={buildTree,realCogUid,dragTarget,treeNode,askDragRel,confirmRel,saveRels,validateRels,ringOf,mergeable,dropTarget,askMove,doMove}",ctx);
// 拖完只弹一个面板：选成员（拖到链上时）、选关系、看方向（可反转）、给新链取名、确认。
// 这里用一个最小的假 DOM 驱动它；handler 用 closest(选择器) 判断点的是什么。
vm.runInContext(`cogSheet=(html,handler)=>{
  const fake=()=>({hidden:false,innerHTML:"",value:"",textContent:"",disabled:false,dataset:{},
    classList:{toggle(){},add(){},remove(){},contains:()=>false},focus(){}});
  const els={};const m={querySelector:sel=>els[sel]||(els[sel]=fake()),querySelectorAll:()=>[],remove(){m.gone=true}};
  this.modal={html,m,click:(kind,ds)=>{const btn=Object.assign(fake(),{dataset:ds||{}});
    handler({target:{closest:sel=>sel===kind?btn:null}},m)}};
  return m}`,ctx);
const api=ctx.api,tick=()=>new Promise(r=>setTimeout(r,5));let count=0;
function ok(v,m){assert(v,m);count++}
function reset(chains=[]){D.rels={rels:[{from:a,to:b,rel:"关联",state:"已确认",why:"之前确认"}],chains:JSON.parse(JSON.stringify(chains))};
 writes=[];fail=false;ctx.modal=null;api.buildTree()}
function click(kind,ds){ok(!!ctx.modal,"必须展示选择窗口");ctx.modal.click(kind,ds)}
// 面板里的方向默认按记录时间（早的在前）。要得到指定方向就按需点一次「反过来」。
const dOf=u=>(api.buildTree().T[u]||{}).d||"";
const byDate=(x,y)=>{const a1=dOf(x),b1=dOf(y);return a1&&b1?(a1<b1?-1:a1>b1?1:0):a1?-1:b1?1:0};
function finish(rel,from,to,name){
  click(".relbtn[data-i]",{i:String(["推翻","修正","继承","迁移","支持","关联"].indexOf(rel))});
  const def=[from,to].sort(byDate);
  if(def[0]!==from)click(".relswap");
  ctx.modal.m.querySelector(".chainname").value=name||"新链";
  click(".relgo");
}
function check(){api.validateRels(D.rels);ok(D.rels.rels.every(x=>api.realCogUid(x.from)&&api.realCogUid(x.to)),"关系两端是真 UID");
 ok(D.rels.rels.some(x=>x.from===a&&x.to===b&&x.state==="已确认"),"保留原有已确认关系")}
(async()=>{
 // A：两条认知之间，先选择六种关系，再明确方向。
 nativeDialogs=0;
 reset();api.askDragRel(c,d);finish("修正",c,d);await tick();
 // 原生 confirm()/prompt() 会被一些浏览器环境静默拦截，返回空值，
 // 结果就是「拖上去了但什么都没发生」。拖动这条路上一次都不许用。
 ok(nativeDialogs===0,"拖动合并不得调用原生 confirm/prompt，实际 "+nativeDialogs+" 次");
 ok(D.rels.rels.some(x=>x.from===c&&x.to===d&&x.rel==="修正"),"A 未保存真正 UID");
 ok(D.rels.chains.length===1,"A 不得产生重复链");check();
 // 真数据中的同日「关联」没有方向；反过来点选仍应确认原候选并保留证据。
 const association=J("rels.json").rels.find(x=>x.from==="A000000035"&&x.to==="A000000091"&&x.rel==="关联");
 ok(!!association,"必须读取真实关联候选");
 reset();D.rels.rels.push(JSON.parse(JSON.stringify(association)));
 await api.confirmRel(association.to,association.from,"关联");
 const linked=D.rels.rels.filter(r=>r.rel==="关联"&&
   [r.from,r.to].includes(association.from)&&[r.from,r.to].includes(association.to));
 ok(linked.length===1,"反向选择不得复制同一条无向关联");
 ok(linked[0].state==="已确认"&&linked[0].why===association.why,"应确认原候选并保留原文依据");
// B：C 拖到 A→B 链，先选 B，再确认 B→C。
 reset([{id:"chain-a",name:"A 到 B",parent:"proj:rl",members:[a,b]}]);
 api.askDragRel(c,"chain-a");ok(ctx.modal.html.includes("data-pick"),"B 必须选择链内成员");
 click("[data-pick]",{pick:"b",u:b});finish("修正",b,c);await tick();
 ok(D.rels.rels.some(x=>x.from===b&&x.to===c&&x.rel==="修正"),"B 必须保存 B.uid→C.uid");
 ok(D.rels.chains.length===1&&new Set(D.rels.chains[0].members).size===3,"B 接长原链不重复");check();
 // C：双链先各选一个 UID，仍不得自动合并两条分支。
 reset([{id:"chain-a",name:"链甲",parent:"proj:rl",members:[a,b]},
 {id:"chain-b",name:"链乙",parent:"proj:rl",members:[c,d]}]);
 api.askDragRel("chain-a","chain-b");click("[data-pick]",{pick:"a",u:a});click("[data-pick]",{pick:"b",u:d});
 finish("修正",a,d);await tick();
 ok(D.rels.rels.some(x=>x.from===a&&x.to===d&&x.rel==="修正"),"C 关系端点必须双选真实 UID");
 ok(D.rels.chains.length===2&&D.rels.chains.some(x=>x.id==="chain-a")&&D.rels.chains.some(x=>x.id==="chain-b"),"C 禁止自动合并分支");check();
 // 候选列表确认 B→C：两条已有演化链保持独立，只确认这一条关系。
 reset([{id:"chain-a",name:"链甲",parent:"proj:rl",members:[a,b]},
        {id:"chain-b",name:"链乙",parent:"proj:rl",members:[c,d]}]);
 D.rels.rels.push({from:b,to:c,rel:"修正",state:"候选",why:"原始候选"});
 await api.confirmRel(b,c,"修正");
 ok(D.rels.chains.length===2,"候选列表确认不得合并已有两条链");
 ok(D.rels.rels.filter(x=>x.from===b&&x.to===c&&x.rel==="修正").length===1,
    "候选列表确认不能复制原始关系");
 ok(D.rels.rels.find(x=>x.from===b&&x.to===c).state==="已确认",
    "应升级已有候选关系的状态");
 check();
 // 跨项目的演化关系只记录确认，不得改变原始项目归属。
 reset();
 const otherProject=Object.values(D.p.quant?.rows||[]).find(x=>x.uid)?.uid;
 ok(!!otherProject,"必须读到真实量化项目 UID");
 const origin=api.buildTree(),parentBefore=Object.values(origin.T).find(n=>(n.children||[]).includes(a))?.id;
 await api.confirmRel(a,otherProject,"修正");
 ok(D.rels.rels.some(x=>x.from===a&&x.to===otherProject&&x.state==="已确认"),
    "跨项目演化关系必须保留真实 UID");
 ok(D.rels.chains.length===0,"跨项目关系不能自动生成混合演化链");
 const now=api.buildTree(),parentAfter=Object.values(now.T).find(n=>(n.children||[]).includes(a))?.id;
 ok(parentBefore===parentAfter,"跨项目关系不能改变认知原来的树枝");
 // D：普通结构节点不能拖，不能打开任何关系窗口。
 reset();ok(!api.dragTarget("proj:rl"),"D 结构节点不可拖动");
 ok(api.treeNode("proj:rl","",[]).startsWith('<div draggable="false"'),"D DOM 必须禁止拖动");
 api.askDragRel("proj:rl",c);ok(ctx.modal===null&&writes.length===0,"D 拖动不产生选择或关系");
 // 伪造非法容器端点在保存入口被阻止，状态保持不变。
 let bad=JSON.parse(JSON.stringify(D.rels));bad.rels.push({from:"chain-x",to:c,rel:"修正"});
 const prev=JSON.stringify(D.rels);ok(!(await api.saveRels(bad,"非法")),"链 ID 关系应被拒绝");
 ok(prev===JSON.stringify(D.rels)&&writes.length===0,"非法关系不得改变正式状态");
 // 构造演化环：A→B、B→A 都已确认时不能写入。
 bad=JSON.parse(JSON.stringify(D.rels));
 bad.rels.push({from:c,to:d,rel:"修正",state:"已确认"},
               {from:d,to:c,rel:"继承",state:"已确认"});
 ok(!(await api.saveRels(bad,"环")),"演化环必须被拦截");
 ok(JSON.stringify(D.rels)===prev,"拒绝演化环后状态不变");
 // 远端写失败不可乐观确认。
 fail=true;const orig=JSON.stringify(D.rels);ok(!(await api.confirmRel(c,e,"支持")),"写入失败未阻止");
 ok(orig===JSON.stringify(D.rels),"失败不能改变已确认关系");fail=false;
 // 横向关系不能影响主归属。
 const before=api.buildTree(),parent=Object.values(before.T).find(x=>(x.children||[]).includes(c))?.id;
 await api.confirmRel(c,e,"迁移");
 const after=api.buildTree(),parent2=Object.values(after.T).find(x=>(x.children||[]).includes(c))?.id;
 ok(D.rels.chains.length===0&&parent===parent2,"横向关系不改变树归属");check();
 
 // SOP 节点（Continuity、Reflection、Compare……）有永久 UID，但它是结构不是认知：
 // 不能被拖、不能合进链，只能当「移到这里」的目的地。
 const rings=(D.p.rl.project.sop.nodes||[]).filter(n=>n.uid&&n.id);
 ok(rings.length>=3,"应读到真实的 SOP 环节点");
 const R=rings.find(n=>n.id==="reflection")||rings[1],C=rings.find(n=>n.id==="compare")||rings[2];
 ok(!!api.ringOf(R.uid)&&!api.mergeable(R.uid),"SOP 节点不是可合并的认知");
 ok(!api.dragTarget(R.uid)&&api.dropTarget(R.uid),"SOP 节点不能拖、只能当移动目的地");
 reset();ok(!(await api.confirmRel(c,C.uid,"继承")),"不能把认知和 SOP 节点合成关系");
 ok(!D.rels.rels.some(x=>x.from===C.uid||x.to===C.uid),"被拒之后不能留下指向 SOP 节点的关系");
 ctx.modal=null;api.askDragRel(c,C.uid);ok(!ctx.modal,"拖到 SOP 节点上不该弹合并面板");
 // 单条认知移到 Reflection：只改 cogtree.up，正文和编号不动
 reset();const rowBefore=JSON.stringify(D.p.rl.rows.find(x=>x.uid===e));
 ok(await api.doMove(e,R.uid),"移到 SOP 节点应成功");
 ok(D.cogtree.up[e]===R.id,"cogtree.up 必须写成环的 id，实际 "+D.cogtree.up[e]);
 ok(writes.length===1&&writes[0].up[e]===R.id,"写回的必须是 cogtree.json 的新归属");
 ok(JSON.stringify(D.p.rl.rows.find(x=>x.uid===e))===rowBefore,"移动不能改认知正文和编号");
 const parentNow=(()=>{const t=api.buildTree();for(const k in t.T)if((t.T[k].children||[]).includes(e))return k})();
 ok(parentNow===R.uid,"移动后树上必须真的挂在 "+R.name+" 下，实际 "+parentNow);
 // 整条演化链移到 Reflection：只改 parent
 reset([{id:"chain-mv",name:"要搬的链",parent:"proj:rl",members:[a,b]}]);
 ok(await api.doMove("chain-mv",R.uid),"链应能移到 SOP 节点下");
 ok(D.rels.chains[0].parent===R.uid&&D.rels.chains[0].members.join()===[a,b].join(),"链只改 parent，成员不变");
 // 保存失败：移动不算数
 reset([{id:"chain-mv",name:"要搬的链",parent:"proj:rl",members:[a,b]}]);fail=true;
 ok(!(await api.doMove("chain-mv",C.uid)),"保存失败时移动必须返回失败");
 ok(D.rels.chains[0].parent==="proj:rl","保存失败时链必须留在原位");
 fail=false;
 const upBefore=JSON.stringify(D.cogtree.up);fail=true;
 ok(!(await api.doMove(d,R.uid)),"认知移动保存失败必须返回失败");
 ok(JSON.stringify(D.cogtree.up)===upBefore,"认知移动保存失败时归属必须回滚");
 fail=false;
console.log("四类拖动与关系安全反例通过：",count,"项（真实 RL-data，模拟写入）");
})().catch(e=>{console.error(e);process.exitCode=1});
