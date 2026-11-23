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
let writes=[],fail=false;
const ctx={D,S:{},console,Date,JSON,Object,Array,Math,Set,String,Number,Boolean,RegExp,
 copyJSON:x=>JSON.parse(JSON.stringify(x)),esc:x=>String(x??""),cur:()=>D.global.current,
 trF:(o,k)=>o[k]||"",focusRowOf:P=>P.rows[0],curRow:P=>P.rows[0],
 topBar:()=>"",nav:()=>"",confirm:()=>true,prompt:()=>"新链",toast:()=>{},render:()=>{},
 put:async(p,x)=>{if(fail)throw Error("模拟远端保存失败");writes.push(JSON.parse(JSON.stringify(x)))}
};
vm.createContext(ctx);
vm.runInContext(html.slice(start,end)+"\nthis.api={buildTree,realCogUid,dragTarget,treeNode,askDragRel,confirmRel,saveRels,validateRels}",ctx);
vm.runInContext('cogSheet=(html,handler)=>{this.modal={html,click:(key,value)=>{const btn={dataset:{[key]:String(value)},classList:{contains:()=>false}};handler({target:{closest:()=>btn}},{remove(){}})}};return {}}',ctx);
const api=ctx.api,tick=()=>new Promise(r=>setTimeout(r,5));let count=0;
function ok(v,m){assert(v,m);count++}
function reset(chains=[]){D.rels={rels:[{from:a,to:b,rel:"关联",state:"已确认",why:"之前确认"}],chains:JSON.parse(JSON.stringify(chains))};
 writes=[];fail=false;ctx.modal=null;api.buildTree()}
function click(k,v){ok(!!ctx.modal,"必须展示选择窗口");ctx.modal.click(k,v)}
function check(){api.validateRels(D.rels);ok(D.rels.rels.every(x=>api.realCogUid(x.from)&&api.realCogUid(x.to)),"关系两端是真 UID");
 ok(D.rels.rels.some(x=>x.from===a&&x.to===b&&x.state==="已确认"),"保留原有已确认关系")}
(async()=>{
 // A：两条认知之间，先选择六种关系，再明确方向。
 reset();api.askDragRel(c,d);click("i",1);click("dir",0);await tick();
 ok(D.rels.rels.some(x=>x.from===c&&x.to===d&&x.rel==="修正"),"A 未保存真正 UID");
 ok(D.rels.chains.length===1,"A 不得产生重复链");check();
 // B：C 拖到 A→B 链，先选 B，再确认 B→C。
 reset([{id:"chain-a",name:"A 到 B",parent:"proj:rl",members:[a,b]}]);
 api.askDragRel(c,"chain-a");ok(ctx.modal.html.includes("data-member"),"B 必须选择链内成员");
 click("member",1);click("i",1);click("dir",1);await tick();
 ok(D.rels.rels.some(x=>x.from===b&&x.to===c&&x.rel==="修正"),"B 必须保存 B.uid→C.uid");
 ok(D.rels.chains.length===1&&new Set(D.rels.chains[0].members).size===3,"B 接长原链不重复");check();
 // C：双链先各选一个 UID，仍不得自动合并两条分支。
 reset([{id:"chain-a",name:"链甲",parent:"proj:rl",members:[a,b]},
 {id:"chain-b",name:"链乙",parent:"proj:rl",members:[c,d]}]);
 api.askDragRel("chain-a","chain-b");click("member",0);click("member",1);
 click("i",1);click("dir",0);await tick();
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
 console.log("四类拖动与关系安全反例通过：",count,"项（真实 RL-data，模拟写入）");
})().catch(e=>{console.error(e);process.exitCode=1});
