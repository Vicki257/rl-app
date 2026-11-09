/* ---------- 候选跨日 / 跨项目关联：全部来自真实记录，默认「待确认」 ----------
   找不到对应记录就进入待处理队列，不伪造连接。 */
function findRow(proj,date,sub){
  return rowsOf(proj).find(r=>r.date===date&&r.title.indexOf(sub)>=0)||rowsOf(proj).find(r=>r.title.indexOf(sub)>=0)||null;
}
function findLayer(sub){return recs().find(r=>r.kind==='layer'&&(r.title.indexOf(sub)>=0))||null}
const CAND=[
 {a:['journal','2026-11-07','管住每天的注意力'],b:['rl','2026-07-06','注意力总在切换'],rel:'challenge',ev:'claimed',
  why:'旧行 7/06 把「注意力靠管理时间管不住」这条收成「够用了」并关闭；11/07 的记录承认注意力确实改善（短视频减少、能持续迭代），但同时指出问题之间没有连接、每天开新方向。它挑战的不是旧结论，而是旧行的完成判据——注意力被管住并不等于主线在长。'},
 {a:['journal','2026-11-07','第二天醒来'],b:['rl','2026-10-27','不知道应该优先解决哪一个'],rel:'deeper',ev:'claimed',
  why:'10/27 那行卡在「面对多个项目和大量未解决问题，判断不出真正的瓶颈」。11/07 指出缺的是一层区分：长期欲望 / 当前阶段必须完成的 / 当天偶发兴趣。不先把这三者分开，就只能按优先分排序，答不了「为什么是这一个」。这是旧问题的下一层未知。'},
 {a:['journal','2026-11-07','语音可能是 RL-app 的核心入口'],b:['rl','2026-10-26','缺少即时吸引力'],rel:'challenge',ev:'claimed',
  why:'旧行（也是 rl 当前焦点）假设靠 SOP 拟人化、养成游戏让人愿意回来。11/07 的本人使用反馈给出另一个解释：没有语音入口时只在想查进度时才打开，真实思考发生在 ChatGPT 里——瓶颈可能在入口成本，不在游戏化。证据等级只能到「本人观察」，因为自有 App 内的语音体验、成本、持续使用都还没验证。'},
 {a:['journal','2026-11-07','需要专用 AI 硬件吗'],bLayer:'第5层 · 形成战略取舍',rel:'tradeoff',ev:'claimed',
  why:'AI 深度思考逻辑链 V2 第5层要求说清做什么、不做什么、为什么。11/07 这条正是在这一层做了一次取舍：先不做硬件，优先语音、长期状态、思考树。放在这一层，而不是新开一条树枝。'},
 {a:['journal','2026-11-07','管住每天的注意力'],b:['wealth','2026-10-27','持续捕获价值'],rel:'explore',ev:'none',
  why:'跨项目候选：财富机器那行问的是规模扩大后如何持续捕获价值，前提是产品真能让人长期用下去；11/07 恰好指出「长期留存靠的是主线连续生长，不是记录数量」。两者可能共用同一个未知，但现在只是方向上的相关，没有任何共同证据，所以保持「探索 / 待确认」，不并入统一总目标。'},
 {aLayer:'第4层 · 长期执行（正在研究）',bMethod:'m-004',rel:'evidence',ev:'partial',
  why:'教育逻辑链 V4 第4层提出的候选机制②「未完成效应」与方法库 m-004「悬而未决问题机制」是同一机制，而 m-004 带 7/6 的真实来源记录。所以第4层这半边不是空想，已有一条自己的历史依据；①「内部反馈」那半边仍然没有。'},
 {aLayer:'第4层 · 长期执行（正在研究）',b:['rl','2026-10-26','仍觉得没有真正学会'],rel:'deeper',ev:'claimed',
  why:'第4层①「内部反馈：没有外部成果也能识别自己的真实进步」要落地，必须先回答 10/26 那行的现象：AI 替人做完研究后用户为什么仍觉得没学会。不解释这个落差，内部反馈就只能是一句口号。'},
];
function seedCandidates(){
  for(const c of CAND){
    const A=c.aLayer?findLayer(c.aLayer):findRow(c.a[0],c.a[1],c.a[2]);
    const B=c.bLayer?findLayer(c.bLayer):c.bMethod?IMP.recs['m:'+c.bMethod]:findRow(c.b[0],c.b[1],c.b[2]);
    if(!A||!B){IMP.issues.unmatched.push({why:'候选关联找不到对应真实记录，不建边',want:JSON.stringify(c.a||c.aLayer)+' → '+JSON.stringify(c.b||c.bLayer||c.bMethod)});continue}
    if(!COG.nodes[A.id])node(A.id,{kind:'question',proj:A.proj,title:A.title,date:A.date,src:A.src&&A.src.path,confirm:'from-data'});
    if(!COG.nodes[B.id])node(B.id,{kind:B.kind==='method'?'method':'question',proj:B.proj,title:B.title,date:B.date,src:B.src&&B.src.path,confirm:'from-data'});
    const e=addEdge(A.id,B.id,c.rel,c.why,{ev:c.ev,src:'candidate'});
    if(e&&e.confirm==='pending'&&!COG.events.some(x=>x.edge===e.id))ev('proposed',{edge:e.id,note:'导入时生成的候选关联，等用户确认'});
  }
}

/* ============================================================
   召回与接入卡（离线启发式，不是真实 AI）
   ============================================================ */
const STOP=/[的了是在和与及对把为把被就都也很还又更要会能可不没有一个这那什么怎么如何以及从到向]/g;
function toks(s){s=String(s||'').toLowerCase().replace(/\s+/g,'');const out=new Set();
  const clean=s.replace(STOP,'');
  for(let i=0;i<clean.length-1;i++){const b=clean.slice(i,i+2);if(/[一-龥]{2}/.test(b))out.add(b)}
  for(const w of s.match(/[a-z0-9][a-z0-9\-\.]{1,}/g)||[])out.add(w);
  return out}
function overlap(a,b){let n=0;for(const t of a)if(b.has(t))n++;return n}

// 词权重：全语料里越常见的词越不值钱（IDF），避免「真正/打开/问题」这类词把无关记录顶上来
let DF=null,NDOC=0;
function buildDF(){
  DF=Object.create(null);NDOC=0;
  for(const r of recs()){
    if(!['row','layer','case','method','hist','main','chain'].includes(r.kind))continue;
    NDOC++;const seen=hayOf(r);
    for(const t of seen)DF[t]=(DF[t]||0)+1;
  }
}
function hayOf(r){
  if(r._hay)return r._hay;
  const title=r.title+' '+(r.q||'');
  const body=JSON.stringify(r.cols||'')+' '+(r.kind==='method'?JSON.stringify(r.raw):'')+' '+(r.kind==='case'?(r.raw.why||'')+(r.raw.sum||''):'');
  const H=toks(title),B=toks(body);
  r._hayTitle=H;r._hay=new Set([...H,...B]);return r._hay;
}
function idf(t){return Math.log((NDOC+1)/((DF&&DF[t]||0)+1))}
// 打分：标题命中 > 正文命中，罕见词权重高。只做召回，不下结论。
function recall(text,limit){
  if(!DF)buildDF();
  const T=toks(text),today='2026-11-09';
  const cands=[];
  for(const r of recs()){
    if(!['row','layer','case','method','hist','main','chain'].includes(r.kind))continue;
    const hay=hayOf(r),ht=r._hayTitle;
    let w=0,hit=0,words=[],mx=0;
    for(const t of T){
      if(!hay.has(t))continue;
      hit++;words.push(t);
      const rare=idf(t);                       // 常见词接近 0，罕见词 4~6
      if(rare>mx)mx=rare;
      w+=rare*(ht.has(t)?2.2:1)*(/^[a-z0-9]/.test(t)?1.8:1);   // 标题命中、英文/代号命中更重
    }
    // 只靠「真正 / 打开 / 产品」这类常见词凑出来的命中，一律丢掉：宁可召不回，也不给错关联
    if(w<2.5||!(mx>=3.8||hit>=5))continue;
    let s=w*4;
    if(r.kind==='row'&&r.open)s+=12; if(r.kind==='row'&&!r.open)s-=8;
    if(r.kind==='layer')s+=6;
    const P=IMP.projects.find(p=>p.id===r.proj);
    const f=P&&P.current&&P.current.focus;
    if(f&&r.date===f.date&&r.title===f.q)s+=10;
    if(r.date)s+=Math.max(0,6-Math.round((Date.parse(today)-Date.parse(r.date))/(86400000*30)));
    s=Math.round(s);
    cands.push({r,score:s,hit,words,conf:s>=120?'高':s>=60?'中':'低'});
  }
  return cands.sort((a,b)=>b.score-a.score).slice(0,limit||6);
}
function guessRel(text){
  const t=String(text);
  if(/没想到|反而|居然|竟然|矛盾|其实不是|不对|怀疑/.test(t))return 'challenge';
  if(/数据|实测|真实反馈|用户说|跑了|结果是|证明/.test(t))return 'evidence';
  if(/假设|也许|可能|猜/.test(t))return 'hypothesis';
  if(/不做|先做|取舍|优先|放弃/.test(t))return 'tradeoff';
  if(/为什么|怎么|如何/.test(t))return 'deeper';
  return 'explore';
}
function guessEv(text){
  if(/现实|上线|真实用户|实测|跑完|真人反馈/.test(text))return 'partial';
  if(/我自己|本人|我发现|我用/.test(text))return 'claimed';
  return 'none';
}
// 接入卡：九个字段，缺一不可；关系理由必须写得出来才允许确认
function makeCard(text){
  const hits=recall(text,5);
  const rel=guessRel(text),evs=guessEv(text);
  return {id:'C'+h8(text+Date.now()),at:new Date().toISOString(),
    source:{kind:'粘贴的对话/记录',text},
    hits:hits.map(h=>({id:h.r.id,title:h.r.title,proj:h.r.proj,date:h.r.date,kind:h.r.kind,open:!!h.r.open,
      oldView:oldViewOf(h.r),score:h.score,conf:h.conf,words:h.words.slice(0,6)})),
    weak:!hits.length||hits[0].score<120,
    pick:hits.length&&hits[0].score>=120?hits[0].r.id:null, rel, ev:evs,
    why:'', newView:'', confirm:'draft',
    note:!hits.length?'没有召回到相关旧节点：这条会进入「待分类探索」，不强行挂到任何方向下。':
      (hits[0].score<120?'召回到的旧节点相关度都不高（最高 '+hits[0].score+' 分，只靠少数词面重叠）。这多半说明 RL-data 里还没有这个话题的旧问题。建议存为「待分类探索」，不要硬挂。':'')};
}
// 旧节点原来的判断或未知
function oldViewOf(r){
  if(r.kind==='row'){
    const c=r.cols||{};
    const parts=[];
    if(c['结论'])parts.push('结论：'+c['结论']);
    if(c['为什么要改动'])parts.push('为什么要改动：'+String(c['为什么要改动']).slice(0,120));
    if(c['改后验证'])parts.push('改后验证：'+String(c['改后验证']).slice(0,120));
    if(c['假设'])parts.push('假设：'+c['假设']);
    if(c['依据与验证状态'])parts.push('依据：'+c['依据与验证状态']);
    const P=IMP.projects.find(p=>p.id===r.proj)||{};
    parts.push('状态：'+(r.state||'?')+(r.open?'（本项目判据下仍未完成）':'（本项目 done 判据里算完成'+(r.closedAt?'，关闭于 '+r.closedAt.slice(0,10):'')+'）'));
    if(c['碰现实了吗'])parts.push('碰现实了吗：'+c['碰现实了吗']);
    return parts.join('\n')||'（这一行除问题文本外没有填内容）';
  }
  if(r.kind==='layer')return (r.q||'（这一层没写内容）');
  if(r.kind==='method')return r.raw.what||'';
  if(r.kind==='case')return '判断：'+(r.verdict||'?')+'\n'+(r.raw.sum||'');
  return r.title;
}
