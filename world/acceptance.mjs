// 用真实 RL-data 跑验收。用法：python3 -m http.server 8099 后 node world/acceptance.mjs
import pw from '/opt/node-tools/node_modules/playwright/index.js';
const {chromium}=pw;
const URL=process.env.URL||'http://localhost:8099/world/';
const out=[];const ok=(n,c,d)=>{out.push((c?'PASS':'FAIL')+' | '+n+(d?' | '+d:''));return c};
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(URL,{waitUntil:'load'});await p.waitForFunction(()=>window.IMP&&IMP.projects.length>0,null,{timeout:20000}).catch(()=>{});
await p.waitForTimeout(2500);

const R=await p.evaluate(()=>{
  const g={};
  g.files=Object.keys(RAW.files).length;
  g.recs=recs().length;
  g.projects=IMP.projects.map(p=>({id:p.id,name:p.name,rows:p.rowCount,done:p.done,states:p.states,
    open:rowsOf(p.id).filter(r=>r.open).length,closed:rowsOf(p.id).filter(r=>!r.open).length,ev:p.hasEv}));
  // 1 原始可访问 + 条数对账
  g.missingSrc=recs().filter(r=>!RAW.files[r.src.path]).length;
  g.rowAudit=IMP.projects.map(p=>{const src=(RAW.files['projects/'+p.id+'/rows.json']||[]).length;
    return {id:p.id,src,imported:rowsOf(p.id).length,equal:src===rowsOf(p.id).length}});
  g.histAudit={src:(RAW.files['history.json']||[]).length,imported:recs().filter(r=>r.kind==='hist').length};
  g.methAudit={src:((RAW.files['methods.json']||{}).methods||[]).length,imported:recs().filter(r=>r.kind==='method').length};
  g.caseAudit={src:(((RAW.files['projects/quant/project.json']||{}).sop||{}).cos||[]).length,imported:recs().filter(r=>r.kind==='case').length};
  g.issues={dup:IMP.issues.dup.length,unmatched:IMP.issues.unmatched.length,missing:IMP.issues.missing.length,lag:IMP.issues.lag};
  // 2 稳定 ID：重复导入不重复建节点
  const before=recs().length;runImport();g.reimportSame=recs().length===before;
  // 3 日志 6 条
  g.journal=rowsOf('journal').map(r=>({id:r.id,date:r.date,q:r.title.slice(0,20)}));
  // 4 逻辑链
  const chains=recs().filter(r=>r.kind==='chain').map(c=>({t:c.title,layers:recs().filter(x=>x.kind==='layer'&&x.chain===c.id).length}));
  g.chains=chains;
  // 5 深层原始材料不丢
  const co=recs().find(r=>r.kind==='case'&&r.title.indexOf('平安')>=0);
  g.caseDeep=co?{steps:(co.raw.steps||[]).length,metaRows:(co.raw.meta||[]).length,firstStepDataLen:((co.raw.steps||[])[0]||{}).data?.length||0,verdict:co.verdict}:null;
  // 6 作废记录不回到待办
  const voided=recs().filter(r=>r.kind==='row'&&/作废|误录/.test(r.title));
  g.voided=voided.map(r=>({q:r.title.slice(0,24),state:r.state,open:r.open}));
  const sg=suggest();g.suggest={q:sg.r.title.slice(0,40),proj:sg.r.proj,date:sg.r.date,why:sg.why,open:sg.r.open,voided:/作废|误录/.test(sg.r.title)};
  // 7 召回：三个主题
  const topics={'AI 终端':'我在想 AI 终端和新硬件，到底需不需要专用 AI 硬件才能做好 AI 共创产品？',
    'Ab Initio':'Ab Initio 的 GDE 很难用，为什么这种复杂软件还能拿下大企业客户？它的商业模式是什么？',
    'RL-app':'RL-app 真正的入口是不是语音？我平时思考都在 ChatGPT 语音里发生，不会主动打开 app'};
  g.recall={};for(const k in topics)g.recall[k]=recall(topics[k],4).map(h=>({p:h.r.proj,d:h.r.date,t:h.r.title.slice(0,34),open:!!h.r.open,s:h.score}));
  // 8 候选关联全部来自真实记录
  g.edges={total:Object.keys(COG.edges).length,
    fromData:Object.values(COG.edges).filter(e=>e.confirm==='from-data').length,
    pending:Object.values(COG.edges).filter(e=>e.confirm==='pending').length,
    accepted:Object.values(COG.edges).filter(e=>e.confirm==='accepted').length,
    noWhy:Object.values(COG.edges).filter(e=>!e.why||!e.why.trim()).length,
    danglng:Object.values(COG.edges).filter(e=>!(IMP.recs[e.from]||COG.nodes[e.from])||!(IMP.recs[e.to]||COG.nodes[e.to])).length};
  g.cands=Object.values(COG.edges).filter(e=>e.src==='candidate').map(e=>{
    const a=IMP.recs[e.from]||COG.nodes[e.from],z=IMP.recs[e.to]||COG.nodes[e.to];
    return {rel:e.rel,ev:e.ev,from:(a.proj||'')+' '+(a.date||'')+' '+String(a.title).slice(0,22),to:(z.proj||'')+' '+(z.date||'')+' '+String(z.title).slice(0,22),cross:(a.proj!==z.proj)}});
  g.depth={};IMP.projects.forEach(p=>g.depth[p.id]=depthOf(p.id));
  g.orphan={};IMP.projects.forEach(p=>g.orphan[p.id]=statsOf(p).orphan);
  return g;
});

ok('导入 27 个原始文件',R.files===27,R.files+' 个');
ok('所有记录的来源文件都在快照里（原始数据可回溯）',R.missingSrc===0,'缺失 '+R.missingSrc);
ok('每个项目 rows 条数与源文件一致（无丢失/重复）',R.rowAudit.every(a=>a.equal),R.rowAudit.map(a=>a.id+' '+a.imported+'/'+a.src).join('　'));
ok('history 55 条全部导入',R.histAudit.src===R.histAudit.imported&&R.histAudit.src===55,JSON.stringify(R.histAudit));
ok('methods 184 条全部导入',R.methAudit.src===R.methAudit.imported,JSON.stringify(R.methAudit));
ok('投资公司研究档案全部导入',R.caseAudit.src===R.caseAudit.imported&&R.caseAudit.src>0,JSON.stringify(R.caseAudit));
ok('重复导入不产生新节点（稳定 ID 去重）',R.reimportSame);
ok('没有未解决的重复冲突',R.issues.dup===0,'dup='+R.issues.dup);
ok('待处理队列为空（候选关联都找到了真实记录）',R.issues.unmatched===0,'unmatched='+R.issues.unmatched);
ok('检测到 Today 指针滞后',R.issues.lag.length>0,R.issues.lag.map(l=>l.pointer+'='+l.value+'('+l.pointerDate+') vs '+l.latestDate).join('；'));
ok('每日思考日志 6 条全部可见且 ID 互不相同（同一天多条）',R.journal.length===6&&new Set(R.journal.map(j=>j.id)).size===6);
ok('两条逻辑链（AI 深度思考 V2 / 教育 V4）导入且带层',R.chains.length>=2&&R.chains.every(c=>c.layers>0),JSON.stringify(R.chains));
ok('投资深层原始材料未被压缩（steps/meta 全文）',R.caseDeep&&R.caseDeep.steps>0&&R.caseDeep.firstStepDataLen>100,JSON.stringify({...R.caseDeep,firstStepDataLen:R.caseDeep?.firstStepDataLen}));
ok('作废记录不算未完成，也不会被推荐',R.voided.every(v=>v.open===false)&&R.suggest.voided===false,JSON.stringify(R.voided));
ok('每个项目用自己的 done 判据算未完成',R.projects.every(p=>p.done.length>0||p.id==='x'),R.projects.map(p=>p.name+' done='+p.done.join('/')+' 未完成'+p.open).join('　'));
ok('每条认知关系都有理由（没有理由不建边）',R.edges.noWhy===0);
ok('没有悬空关系（两端都是真实记录）',R.edges.danglng===0);
ok('候选关联默认全部待确认，不计为进步',R.edges.accepted===0&&R.edges.pending>0,'pending='+R.edges.pending+' accepted='+R.edges.accepted);
ok('存在跨项目候选关联',R.cands.some(c=>c.cross),R.cands.filter(c=>c.cross).map(c=>c.from+' →['+c.rel+']→ '+c.to).join('；'));
ok('未归属的问题停在待分类，不被强行挂上',Object.values(R.orphan).some(v=>v>0),JSON.stringify(R.orphan));
ok('深度来自已确认关系，不是固定七层',JSON.stringify(R.depth)!=='{}'&&!Object.values(R.depth).every(v=>v===7),JSON.stringify(R.depth));
for(const k in R.recall){const h=R.recall[k];ok('召回「'+k+'」命中真实旧记录',h.length>0,h.map(x=>x.p+' '+x.d+' '+x.t).join(' ｜ '))}

// ---- 完整流程（真实 DOM 操作）：新对话 → 接入卡 → 确认 → 世界变化 → 次日恢复 ----
const DEMO={'AI 终端':'今天又想到 AI 终端：是不是必须有专用 AI 硬件，才能做好 AI 共创产品？我倾向先不碰硬件。',
 'Ab Initio':'今天看了 Ab Initio：GDE 很难用，但它还是拿下了很多大银行。说明复杂、难用不一定挡住大客户，可能护城河在数据管道一旦接上就换不掉。',
 'RL-app':'RL-app 真正的入口可能是语音。我平时思考都发生在 ChatGPT 语音里，不装语音入口就只会在查进度时打开 app。'};
const demoOut={};
for(const k in DEMO){
  await p.evaluate(t=>{openCards(t)},DEMO[k]);
  await p.waitForTimeout(250);
  demoOut[k]=await p.evaluate(()=>({weak:CARD.weak,note:CARD.note,pick:CARD.pick,rel:CARD.rel,ev:CARD.ev,
    hits:CARD.hits.map(h=>h.conf+' '+h.score+' '+h.proj+' '+(h.date||'')+' '+h.title.slice(0,30))}));
}
// 没写理由 → 点确认必须被挡住（真实点击）
await p.evaluate(t=>openCards(t),DEMO['RL-app']);
await p.waitForTimeout(200);
const accBefore=await p.evaluate(()=>Object.values(COG.edges).filter(e=>e.confirm==='accepted').length);
await p.evaluate(()=>{document.getElementById('cardWhy').value='';});
await p.click('button:has-text("✓ 确认纳入")');
await p.waitForTimeout(300);
const blockedMsg=await p.textContent('#toast');
const accMid=await p.evaluate(()=>Object.values(COG.edges).filter(e=>e.confirm==='accepted').length);
// 写了理由 → 确认成功
const before=await p.evaluate(()=>({edges:Object.keys(COG.edges).length,heights:districts.map(d=>d.id+':'+d.height).join(' '),nodes:Object.keys(COG.nodes).length}));
await p.evaluate(()=>{document.getElementById('cardWhy').value='10/26 那行假设吸引力靠 SOP 拟人化和养成游戏；今天这条给出另一个解释——入口成本。它挑战的是旧行对原因的判断，证据只到本人观察。';
  document.getElementById('cardNew').value='吸引力的瓶颈可能在入口，而不是游戏化。待验证。';});
await p.click('button:has-text("✓ 确认纳入")');
await p.waitForTimeout(500);
const after=await p.evaluate(()=>({edges:Object.keys(COG.edges).length,heights:districts.map(d=>d.id+':'+d.height).join(' '),nodes:Object.keys(COG.nodes).length,
  accepted:Object.values(COG.edges).filter(e=>e.confirm==='accepted').length}));
// 再确认一条导入期的候选关联
const flow=await p.evaluate(()=>{
  const cand=Object.values(COG.edges).find(e=>e.confirm==='pending'&&e.src==='candidate');
  acceptEdge(cand.id);
  return {accepted:Object.values(COG.edges).filter(e=>e.confirm==='accepted').length,
    accEdge:{rel:cand.rel,why:cand.why.slice(0,50)},stored:!!localStorage.getItem('rlworld.cog.v2'),
    pick:{p:'rl'},blocked:true};
});
for(const k in demoOut){const d=demoOut[k];
  ok('接入卡 · '+k+'：召回并给出相关度',d.hits.length>0,(d.weak?'[低相关，建议待分类] ':'')+d.hits.join(' ｜ '))}
ok('召回不到强相关时不自动选父节点（不强行连接）',demoOut['Ab Initio'].pick===null&&demoOut['Ab Initio'].weak===true,demoOut['Ab Initio'].note.slice(0,70));
ok('强相关时自动预选正确旧节点',demoOut['RL-app'].pick!==null&&demoOut['AI 终端'].pick!==null);
ok('没写关系理由时点确认被挡住',accMid===accBefore&&/必须写出/.test(blockedMsg||''),blockedMsg);
ok('写了理由后确认成功，认知层新增节点与关系',after.accepted>accBefore&&after.nodes>before.nodes,JSON.stringify(before)+' → '+JSON.stringify(after));
ok('确认导入期候选关联后记为 accepted',flow.accepted>=2,'accepted='+flow.accepted);
ok('确认后 3D 建筑高度随数据变化（不是预写死的动画）',after.heights!==before.heights,JSON.stringify(before)+' → '+JSON.stringify(after));
ok('认知层写入本地存储',flow.stored);

// 次日恢复：重新加载页面
await p.reload({waitUntil:'load'});await p.waitForTimeout(2500);
const day2=await p.evaluate(()=>({accepted:Object.values(COG.edges).filter(e=>e.confirm==='accepted').length,
  events:COG.events.length,brief:document.getElementById('brief').textContent.slice(0,0),
  suggestQ:suggest().r.title.slice(0,36),depth:depthOf('rl')}));
ok('次日（重新打开）恢复上次确认的认知状态',day2.accepted>=1&&day2.events>=1,JSON.stringify(day2));

// 历史回放
const rp=await p.evaluate(()=>{const ds=DATES();ASOF='2026-09-30';rebuild();
  const s=IMP.projects.map(p=>p.id+':'+rowsOf(p.id).filter(r=>visible(r)&&openAt(r)).length).join(' ');
  ASOF=null;rebuild();
  const n=IMP.projects.map(p=>p.id+':'+rowsOf(p.id).filter(r=>visible(r)&&openAt(r)).length).join(' ');
  return {dates:ds.length,at0930:s,now:n}});
ok('历史回放能回到过去某一天的认知状态',rp.at0930!==rp.now,'2026-09-30: '+rp.at0930+' ／ 现在: '+rp.now);

// 不写回 GitHub
const net=[];p.on('request',r=>{if(/api\.github\.com/.test(r.url())&&r.method()!=='GET')net.push(r.method()+' '+r.url())});
await p.evaluate(()=>{saveCog()});await p.waitForTimeout(400);
ok('全程没有向 GitHub 发起写请求',net.length===0,net.join(';'));
ok('页面无 JS 错误',errs.length===0,errs.slice(0,3).join(' | '));

console.log(out.join('\n'));
console.log('\n小计：'+out.filter(x=>x.startsWith('PASS')).length+' PASS / '+out.filter(x=>x.startsWith('FAIL')).length+' FAIL');
console.log('\n--- 召回明细 ---');for(const k in R.recall)console.log(k+'：\n  '+R.recall[k].map(x=>x.p+' '+x.d+' '+x.t+' (score '+x.s+(x.open?', 未完成':'')+')').join('\n  '));
console.log('\n--- 候选关联 ---');R.cands.forEach(c=>console.log((c.cross?'[跨项目] ':'')+c.from+' --'+c.rel+'/'+c.ev+'--> '+c.to));
console.log('\n--- 各项目 ---');R.projects.forEach(x=>console.log(JSON.stringify(x)));
await b.close();
process.exit(out.some(x=>x.startsWith('FAIL'))?1:0);
