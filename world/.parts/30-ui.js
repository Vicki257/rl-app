/* ============================================================
   界面：全体像 / 深入模式 / 接入卡 / 历史回放 / 原始数据
   ============================================================ */
let ASOF=null;                              // 历史回放：看某一天为止的认知状态
const DATES=()=>{const s=new Set();for(const r of recs())if(r.date)s.add(r.date);for(const e of Object.values(COG.edges))s.add(String(e.at).slice(0,10));return[...s].sort()};
const visible=r=>!ASOF||!r.date||r.date<=ASOF;
function openAt(r){
  if(!r.open)return ASOF&&r.closedAt?(String(r.closedAt).slice(0,10)>ASOF):false;
  return true;
}
const edgeVisible=e=>!ASOF||String(e.at).slice(0,10)<=ASOF;

function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const $=s=>document.querySelector(s);
let toastTimer;function notice(s){const el=$('#toast');el.textContent=s;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3000)}

/* ---------- 全体像 ---------- */
function renderOverview(){
  const td=COG.topDesire;
  $('#topDesire').innerHTML=td&&td.confirmed&&td.text?escapeHtml(td.text):'核心欲望<br>未确认';
  $('#topDesireNote').innerHTML=(td&&td.confirmed?'由你确认，AI 不会自动改。':escapeHtml(td?td.note:''))+' <button class="btn2 sec" style="padding:3px 8px;font-size:10.5px;margin-top:6px" onclick="openTopDesire()">'+(td&&td.confirmed?'修改':'由我来确认')+'</button>';
  // Today 指针滞后
  const lag=IMP.issues.lag;
  $('#lagWarn').innerHTML=lag.length?('<div class="warn"><b>Today 指针滞后</b><br>'+lag.map(l=>escapeHtml(l.pointer)+' = '+escapeHtml(l.value)+'（焦点日 '+l.pointerDate+'），但真实最新记录是 '+l.latestProj+' '+l.latestDate+'：'+escapeHtml(l.latestQ.slice(0,40))+'…').join('<br>')+'<br>所以旧焦点不等于最新进度，下面的「最值得推进」按真实记录算，不按指针。</div>'):'';
  $('#brief').innerHTML=briefHTML();
  $('#districtCount').textContent=districts.length+' 个研究区域（来自 projects/index.json）';
  const L=$('#districtList');L.innerHTML='';
  for(const d of districts){
    const r=document.createElement('button');r.className='district-row';r.dataset.district=d.id;
    r.innerHTML=`<span class="i" style="color:${d.color}">◈</span><span><span class="name">${escapeHtml(d.name)}</span><span class="status">${escapeHtml(d.stline)}</span></span>`;
    r.onclick=()=>{select(d.id);focusDistrict(d)};L.appendChild(r);
  }
  $('#srcFoot').textContent=RAW.source;
}
function dayOf(s){return String(s||'').slice(0,10)}
function briefHTML(){
  const all=recs().filter(r=>r.kind==='row'&&visible(r));
  const last=all.map(r=>r.date).filter(Boolean).sort().pop()||'';
  const H=[];
  H.push('<h4>我长期想实现什么</h4>');
  H.push(COG.topDesire&&COG.topDesire.confirmed?'<p>'+escapeHtml(COG.topDesire.text)+'</p>':'<p class="pend">还没有确认。各项目自己的 goal 已导入，但不同项目的研究方向未经你确认不会被归入一个总目标。</p>');
  H.push('<h4>当前阶段主要在完成什么</h4>');
  for(const p of IMP.projects){const w=p.doing&&(typeof p.doing==='string'?p.doing:p.doing.what);if(w)H.push('<p><span class="chip">'+escapeHtml(p.name)+'</span>'+escapeHtml(String(w).slice(0,110))+'…</p>')}
  H.push('<p class="src">来自各项目 project.json 的 doing，由你自己设定，AI 只能建议优先级，不会改写。</p>');

  H.push('<h4>最近一天（'+escapeHtml(last)+'）真正改变了什么</h4>');
  const added=all.filter(r=>r.date===last);
  const closedThen=all.filter(r=>dayOf(r.closedAt)===last);
  const accepted=COG.events.filter(e=>e.kind==='accepted'&&(!ASOF||dayOf(e.at)<=ASOF));
  if(added.length)H.push('<p>新增记录 '+added.length+' 条：'+added.map(r=>escapeHtml(r.title.slice(0,26))+'…').join('；')+'</p>');
  if(closedThen.length)H.push('<p>收尾 '+closedThen.length+' 条：'+closedThen.map(r=>escapeHtml(r.title.slice(0,24))+'…').join('；')+'</p>');
  H.push(accepted.length?'<p>你确认过的认知关系 '+accepted.length+' 条（见接入卡历史）。</p>':'<p class="pend">还没有你确认过的认知关系；导入时生成的候选都还是「待确认」，不计为进步。</p>');

  H.push('<h4>哪些方向获得了新证据</h4>');
  const evr=all.filter(r=>{const v=(r.cols||{})['碰现实了吗']||'';return /有/.test(v)});
  const byp={};for(const r of evr)byp[r.proj]=(byp[r.proj]||0)+1;
  H.push(Object.keys(byp).length?'<p>'+Object.entries(byp).map(([k,v])=>'<span class="chip g">'+escapeHtml(pname(k))+' '+v+' 条标注「碰现实了吗＝有」</span>').join(' ')+'</p><p class="src">这是各项目自己的字段，不是统一的 0–5 证据等级。</p>':'<p class="pend">没有标注碰过现实的记录。</p>');

  H.push('<h4>哪些问题还没有解决</h4>');
  H.push('<p>'+IMP.projects.map(p=>{const o=rowsOf(p.id).filter(r=>visible(r)&&openAt(r)).length;return '<span class="chip r">'+escapeHtml(p.name)+' '+o+'</span>'}).join(' ')+'</p>');
  H.push('<p class="src">完成判据按每个项目自己的 done 数组算：'+IMP.projects.map(p=>escapeHtml(p.name)+'→'+(p.done.join('/')||'未定义')).join('；')+'</p>');

  H.push('<h4>哪些问题已经收尾</h4>');
  H.push('<p>'+IMP.projects.map(p=>{const c=rowsOf(p.id).filter(r=>visible(r)&&!openAt(r)).length;return '<span class="chip">'+escapeHtml(p.name)+' '+c+'</span>'}).join(' ')+'</p>');
  const voided=all.filter(r=>/作废|误录/.test(r.title)||r.state==='不做');
  if(voided.length)H.push('<p class="src">其中 '+voided.length+' 条是「不做 / 作废」，已排除在待办之外，不会再被推荐。</p>');

  const s=suggest();
  H.push('<h4>现在最值得推进的一个</h4>');
  if(s){H.push('<p><b>'+escapeHtml(pname(s.r.proj))+'</b> · '+escapeHtml(s.r.date)+'<br>'+escapeHtml(s.r.title)+'</p>');
    H.push('<p class="src">理由：'+escapeHtml(s.why)+'</p>');
    H.push('<button class="btn2" style="margin-top:6px" onclick="openNode(\''+s.r.id+'\')">进入这个问题</button>');
    H.push('<p class="src" style="margin-top:8px">这只是优先级建议。你也可以完全不理它，今天去研究任何新兴趣——新认识照样能通过接入卡接回旧问题。</p>');
  }else H.push('<p class="pend">没有可推荐的未完成问题。</p>');
  return H.join('');
}
const pname=id=>(IMP.projects.find(p=>p.id===id)||{name:id}).name;
// 优先级建议：可解释、可反驳，不是 AI 评出的进步百分比
function suggest(){
  let best=null;
  for(const r of recs()){
    if(r.kind!=='row'||!visible(r)||!openAt(r))continue;
    if(/作废|误录/.test(r.title))continue;
    const P=IMP.projects.find(p=>p.id===r.proj)||{};
    const f=P.current&&P.current.focus;
    const why=[];let s=0;
    const pri=parseInt((r.cols||{})['优先程度']||'',10);
    if(!isNaN(pri)){s+=pri*3;why.push('本项目自己打的优先程度 '+pri)}
    if(f&&f.date===r.date&&f.q===r.title){s+=10;why.push('它正是 '+P.name+' current.json 里的焦点')}
    const inc=edgesIn(r.id).filter(e=>edgeVisible(e));
    const pend=inc.filter(e=>e.confirm==='pending');
    if(pend.length){s+=9*pend.length;why.push(pend.length+' 条新认识指向它但还没确认关系（'+pend.map(e=>REL[e.rel]).join('、')+'）')}
    const days=Math.round((Date.parse(ASOF||'2026-11-09')-Date.parse(r.date))/86400000);
    if(days<=14){s+=6;why.push('最近 '+days+' 天的记录')}
    if(/有/.test((r.cols||{})['碰现实了吗']||'')){s+=4;why.push('已经碰过现实，继续推进有反馈可依')}
    if(!best||s>best.s)best={r,s,why:why.join('；')||'只按未完成和时间排出来的'};
  }
  return best;
}

/* ---------- 深入模式 ---------- */
let active=null;
function select(id){
  const d=districts.find(x=>x.id===id);if(!d)return;active=d;
  const p=d.proj,s=d.st;
  $('#details').classList.add('show');$('#tip').classList.add('hidden');
  $('#detTitle').textContent=p.name;$('#detEn').textContent='PROJECT / '+p.id;
  $('#detDesc').textContent=d.stline;
  const open=rowsOf(p.id).filter(r=>visible(r)&&openAt(r)).sort((a,b)=>b.date.localeCompare(a.date));
  const closed=rowsOf(p.id).filter(r=>visible(r)&&!openAt(r)).sort((a,b)=>b.date.localeCompare(a.date));
  const dirs=Object.values(COG.nodes).filter(n=>n.proj===p.id&&n.kind==='direction');
  const H=[];
  H.push('<div class="eyebrow">这个项目自己的判据</div>');
  H.push(kv('长期目标 goal',p.goal));H.push(kv('奖励 reward',p.reward));
  H.push(kv('什么算碰现实',String(p.reality||'').slice(0,260)));
  H.push(kv('状态集 states',p.states.join(' / ')));H.push(kv('完成判据 done',p.done.join(' / ')||'未定义'));
  H.push(kv('证据口径',p.evScale));
  if(p.mainline&&p.mainline.main)H.push(kv('主线 mainline',p.mainline.main));
  H.push('<div class="sep"></div><div class="eyebrow">研究方向（'+dirs.length+' 条，来自 tracks / mains / mainline）</div>');
  for(const n of dirs)H.push('<button class="qrow" onclick="openNode(\''+n.id+'\')">'+escapeHtml(n.title)+'<span class="m">'+escapeHtml(n.src||'')+'</span></button>');
  H.push('<div class="sep"></div><div class="eyebrow">未完成的问题（'+open.length+'）</div>');
  for(const r of open)H.push(qrow(r));
  if(s.orphan)H.push('<div class="footwarn">其中 '+s.orphan+' 条还没有任何已确认的父节点，停在「待分类探索」。不强行挂到某个方向下。</div>');
  H.push('<div class="sep"></div><div class="eyebrow">已收尾（'+closed.length+'）</div>');
  for(const r of closed.slice(0,40))H.push(qrow(r));
  const extra=(IMP.byProj[p.id]||[]).map(i=>IMP.recs[i]).filter(r=>['case','chain','person','gate'].includes(r.kind));
  if(extra.length){H.push('<div class="sep"></div><div class="eyebrow">项目专用数据（原样保留，可打开看全文）</div>');
    for(const r of extra)H.push('<button class="qrow" onclick="openNode(\''+r.id+'\')"><span class="chip b">'+r.kind+'</span>'+escapeHtml(r.title)+'<span class="m">'+escapeHtml(r.src.path+' # '+r.src.idx)+'</span></button>')}
  H.push('<div class="footwarn">层级与深度来自数据里已确认的关系，不是固定七层。没有确认过的关系一律显示为待确认。</div>');
  $('#detBody').innerHTML=H.join('');
  document.querySelectorAll('.district-row').forEach(x=>x.classList.toggle('active',x.dataset.district===id));
}
const kv=(k,v)=>v?('<div class="kv"><b>'+escapeHtml(k)+'</b><span>'+escapeHtml(v)+'</span></div>'):'';
function qrow(r){
  const inc=edgesIn(r.id).filter(edgeVisible),pend=inc.filter(e=>e.confirm==='pending').length;
  return '<button class="qrow" onclick="openNode(\''+r.id+'\')">'+escapeHtml(r.title)+
    '<span class="m">'+escapeHtml(r.date)+' · '+escapeHtml(r.state||'')+(r.closedAt?' · 关闭于 '+dayOf(r.closedAt):'')+
    (inc.length?' · 入边 '+inc.length:'')+(pend?' · <span class="pend">'+pend+' 待确认</span>':'')+'</span></button>';
}
/* 节点详情：旧问题 → 当前认识 → 新发现 → 为什么深入 → 当前未知 → 下一步 */
function openNode(id){
  const r=IMP.recs[id]||null,n=COG.nodes[id]||null;
  if(!r&&!n)return notice('找不到这个节点');
  const title=(r&&r.title)||n.title;
  const parents=edgesIn(id).filter(edgeVisible),kids=edgesOut(id).filter(edgeVisible);
  const c=(r&&r.cols)||{};
  const H=[];
  H.push('<h3>'+escapeHtml(title)+'</h3>');
  H.push('<div class="sub">'+escapeHtml((r?pname(r.proj)+' · '+(r.date||'无日期')+' · '+(r.kind):'认知节点'))+' · 原始来源 '+escapeHtml(r?r.src.path+' ['+r.src.idx+']':(n.src||'—'))+'</div>');

  H.push('<div class="lvl"><div class="h">① 旧问题 / 它接在哪里</div>');
  if(parents.length)for(const e of parents){
    const f=IMP.recs[e.from]||COG.nodes[e.from]||{};
    H.push('<p class="t"><span class="chip '+(confirmed(e)?'g':'r')+'">'+REL[e.rel]+' · '+(confirmed(e)?'已确认':'待确认')+'</span>'+escapeHtml(f.title||e.from)+'</p>');
    H.push('<div class="cause">为什么是上一层：'+escapeHtml(e.why)+'</div>');
  }else H.push('<p class="t pend">没有已确认的父节点。这一条停在「待分类探索」，不强行归入任何方向。</p>');
  H.push('</div>');

  H.push('<div class="lvl"><div class="h">② 当前认识（原始字段原文）</div><p class="t">'+escapeHtml(oldViewOf(r||{kind:'x',title:title}))+'</p></div>');

  const newer=parents.filter(e=>['evidence','challenge','revise','verify'].includes(e.rel));
  H.push('<div class="lvl"><div class="h">③ 新发现 / 谁在挑战它</div>');
  if(newer.length)for(const e of newer){const f=IMP.recs[e.from]||{};
    H.push('<p class="t">'+escapeHtml(f.title||e.from)+' <span class="chip">'+escapeHtml(f.date||'')+'</span><span class="chip '+(e.ev==='verified'?'g':'r')+'">证据：'+EVST[e.ev]+'</span></p>');
    H.push('<div class="cause">'+escapeHtml(e.why)+'</div>')}
  else H.push('<p class="t pend">还没有新发现接到它上面。</p>');
  H.push('</div>');

  H.push('<div class="lvl"><div class="h">④ 为什么要再深入</div>');
  const dp=kids.filter(e=>e.rel==='deeper');
  H.push(dp.length?dp.map(e=>'<div class="cause">'+escapeHtml(e.why)+'</div>').join(''):'<p class="t pend">还没有写出「不回答子问题就答不了它」的理由，所以没有下一层。提出子问题本身不算已经更深。</p>');
  H.push('</div>');

  H.push('<div class="lvl"><div class="h">⑤ 当前未知</div><p class="t">'+escapeHtml(unknownOf(r,c))+'</p></div>');

  H.push('<div class="lvl"><div class="h">⑥ 下一步</div><p class="t">'+escapeHtml(nextOf(r,c))+'</p></div>');

  if(kids.length){H.push('<div class="card2"><div class="lb">它连向哪里（出边）</div>');
    for(const e of kids){const t=IMP.recs[e.to]||COG.nodes[e.to]||{};
      H.push('<button class="qrow" onclick="openNode(\''+e.to+'\')"><span class="chip '+(confirmed(e)?'g':'r')+'">'+REL[e.rel]+'</span>'+escapeHtml(t.title||e.to)+'<span class="m">'+escapeHtml(e.why.slice(0,90))+'</span></button>')}
    H.push('</div>')}
  if(parents.length){H.push('<div class="card2"><div class="lb">沿历史关系往上回</div>');
    for(const e of parents){const f=IMP.recs[e.from]||COG.nodes[e.from]||{};
      H.push('<button class="qrow" onclick="openNode(\''+e.from+'\')">↑ '+escapeHtml(f.title||e.from)+'</button>')}
    H.push('</div>')}
  H.push('<div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0"><button class="btn2 sec" onclick="showRaw(\''+id+'\')">查看完整原始数据</button><button class="btn2 sec" onclick="showNodeHistory(\''+id+'\')">它的认知变更历史</button></div>');
  openSheet(H.join(''));
}
function unknownOf(r,c){
  if(!r)return '—';
  const u=[];
  if(c['依据与验证状态'])u.push(c['依据与验证状态']);
  if(c['碰现实了吗']&&!/有/.test(c['碰现实了吗']))u.push('还没碰现实（本项目字段：'+c['碰现实了吗']+'）');
  if(r.open)u.push('本项目判据下状态仍是「'+(r.state||'?')+'」，不算完成。');
  if(r.kind==='layer'&&/研究中|正在研究/.test(r.title))u.push('这一层数据里自己标着仍在研究，不是已得结论。');
  return u.join('\n')||'原始记录里没有写未知部分。';
}
function nextOf(r,c){
  if(!r)return '—';
  if(c['下一步'])return c['下一步'];
  if(c['改后验证'])return '待验证：'+c['改后验证'];
  if(r.open)return '需要你决定：继续深入、补证据，还是先放着。系统不会自动把它标成已解决。';
  return '已按本项目判据收尾'+(r.closedAt?'（'+dayOf(r.closedAt)+'）':'')+'，不再作为待办。';
}
function openTopDesire(){
  const cur=(COG.topDesire&&COG.topDesire.text)||'';
  openSheet('<h3>确认你的核心欲望</h3><div class="sub">RL-data 里没有这个字段。AI 不会替你编，也不会把某个项目的 goal 升格成总目标。各项目目标如下，供你参考：</div>'+
   IMP.projects.map(p=>'<div class="card2"><div class="lb">'+escapeHtml(p.name)+'</div><div class="vv">'+escapeHtml(p.goal)+'</div></div>').join('')+
   '<div class="card2"><div class="lb">我长期想实现什么</div><textarea id="tdText">'+escapeHtml(cur)+'</textarea>'+
   '<div style="margin-top:10px;display:flex;gap:8px"><button class="btn2" onclick="saveTopDesire()">确认，这是我的</button><button class="btn2 sec" onclick="clearTopDesire()">先不确认</button></div></div>');
}
function saveTopDesire(){const t=$('#tdText').value.trim();if(!t)return notice('先写一句');
  COG.topDesire={text:t,confirmed:true,at:new Date().toISOString(),note:''};ev('accepted',{note:'用户确认核心欲望'});saveCog();rebuild();closeSheet();notice('已记录。AI 不会自动改它。')}
function clearTopDesire(){COG.topDesire={text:'',confirmed:false,note:'你选择暂不确认。'};saveCog();rebuild();closeSheet()}

/* ---------- 全屏面板 ---------- */
function openSheet(html){$('#sheetInner').innerHTML=html;$('#sheet').classList.add('show')}
function closeSheet(){$('#sheet').classList.remove('show')}
function showRaw(id){
  const r=IMP.recs[id];
  if(!r)return openSheet('<h3>原始数据</h3><div class="sub">这是认知层节点，没有对应的单条原始记录。</div>');
  openSheet('<h3>原始数据（无损）</h3><div class="sub">'+escapeHtml(r.src.path+' ['+r.src.idx+']')+' · 稳定 ID '+escapeHtml(r.id)+'</div>'+
   '<pre class="raw">'+escapeHtml(JSON.stringify(r.raw,null,2))+'</pre>'+
   '<div class="card2"><div class="lb">所属文件全文</div><button class="btn2 sec" onclick="showFile(\''+r.src.path+'\')">打开 '+escapeHtml(r.src.path)+'</button></div>');
}
function showFile(p){
  openSheet('<h3>'+escapeHtml(p)+'</h3><div class="sub">导入时原样保存，没有做摘要或压缩。</div><pre class="raw" style="max-height:72vh">'+escapeHtml(JSON.stringify(RAW.files[p],null,2))+'</pre>');
}
function showNodeHistory(id){
  const es=COG.events.filter(e=>{const ed=COG.edges[e.edge];return e.node===id||(ed&&(ed.from===id||ed.to===id))});
  const r=IMP.recs[id]||{};
  const H=['<h3>认知变更历史</h3><div class="sub">'+escapeHtml(r.title||id)+'</div>'];
  H.push('<div class="card2"><div class="lb">最初怎么提出</div><div class="vv">'+escapeHtml((r.date||'?')+'　'+(r.title||'')+'\n来源：'+(r.src?r.src.path:'—'))+'</div></div>');
  if(!es.length)H.push('<div class="card2"><div class="vv pend">还没有任何认知变更事件。导入本身不算变更。</div></div>');
  for(const e of es){const ed=COG.edges[e.edge]||{};
    H.push('<div class="card2"><div class="lb">'+escapeHtml(dayOf(e.at)+' · '+e.kind+(ed.rel?' · '+REL[ed.rel]:''))+'</div><div class="vv">'+escapeHtml((e.note||'')+(ed.why?'\n理由：'+ed.why:'')+(ed.ev?'\n证据状态：'+EVST[ed.ev]:''))+'</div></div>')}
  if(r.closedAt)H.push('<div class="card2"><div class="lb">收尾</div><div class="vv">'+escapeHtml(dayOf(r.closedAt)+' 按本项目 done 判据关闭（状态「'+(r.state||'')+'」）')+'</div></div>');
  openSheet(H.join(''));
}
