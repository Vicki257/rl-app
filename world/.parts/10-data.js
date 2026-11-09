/* ============================================================
   第一层：真实数据层（无损导入）
   原始 JSON 全文保存在 RAW.files，任何界面都能回到原文。
   ============================================================ */
const RAW={files:{},meta:{},source:''};
const GH='https://raw.githubusercontent.com/Vicki257/rl-data/main/data/';
const TOPLEVEL=['global.json','widget.json','status.json','history.json','methods.json','bottleneck.json','projects/index.json'];
const PERPROJ=['project.json','rows.json','current.json','iteration.json'];

async function fetchJSON(u){const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(r.status+' '+u);return r.json()}

// 项目从 projects/index.json 发现，不写死五个项目
async function loadLive(){
  const files={};
  for(const f of TOPLEVEL){try{files[f]=await fetchJSON(GH+f)}catch(e){if(f==='projects/index.json')throw e}}
  const idx=files['projects/index.json']||[];
  for(const p of idx){for(const f of PERPROJ){
    const rel='projects/'+p.id+'/'+f;
    try{files[rel]=await fetchJSON(GH+rel)}catch(e){/* 该项目没有这个文件：记录缺失，不编造 */}
  }}
  RAW.files=files;RAW.meta={source:'live',generatedAt:new Date().toISOString(),fileCount:Object.keys(files).length};RAW.source='GitHub 实时读取（只读）';
}
async function loadSnapshot(){
  const s=await fetchJSON('snapshot.json');
  RAW.files=s.files;RAW.meta=s.meta;RAW.source='本地快照 snapshot.json（commit '+String(s.meta.commit||'?').slice(0,7)+'）';
}
async function loadRaw(){
  const pref=localStorage.getItem('rlworld.source')||'snapshot';
  const order=pref==='live'?[loadLive,loadSnapshot]:[loadSnapshot,loadLive];
  let err=null;
  for(const fn of order){try{await fn();return}catch(e){err=e}}
  throw err||new Error('没有可用数据源');
}

/* ---------- 稳定标识：日期不唯一、下标会变，所以用 来源+日期+内容指纹 ---------- */
function h8(s){let h=0x811c9dc5;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return('0000000'+h.toString(16)).slice(-8)}
function rid(kind,proj,date,text){return kind+':'+proj+':'+(date||'nodate')+':'+h8(text)}

/* ---------- 导入：每个项目按自己实际存在的字段读，不假设字段一致 ---------- */
const IMP={projects:[],recs:{},byProj:{},issues:{dup:[],unmatched:[],missing:[],lag:[]},order:[]};

function put(rec){
  if(IMP.recs[rec.id]){
    const old=IMP.recs[rec.id];
    const same=JSON.stringify(old.raw)===JSON.stringify(rec.raw);
    IMP.issues.dup.push({id:rec.id,same,a:old.src,b:rec.src});
    if(same)return old;                 // 重复导入不重复建节点
    rec.id=rec.id+'~'+h8(JSON.stringify(rec.raw)); // 同指纹不同内容：另立一条，不合并
  }
  IMP.recs[rec.id]=rec;IMP.order.push(rec.id);
  (IMP.byProj[rec.proj]=IMP.byProj[rec.proj]||[]).push(rec.id);
  return rec;
}
const F=p=>RAW.files[p];

function runImport(){
  IMP.projects=[];IMP.recs={};IMP.byProj={};IMP.order=[];IMP.issues={dup:[],unmatched:[],missing:[],lag:[]};
  const index=F('projects/index.json')||[];
  for(const meta of index){
    const id=meta.id, P=F('projects/'+id+'/project.json');
    if(!P){IMP.issues.missing.push('projects/'+id+'/project.json');continue}
    const rows=F('projects/'+id+'/rows.json')||[], cur=F('projects/'+id+'/current.json')||null, it=F('projects/'+id+'/iteration.json')||null;
    if(!F('projects/'+id+'/rows.json'))IMP.issues.missing.push('projects/'+id+'/rows.json');
    // 每个项目自己的完成判据与证据口径
    const done=Array.isArray(P.done)?P.done:[], states=Array.isArray(P.states)?P.states:[];
    const hasEv=rows.some(r=>typeof r.ev==='number');
    const proj={id,name:meta.name||P.name||id,state:meta.state,goal:P.goal||'',reward:P.reward||'',reality:P.reality||'',
      mainline:P.mainline||null,doing:P.doing||null,insights:P.insights||[],columns:P.columns||[],labels:P.labels||{},
      done,states,hasEv,evScale:hasEv?'本项目 rows[].ev 存在（0–5 口径仅在定义过的项目内使用）':'本项目没有 ev 字段，不套用其他项目的证据等级',
      sop:P.sop||null,tracks:P.tracks||[],mains:P.mains||[],cos:(P.sop&&P.sop.cos)||[],ppl:P.ppl||[],gaps:P.gaps||[],
      current:cur,iteration:it,rowCount:rows.length,raw:P};
    IMP.projects.push(proj);

    rows.forEach((r,i)=>{
      const q=(r.q||'').trim();
      const rec={kind:'row',proj:id,date:r.date||'',title:q||'（无问题文本）',
        id:rid('row',id,r.date,q||('idx'+i)),
        src:{path:'projects/'+id+'/rows.json',idx:i,note:'下标仅作溯源，不作长期 ID'},
        state:r.f||'',open:!done.includes(r.f),closedAt:r.closedAt||null,
        ev:(typeof r.ev==='number')?r.ev:null, main:r.main||null, cols:r.cols||{}, raw:r};
      if(!q)IMP.issues.unmatched.push({why:'rows 里没有问题文本，无法建稳定 ID 之外的认知节点',src:rec.src});
      put(rec);
    });

    // SOP 流程节点：是流程，不是认知问题 —— kind 单独标记
    if(P.sop&&Array.isArray(P.sop.nodes))P.sop.nodes.forEach(n=>put({kind:'sopnode',proj:id,date:'',title:n.name||n.id,
      id:'sop:'+id+':'+n.id,src:{path:'projects/'+id+'/project.json',idx:'sop.nodes'},sopKind:n.kind||'',raw:n}));
    // tracks：可能自带整条逻辑链（节点 + 边），这是数据里已有的结构
    (P.tracks||[]).forEach((t,ti)=>{
      put({kind:'track',proj:id,date:'',title:t.name||t.id,id:'track:'+id+':'+h8(t.name||t.id),
        src:{path:'projects/'+id+'/project.json',idx:'tracks['+ti+']'},raw:t});
      (t.sops||[]).forEach((s,si)=>{
        if(s.ref)return; // 引用原 SOP，不复制
        const cid='chain:'+id+':'+h8(s.name||('sop'+si));
        put({kind:'chain',proj:id,date:'',title:s.name||('候选 SOP '+si),id:cid,version:s.version||'',when:s.when||'',
          src:{path:'projects/'+id+'/project.json',idx:'tracks['+ti+'].sops['+si+']'},raw:s});
        (s.nodes||[]).forEach(n=>put({kind:'layer',proj:id,date:'',title:n.name||n.id,chain:cid,nodeId:n.id,
          id:cid+':'+n.id,q:n.q||n.whole||'',src:{path:'projects/'+id+'/project.json',idx:'tracks['+ti+'].sops['+si+'].nodes'},raw:n}));
      });
    });
    (P.mains||[]).forEach((m,i)=>put({kind:'main',proj:id,date:'',title:m.name||m.id,id:'main:'+id+':'+m.id,
      src:{path:'projects/'+id+'/project.json',idx:'mains['+i+']'},state:m.st||'',raw:m}));
    // 公司研究档案：深层原始材料（steps/meta/revs）整条保留
    ((P.sop&&P.sop.cos)||[]).forEach((c,i)=>put({kind:'case',proj:id,date:c.base||'',title:c.name||c.id,id:'case:'+id+':'+c.id,
      src:{path:'projects/'+id+'/project.json',idx:'sop.cos['+i+']'},verdict:c.verdict||'',state:c.state||'',raw:c}));
    (P.ppl||[]).forEach((p,i)=>put({kind:'person',proj:id,date:'',title:p.name||('人物'+i),id:'ppl:'+id+':'+h8(p.name||i),
      src:{path:'projects/'+id+'/project.json',idx:'ppl['+i+']'},raw:p}));
    if(it){
      (it.gates||[]).forEach((g,i)=>put({kind:'gate',proj:id,date:(g.decision&&String(g.decision.at||'').slice(0,10))||'',
        title:g.title||('判断卡'+i),id:'gate:'+id+':'+h8(g.title||i),src:{path:'projects/'+id+'/iteration.json',idx:'gates['+i+']'},
        decided:!!(g.decision&&g.decision.option),raw:g}));
      (it.advice||[]).forEach((a,i)=>put({kind:'advice',proj:id,date:'',title:(typeof a==='string'?a:a.text||'').slice(0,60),
        id:'adv:'+id+':'+h8(typeof a==='string'?a:JSON.stringify(a)),src:{path:'projects/'+id+'/iteration.json',idx:'advice['+i+']'},raw:a}));
    }
  }
  // 跨项目：历史、方法库
  (F('history.json')||[]).forEach((h,i)=>put({kind:'hist',proj:h.proj||'other',date:h.date||'',title:(h.text||'').slice(0,80),
    id:rid('hist',h.proj||'other',h.date,h.text||i),src:{path:'history.json',idx:i},raw:h}));
  (((F('methods.json')||{}).methods)||[]).forEach((m,i)=>put({kind:'method',proj:m.proj||'通用',date:'',title:m.name||m.id,
    id:'m:'+m.id,src:{path:'methods.json',idx:i},cat:m.cat||'',refs:m.refs||[],raw:m}));

  // Today 指针是否滞后：拿指针日期和真实最新记录比
  const g=F('global.json')||{},w=F('widget.json')||{};
  const latest=IMP.order.map(i=>IMP.recs[i]).filter(r=>r.kind==='row'&&r.date).sort((a,b)=>b.date.localeCompare(a.date))[0];
  for(const [name,ptr] of [['global.current',g.current],['widget.project',w.project]]){
    if(!ptr)continue;
    const f=(IMP.projects.find(p=>p.id===ptr)||{}).current;
    const d=(f&&(f.rowDate||(f.focus&&f.focus.date)))||'';
    if(latest&&d&&d<latest.date)IMP.issues.lag.push({pointer:name,value:ptr,pointerDate:d,latestDate:latest.date,latestProj:latest.proj,latestQ:latest.title});
  }
  return IMP;
}
const recs=()=>IMP.order.map(i=>IMP.recs[i]);
const rowsOf=p=>(IMP.byProj[p]||[]).map(i=>IMP.recs[i]).filter(r=>r.kind==='row');
const openRows=p=>rowsOf(p).filter(r=>r.open);

/* ============================================================
   第二层：认知关系层（与原始数据分开保存，只写本地，不碰 RL-data）
   区分三件事：关系类型 rel / 认知事件 kind / 证据状态 ev
   ============================================================ */
const REL={explore:'探索',deeper:'下一层',hypothesis:'假设',evidence:'证据',challenge:'挑战',revise:'修正',resolve:'解决',tradeoff:'取舍',verify:'验证'};
const EVST={none:'未碰现实',claimed:'仅本人观察',partial:'部分证据',verified:'现实验证过',refuted:'被现实否掉'};
const CKEY='rlworld.cog.v2';
let COG={ver:2,topDesire:null,nodes:{},edges:{},events:[],inbox:[],seeded:false};

function saveCog(){try{localStorage.setItem(CKEY,JSON.stringify(COG))}catch(e){notice('本地保存失败：'+e.message)}}
function loadCog(){try{const s=localStorage.getItem(CKEY);if(s){const o=JSON.parse(s);if(o&&o.ver===2)COG=o}}catch(e){}}
function ev(kind,o){COG.events.push(Object.assign({id:'e'+(COG.events.length+1)+'-'+h8(kind+Date.now()+Math.random()),at:new Date().toISOString(),kind},o));}

// 边：why 必填（为什么它能推进/挑战旧问题）。没有理由就不建边。
function addEdge(from,to,rel,why,opt){
  if(!why||!why.trim())return null;
  const id='E:'+rel+':'+h8(from+'>'+to+':'+rel);
  if(COG.edges[id]){Object.assign(COG.edges[id],opt||{});return COG.edges[id]}
  COG.edges[id]=Object.assign({id,from,to,rel,why:why.trim(),confirm:'pending',ev:'none',at:new Date().toISOString(),src:'manual'},opt||{});
  return COG.edges[id];
}
function node(id,o){if(!COG.nodes[id])COG.nodes[id]=Object.assign({id,createdAt:new Date().toISOString()},o);else Object.assign(COG.nodes[id],o);return COG.nodes[id]}

/* ---------- 建初始认知地图：数据里确定的直接显示，不确定的标「待确认」 ---------- */
function seedCognition(){
  // 用户最上层核心欲望：数据里没有，不替用户编造，也不把某个项目目标升格成总目标
  if(!COG.topDesire)COG.topDesire={text:'',confirmed:false,note:'RL-data 里不存在「用户最上层核心欲望」这个字段。各项目 goal 不等于它，未经确认不合并。'};
  for(const p of IMP.projects){
    node('desire:'+p.id,{kind:'desire',proj:p.id,title:p.goal||('（'+p.name+' 未写 goal）'),src:'projects/'+p.id+'/project.json#goal',confirm:'from-data'});
    if(p.doing&&(p.doing.what||typeof p.doing==='string'))
      node('stage:'+p.id,{kind:'stage',proj:p.id,title:(typeof p.doing==='string'?p.doing:p.doing.what),src:'projects/'+p.id+'/project.json#doing',confirm:'from-data'});
    if(p.mainline&&p.mainline.main){
      node('line:'+p.id,{kind:'direction',proj:p.id,title:p.mainline.main,src:'projects/'+p.id+'/project.json#mainline.main',confirm:'from-data'});
      addEdge('desire:'+p.id,'line:'+p.id,'deeper','project.json 里 mainline.main 就挂在这个项目目标下，是数据自带的结构，不是推断。',{confirm:'from-data',src:'data'});
    }
    // mains / tracks 作为研究方向
    for(const r of (IMP.byProj[p.id]||[]).map(i=>IMP.recs[i])){
      if(r.kind==='main'||r.kind==='track'){
        node(r.id,{kind:'direction',proj:p.id,title:r.title,src:r.src.path+'#'+r.src.idx,confirm:'from-data'});
        addEdge('desire:'+p.id,r.id,'deeper','它写在同一个 project.json 的 '+r.src.idx+' 里，属于这个项目自己的研究方向划分。',{confirm:'from-data',src:'data'});
      }
      if(r.kind==='chain')node(r.id,{kind:'direction',proj:p.id,title:r.title,src:r.src.path,confirm:'from-data'});
    }
    // 问题节点：只有数据明确写了归属才连；写不出理由的一律进「待分类探索」
    for(const r of rowsOf(p.id)){
      node(r.id,{kind:'question',proj:p.id,title:r.title,date:r.date,state:r.state,open:r.open,src:r.src.path+'['+r.src.idx+']',confirm:'from-data'});
      if(r.main&&COG.nodes['main:'+p.id+':'+r.main]){
        addEdge('main:'+p.id+':'+r.main,r.id,'deeper','rows 这一行自带 main="'+r.main+'"，归属由数据直接给出。',{confirm:'from-data',src:'data'});
      }else{
        COG.nodes[r.id].orphan=true; // 没有父节点，暂不强连
      }
    }
    // 逻辑链：nodes/edges 是数据里已有的层级，按原边导入，并记下「为什么是下一层」
    for(const c of (IMP.byProj[p.id]||[]).map(i=>IMP.recs[i]).filter(x=>x.kind==='chain')){
      const ns={};for(const l of recs().filter(x=>x.kind==='layer'&&x.chain===c.id)){ns[l.nodeId]=l;node(l.id,{kind:'question',proj:p.id,title:l.title,q:l.q,src:l.src.path,chain:c.id,confirm:'from-data'})}
      for(const e of (c.raw.edges||[])){
        const a=c.id+':'+e[0],b=c.id+':'+e[1];
        if(!COG.nodes[a]||!COG.nodes[b])continue;
        addEdge(a,b,'deeper','这条边写在 '+c.title+' 的 edges 里：'+(ns[e[1]]&&ns[e[1]].q?'下一层要回答「'+String(ns[e[1]].q).split('\n')[0]+'」，不回答它，上一层只停在标题。':'数据自带层级。'),{confirm:'from-data',src:'data'});
      }
      addEdge('desire:'+p.id,c.id,'explore',c.when?('tracks 里写明适用范围：'+String(c.when).slice(0,90)):'数据把它挂在这个项目下。',{confirm:'from-data',src:'data'});
    }
    // 公司研究档案：证据链整条保留，结论状态用它自己的 verdict，不套别的项目
    for(const c of (IMP.byProj[p.id]||[]).map(i=>IMP.recs[i]).filter(x=>x.kind==='case')){
      node(c.id,{kind:'case',proj:p.id,title:c.title,verdict:c.verdict,src:c.src.path+'#'+c.src.idx,confirm:'from-data'});
    }
  }
  COG.seeded=true;
}
