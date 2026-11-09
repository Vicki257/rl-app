/* ---------- 接入卡：对话 → 召回旧问题 → 关联提案 → 用户确认 → 更新 ---------- */
let CARD=null;
function openCards(text){
  CARD=text?makeCard(text):null;
  renderCards();
}
function renderCards(){
  const pending=Object.values(COG.edges).filter(e=>e.confirm==='pending');
  const H=['<h3>接入卡</h3><div class="sub">把一段对话或一条新认识接到过去某个具体问题上。关系理由写不出来就不能确认——这是防止「强行连接」的唯一闸门。召回与关系判断是<b>离线启发式</b>（词面重叠＋未解决＋焦点＋时间），不是真实 AI 调用。</div>'];
  H.push('<div class="card2"><div class="lb">① 原始对话 / 记录</div><textarea id="cardSrc" placeholder="粘贴 ChatGPT 对话片段，或写下今天的新认识">'+escapeHtml(CARD?CARD.source.text:'')+'</textarea>'+
    '<div style="margin-top:8px"><button class="btn2" onclick="genCard()">检索相关旧节点</button></div></div>');
  if(CARD){
    H.push('<div class="card2"><div class="lb">② 建议关联的旧节点（离线召回，按得分排序）</div>');
    if(CARD.note)H.push('<div class="vv pend" style="margin-bottom:8px">'+escapeHtml(CARD.note)+'</div>');
    for(const h of CARD.hits){
      H.push('<label style="display:block;margin:7px 0;cursor:pointer"><input type="radio" name="pick" value="'+h.id+'" '+(CARD.pick===h.id?'checked':'')+' onchange="CARD.pick=this.value;renderCards()"> <b>'+escapeHtml(pname(h.proj))+'</b> · '+escapeHtml(h.date||'')+' · '+escapeHtml(h.kind)+(h.open?' · <span class="pend">未完成</span>':' · 已收尾')+' <span class="chip '+(h.conf==='高'?'g':h.conf==='中'?'r':'')+'">相关度 '+h.conf+' '+h.score+'</span> <span class="chip">命中词：'+escapeHtml(h.words.join(' '))+'</span><br><span style="font-size:12px">'+escapeHtml(h.title)+'</span></label>');
    }
    H.push('</div>');
    const pickRec=CARD.pick?IMP.recs[CARD.pick]:null;
    H.push('<div class="card2"><div class="lb">③ 旧节点原来的判断 / 未知</div><div class="vv">'+escapeHtml(pickRec?oldViewOf(pickRec):'未选择')+'</div></div>');
    H.push('<div class="card2"><div class="lb">④ 今天的新信息</div><div class="vv">'+escapeHtml(CARD.source.text)+'</div></div>');
    H.push('<div class="card2"><div class="lb">⑤ 关系类型</div><select id="cardRel">'+Object.entries(REL).map(([k,v])=>'<option value="'+k+'" '+(CARD.rel===k?'selected':'')+'>'+v+'（'+k+'）</option>').join('')+'</select>'+
      '<div class="vv" style="margin-top:6px;color:var(--dim);font-size:11px">「下一层」必须说明：不回答它就答不了父问题。「挑战 / 修正」只在有依据时才改旧判断。</div></div>');
    H.push('<div class="card2"><div class="lb">⑥ 它为什么能推进或挑战旧问题（必填）</div><textarea id="cardWhy" placeholder="旧判断卡在哪里；今天这条填补了哪个未知；为什么这有助于上层目标">'+escapeHtml(CARD.why)+'</textarea></div>');
    H.push('<div class="card2"><div class="lb">⑦ 证据状态</div><select id="cardEv">'+Object.entries(EVST).map(([k,v])=>'<option value="'+k+'" '+(CARD.ev===k?'selected':'')+'>'+v+'</option>').join('')+'</select>'+
      '<div class="vv" style="margin-top:6px;color:var(--dim);font-size:11px">未查证前只能是「仅本人观察」或「假设」。不能直接宣布旧认识被推翻。</div></div>');
    H.push('<div class="card2"><div class="lb">⑧ 建议更新后的认识</div><textarea id="cardNew" placeholder="确认后写入认知层（不会写回 RL-data）">'+escapeHtml(CARD.newView)+'</textarea></div>');
    H.push('<div class="card2"><div class="lb">⑨ 你的确认</div><div style="display:flex;gap:8px;flex-wrap:wrap">'+
      '<button class="btn2" onclick="acceptCard()">✓ 确认纳入 · 世界更新</button>'+
      '<button class="btn2 sec" onclick="parkCard()">暂存为待分类探索</button>'+
      '<button class="btn2 sec" onclick="CARD=null;renderCards()">丢弃</button></div>'+
      '<div class="vv" style="margin-top:8px;color:var(--dim);font-size:11px">没有你的确认，系统不会修改任何认知数据；任何情况下都不会写回 GitHub。</div></div>');
  }
  if(pending.length){
    H.push('<div class="sep"></div><h3 style="font-size:14px">待确认的候选关联（'+pending.length+'）</h3><div class="sub">导入时按真实记录生成，默认全部待确认，不计为认知进步。</div>');
    for(const e of pending){
      const a=IMP.recs[e.from]||COG.nodes[e.from]||{},b=IMP.recs[e.to]||COG.nodes[e.to]||{};
      H.push('<div class="card2"><div class="lb">'+REL[e.rel]+' · 证据：'+EVST[e.ev]+'</div>'+
        '<div class="vv"><b>新 / 子：</b>'+escapeHtml(a.title||e.from)+'　'+escapeHtml(a.date||'')+'<br><b>旧 / 父：</b>'+escapeHtml(b.title||e.to)+'　'+escapeHtml(b.date||'')+'</div>'+
        '<div class="vv" style="margin-top:6px;color:#e2bf8c">理由：'+escapeHtml(e.why)+'</div>'+
        '<div style="margin-top:9px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn2" onclick="acceptEdge(\''+e.id+'\')">✓ 确认</button><button class="btn2 sec" onclick="rejectEdge(\''+e.id+'\')">✗ 这个关联不对</button><button class="btn2 sec" onclick="openNode(\''+e.to+'\')">看旧问题</button></div></div>');
    }
  }
  const rej=Object.values(COG.edges).filter(e=>e.confirm==='rejected');
  if(rej.length)H.push('<div class="sep"></div><div class="sub">你驳回过 '+rej.length+' 条关联（记在变更历史里，不会再自动出现）。</div>');
  openSheet(H.join(''));
}
function genCard(){const t=$('#cardSrc').value.trim();if(!t)return notice('先粘一段内容');CARD=makeCard(t);renderCards();notice('召回到 '+CARD.hits.length+' 个相关旧节点')}
function readCard(){if(!CARD)return;CARD.rel=$('#cardRel').value;CARD.ev=$('#cardEv').value;CARD.why=$('#cardWhy').value;CARD.newView=$('#cardNew').value;CARD.source.text=$('#cardSrc').value}
function acceptCard(){
  readCard();
  if(!CARD.why.trim())return notice('必须写出它为什么能推进或挑战旧问题，否则不允许连接');
  const nid='new:'+h8(CARD.source.text)+':'+dayOf(new Date().toISOString());
  node(nid,{kind:'question',proj:CARD.pick?(IMP.recs[CARD.pick]||{}).proj:'未分类',title:CARD.source.text.slice(0,90),
    date:dayOf(new Date().toISOString()),body:CARD.source.text,newView:CARD.newView,src:'接入卡（本地认知层）',confirm:'accepted'});
  if(CARD.pick){
    const e=addEdge(nid,CARD.pick,CARD.rel,CARD.why,{ev:CARD.ev,src:'card'});
    if(e){e.confirm='accepted';ev('accepted',{edge:e.id,node:nid,note:'用户确认接入：'+REL[CARD.rel]})}
    const d=districts.find(x=>x.id===(IMP.recs[CARD.pick]||{}).proj);
    grow(d);
  }else{COG.inbox.push({id:nid,at:new Date().toISOString(),text:CARD.source.text,why:'没有选父节点，保存为待分类探索'});ev('proposed',{node:nid,note:'进入待分类探索'})}
  saveCog();rebuild();CARD=null;closeSheet();notice('已纳入认知层。只写在这台设备的本地存储，没有改 RL-data。');
}
function parkCard(){readCard();const nid='new:'+h8(CARD.source.text);
  COG.inbox.push({id:nid,at:new Date().toISOString(),text:CARD.source.text,why:'用户选择暂存，关联不确定'});
  node(nid,{kind:'question',proj:'未分类',title:CARD.source.text.slice(0,90),date:dayOf(new Date().toISOString()),src:'接入卡',confirm:'pending'});
  ev('proposed',{node:nid,note:'暂存为待分类探索'});saveCog();rebuild();CARD=null;renderCards();notice('已暂存，不强行连接')}
function acceptEdge(id){const e=COG.edges[id];if(!e)return;e.confirm='accepted';ev('accepted',{edge:id,note:'用户确认候选关联'});
  const t=IMP.recs[e.to]||{};const d=districts.find(x=>x.id===t.proj);saveCog();rebuild();grow(d);renderCards();notice('关系已确认，世界结构更新')}
function rejectEdge(id){const e=COG.edges[id];if(!e)return;e.confirm='rejected';ev('rejected',{edge:id,note:'用户判断这个关联不对'});saveCog();rebuild();renderCards();notice('已驳回，记在变更历史里')}

/* ---------- 导入报告 ---------- */
function showReport(){
  const byKind={};for(const r of recs())byKind[r.kind]=(byKind[r.kind]||0)+1;
  const H=['<h3>导入报告与映射表</h3><div class="sub">数据源：'+escapeHtml(RAW.source)+'　文件数 '+Object.keys(RAW.files).length+'　记录数 '+recs().length+'</div>'];
  H.push('<table class="map"><tr><th>来源文件 / 字段</th><th>导入成什么</th><th>稳定 ID 方案</th><th>条数</th></tr>');
  const rowsN=recs().filter(r=>r.kind==='row').length;
  const T=[
   ['projects/index.json','项目清单（项目从这里发现，不写死）','meta.id','='+IMP.projects.length],
   ['projects/*/project.json # goal/reward/reality/states/done','项目自己的目标与完成判据、证据口径','desire:{proj} / 项目属性','='+IMP.projects.length],
   ['projects/*/project.json # doing','当前阶段（用户设定，AI 不改写）','stage:{proj}',''],
   ['projects/*/project.json # mainline.main','研究方向（主线）','line:{proj}',''],
   ['projects/*/project.json # sop.nodes/edges','SOP 流程节点（流程 ≠ 认知问题，单独 kind）','sop:{proj}:{node.id}','='+(byKind.sopnode||0)],
   ['projects/*/project.json # tracks[].sops[]','候选逻辑链（含 AI 深度思考 V2、教育 V4）；自带 nodes/edges 按原边导入','chain:{proj}:{h8(name)} / 层 chain:…:{node.id}','='+(byKind.chain||0)+' 链 / '+(byKind.layer||0)+' 层'],
   ['projects/*/project.json # mains[]','投资的多条主线 → 研究方向','main:{proj}:{id}','='+(byKind.main||0)],
   ['projects/*/project.json # sop.cos[]','公司研究档案，steps/meta/revs 全文保留','case:{proj}:{co.id}','='+(byKind.case||0)],
   ['projects/*/project.json # ppl[]/gaps[]','人与关系专用结构','ppl:{proj}:{h8(name)}','='+(byKind.person||0)],
   ['projects/*/rows.json[]','具体问题节点（每项目字段不同，按实际键读）','row:{proj}:{date}:{h8(q)}','='+rowsN],
   ['projects/*/current.json # focus','项目焦点指针（用于校验是否滞后）','—',''],
   ['projects/*/iteration.json # gates/advice/reality','判断卡与夜间建议','gate:/adv:{proj}:{h8}','='+((byKind.gate||0)+(byKind.advice||0))],
   ['history.json[]','历史依据（≠ 已验证的认识）','hist:{proj}:{date}:{h8(text)}','='+(byKind.hist||0)],
   ['methods.json # methods[]','方法库（已有稳定 id，直接沿用）','m:{m-xxx}','='+(byKind.method||0)],
   ['global.json / widget.json / status.json / bottleneck.json','系统指针与瓶颈快照（只用于校验，不当作认知结论）','—',''],
  ];
  for(const t of T)H.push('<tr><td>'+escapeHtml(t[0])+'</td><td>'+escapeHtml(t[1])+'</td><td><code>'+escapeHtml(t[2])+'</code></td><td>'+escapeHtml(t[3])+'</td></tr>');
  H.push('</table>');
  H.push('<div class="card2"><div class="lb">为什么不用日期、也不用数组下标做 ID</div><div class="vv">同一天可能有多条记录（journal 11/07 就有 6 条），所以日期不唯一；插入、重排、迁移都会改变下标，所以下标只作溯源字段 src.idx。稳定 ID = 来源种类 + 项目 + 日期 + 内容指纹（FNV-1a 8 位十六进制）。重复导入指纹相同则命中同一节点，不会重复建；指纹相同但内容不同的，另立一条并记进重复清单，绝不静默合并。</div></div>');
  const iss=IMP.issues;
  H.push('<div class="card2"><div class="lb">重复 / 冲突（'+iss.dup.length+'）</div><div class="vv">'+(iss.dup.length?escapeHtml(iss.dup.map(d=>d.id+(d.same?'（内容一致，已去重）':'（内容不同，已另立一条）')).join('\n')):'无')+'</div></div>');
  H.push('<div class="card2"><div class="lb">缺失文件（'+iss.missing.length+'）</div><div class="vv">'+(iss.missing.length?escapeHtml(iss.missing.join('\n')):'无')+'</div></div>');
  H.push('<div class="card2"><div class="lb">待处理队列（'+iss.unmatched.length+'）</div><div class="vv">'+(iss.unmatched.length?escapeHtml(iss.unmatched.map(u=>u.why+(u.want?'：'+u.want:'')).join('\n')):'无')+'</div></div>');
  H.push('<div class="card2"><div class="lb">指针滞后（'+iss.lag.length+'）</div><div class="vv">'+(iss.lag.length?escapeHtml(iss.lag.map(l=>l.pointer+'='+l.value+'（'+l.pointerDate+'）← 最新真实记录 '+l.latestProj+' '+l.latestDate).join('\n')):'无')+'</div></div>');
  H.push('<div class="card2"><div class="lb">各项目完成判据（不共用）</div><div class="vv">'+escapeHtml(IMP.projects.map(p=>p.name+'：states='+p.states.join('/')+'　done='+(p.done.join('/')||'未定义')+'　'+p.evScale).join('\n'))+'</div></div>');
  H.push('<div class="card2"><div class="lb">原始文件（点开看全文）</div>'+Object.keys(RAW.files).sort().map(k=>'<button class="qrow" onclick="showFile(\''+k+'\')">'+escapeHtml(k)+'</button>').join('')+'</div>');
  openSheet(H.join(''));
}
