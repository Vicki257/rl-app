// 独立检查真实 RL-data 的焦点标签，及模拟网络失败后旧切换不能覆盖较新的选择。
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const DD=path.join(__dirname,"..","..","rl-data","data");
const J=p=>JSON.parse(fs.readFileSync(path.join(DD,p),"utf8"));
const project=id=>Object.fromEntries(["project","rows","current","iteration"].map(k=>[k,J("projects/"+id+"/"+k+".json")]));
const cp=x=>JSON.parse(JSON.stringify(x));
const remote={"global.json":J("global.json"),"widget.json":J("widget.json")};
const D={p:{rl:project("rl"),quant:project("quant")},global:cp(remote["global.json"]),widget:cp(remote["widget.json"])};
for(const id of Object.keys(D.p))remote["projects/"+id+"/current.json"]=cp(D.p[id].current);
assert.equal(D.global.current,"rl");
let denyGlobal=false,globalBusy=false,holdGlobal=null,enterGlobal=null,holdCurrent=null;
const firstBlocked=new Promise(r=>{enterGlobal=r});
function pauseFirstGlobal(){
  let release;const promise=new Promise(r=>{release=r});holdGlobal={promise};return release;
}
const ctx={D,S:{},crypto:crypto.webcrypto,copyJSON:cp,cur:()=>D.global.current,render(){},toast(){},
  sortRows:a=>[...a].sort((x,y)=>Number(y.cols?.["优先程度"]||0)-Number(x.cols?.["优先程度"]||0)),
  DONE:{够用了:1,已确认:1,不做:1}, loadProject:async id=>D.p[id],sourceKey:()=>"test",
  PRI:"优先程度",REALC:"碰现实了吗",esc:String,topBar:()=>"",filterBar:()=>"",rowsTable:()=>"",stsOf:()=>[],
  nightState:c=>c.night?.status||"wait",next8:()=>null,
  put:async(file,value,msg)=>{
    if(holdCurrent&&file==="projects/rl/current.json"&&msg.startsWith("标为待分析")){
      const wait=holdCurrent;holdCurrent=null;wait.entered();await wait.release;
    }
    if(file==="global.json"){
      if(denyGlobal||globalBusy)throw Error("模拟网络或同文件写入冲突");
      if(holdGlobal!==null){
        globalBusy=true;enterGlobal();
        // Hold only the first global request.
        const release=holdGlobal.promise;holdGlobal=null;
        await release;globalBusy=false;
      }
    }
    remote[file]=cp(value);
  }};
vm.createContext(ctx);
function section(a,b){const start=html.indexOf(a),end=html.indexOf(b,start);assert(start>=0&&end>start,a);return html.slice(start,end)}
vm.runInContext(section("function widgetFrom(","/* ============ 导航")+
  section("function focusRow(P)","// 两个切换")+
  section("function topRowIdx(","function mainPage(")+
  section("function nightBlock(","const PRI=")+
  // 行详情按「这一条自己的栏目」渲染，这个函数在认知树那一段里
  (()=>{const a=html.indexOf("function rowColumns(pj,row){"),b=html.indexOf("\n}\n",a)+3;
    assert(a>=0&&b>a,"function rowColumns");return html.slice(a,b)})()+
  section("async function pick(","async function setStatus(")+
  section("async function reanalyze(","function iter(")+
  "this.api={pick,setFocus,finishFocusSync,focusRow,focusRowOf,topRowIdx,rowPage,reanalyze}",ctx);
const api=ctx.api;
(async()=>{
  const mode=process.argv[2];
  if(!mode||mode==="--night-only"){
    const P=D.p.quant,uid="B000000035";
    assert.equal(P.current.night.status,"done","真实旧焦点完成状态");
    assert.equal(P.rows.find(x=>x.uid===uid).night?.c,undefined,"新焦点没有分析");
    await api.setFocus("quant",P.rows.findIndex(x=>x.uid===uid));
    assert.equal(remote["widget.json"].focusUid,uid);
    assert.notEqual(remote["widget.json"].night.status,"done","尚未分析的新焦点不能继承旧焦点的完成状态");
    P.current.night={status:"wait"};
    const other=P.rows.findIndex(x=>x.uid==="B000000036");
    await api.setFocus("quant",other);
    assert.notEqual(remote["projects/quant/current.json"].night?.status,"wait","换焦点不是重新分析，不能把旧队列转到新 UID");
    if(mode)return;
    D.global.current=remote["global.json"].current="rl";
  }
  if(!mode||mode==="--same-day-only"){
    const P=D.p.rl,[a,b]=["A000000034","A000000037"].map(uid=>P.rows.find(x=>x.uid===uid));
    // 查找真实同一天的两条记录，不伪造原始 UID。
    const [first,second]=a&&b&&a.date===b.date?[a,b]:P.rows.flatMap((x,i)=>P.rows.slice(i+1)
      .filter(y=>x.uid&&y.uid&&x.date===y.date).map(y=>[x,y])).find(([x,y])=>!x.night?.c&&!y.night?.c);
    const saved=P.current;P.current={focus:{focusUid:first.uid},rowDate:first.date,night:{status:"wait"}};
    ctx.S.arg=[second.date,P.rows.indexOf(second),"rl"].join("|");
    const box=api.rowPage();P.current=saved;
    assert(!box.includes("当前问题来自这一条"),"同日的其他 UID 不能显示为当前问题");
    assert(!box.includes("等待 AI 分析"),"同日的其他 UID 不能继承正在等待的分析");
    if(mode)return;
  }
  if(!mode||mode==="--display-only"){
    assert.equal(api.focusRowOf(D.p.rl).uid,"A000000075","真实手动焦点");
    assert.equal(api.focusRow(D.p.rl).uid,"A000000067","真实自动最高优先级");
    assert.equal(D.p.rl.rows[api.topRowIdx(D.p.rl)]?.uid,"A000000075","列表今天标签必须与手动焦点一致");
    if(process.argv[2]==="--display-only")return;
  }
  const rlUID=D.p.rl.current.focus.focusUid,quantPath="projects/quant/current.json";
  async function verifyOverlap(){
    const release=pauseFirstGlobal(),first=api.pick("quant");
    await firstBlocked;
    const later=api.setFocus("rl",D.p.rl.rows.findIndex(x=>x.uid===rlUID));
    await new Promise(r=>setImmediate(r));
    release();
    assert.equal(await first,true);
    assert.equal(await later,true,"后一次手动选择必须等待前一次保存而不是被同文件互斥锁拒绝");
    assert.equal(remote["global.json"].current,"rl");
    assert.equal(remote["widget.json"].focusUid,rlUID);
  }
  async function verifyAnalysisOverlap(){
    let release,entered;
    const enteredWrite=new Promise(r=>{entered=r});
    holdCurrent={entered,release:new Promise(r=>{release=r})};
    const analysis=api.reanalyze("rl");
    await enteredWrite;
    assert.equal(await api.pick("quant"),true);
    const nextUid=D.p.quant.current.focus.focusUid;
    release();
    assert.equal(await analysis,true,"切换项目不取消旧项目自己的分析请求");
    D.global=cp(remote["global.json"]);D.widget=cp(remote["widget.json"]);
    for(const id of Object.keys(D.p))D.p[id].current=cp(remote["projects/"+id+"/current.json"]);
    await api.finishFocusSync("rl");
    assert.equal(remote["global.json"].current,"quant","旧项目的重新分析不得被恢复成切项目");
    assert.equal(remote["widget.json"].focusUid,nextUid);
    assert.equal(remote["projects/rl/current.json"].night.status,"wait","旧项目的分析请求应保存");
  }
  if(mode==="--overlap-only")return verifyOverlap();
  if(mode==="--analysis-overlap-only")return verifyAnalysisOverlap();
  denyGlobal=true;
  assert.equal(await api.pick("quant"),false,"模拟普通网络故障时切换只部分保存");
  assert.equal(remote[quantPath].focus.syncPending,true);
  assert.equal(remote["global.json"].current,"rl");
  denyGlobal=false;
  assert.equal(await api.setFocus("rl",D.p.rl.rows.findIndex(x=>x.uid===rlUID)),true,"用户重新选择了 RL");
  // 模拟刷新：重新载入真实数据中使用的同三份文件，执行读取时的恢复入口。
  D.global=cp(remote["global.json"]);D.widget=cp(remote["widget.json"]);
  for(const id of Object.keys(D.p)) D.p[id].current=cp(remote["projects/"+id+"/current.json"]);
  await api.finishFocusSync("quant");
  assert.equal(remote["global.json"].current,"rl","旧的中断切换不能覆盖后续手动选择");
  assert.equal(remote["widget.json"].focusUid,rlUID,"小组件不能改回旧的选择");
  assert.equal(remote[quantPath].focus.syncPending,undefined,"旧同步标志应安全清除");
  if(!mode){await verifyOverlap();await verifyAnalysisOverlap()}
  console.log("焦点一致性校验通过（真实 A75/A67、同日行、分析状态、重叠保存与刷新）");
})().catch(e=>{console.error(e);process.exitCode=1});
