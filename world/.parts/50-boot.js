/* ---------- 模式、生长动画、回放、启动 ---------- */
const elLabels=document.getElementById('labels');
// worldMode 等在 00-state.js 里提前声明（resize 在加载期就会读它）
function toggleOverview(force){overviewShown=typeof force==='boolean'?force:!overviewShown;$('#overview').classList.toggle('hidden',!overviewShown)}
function worldOverview(){worldMode='orbit';$('#orbit').classList.add('selected');$('#roam').classList.remove('selected');$('#modeHint').textContent='俯瞰全景 · 拖动旋转 · 滚轮缩放 · 点击建筑';if(innerWidth>720)toggleOverview(true);targetZoom=innerWidth<720?112:82;orbitTarget=[0,11,-15];$('#mobilemove').classList.remove('show')}
function enterRoam(){worldMode='roam';$('#roam').classList.add('selected');$('#orbit').classList.remove('selected');$('#modeHint').textContent='漫游模式 · W A S D 行走 · 拖动画面转向';roamPos=[1.8,2.6,46];roamYaw=0;roamPitch=.08;$('#mobilemove').classList.add('show')}
function focusDistrict(d){if(!d)return;orbitTarget=[d.xyz[0]*.68,10,d.xyz[2]*.68];targetZoom=innerWidth<721?101:66}
function grow(which){proposalEffect=which||active||districts[0];changing=performance.now();
  const i=districts.indexOf(proposalEffect);manualGrow={index:i<0?0:i,start:performance.now()};
  if(proposalEffect)notice('✦ 认知更新：'+proposalEffect.name+' 的结构发生变化')}
function rebuild(){buildDistricts();buildWorld();renderOverview();if(active){const a=districts.find(d=>d.id===active.id);if(a){active=a;select(a.id)}}}

/* 历史回放：按日期看过去某一天为止的认知状态 */
function replayOn(){
  const ds=DATES();if(!ds.length)return notice('没有日期可回放');
  const r=$('#rpRange');r.min=0;r.max=ds.length-1;r.value=ds.length-1;
  ASOF=null;$('#rpDate').textContent=ds[ds.length-1]+'（今天）';
  $('#replay').classList.add('show');
  r.oninput=()=>{const i=+r.value;ASOF=(i===ds.length-1)?null:ds[i];
    $('#rpDate').textContent=ds[i]+(ASOF?'':'（今天）');rebuild()};
}
function replayOff(){ASOF=null;$('#replay').classList.remove('show');rebuild();notice('回到当前状态')}

$('#toggleNav').onclick=()=>toggleOverview();
$('#orbit').onclick=worldOverview;$('#roam').onclick=enterRoam;
$('#btnCards').onclick=()=>openCards(null);
$('#btnReport').onclick=showReport;
$('#btnReplay').onclick=replayOn;$('#rpOff').onclick=replayOff;
$('#closeSheet').onclick=closeSheet;
$('#closeDet').onclick=()=>{$('#details').classList.remove('show');active=null;document.querySelectorAll('.district-row').forEach(x=>x.classList.remove('active'))};
$('#send').onclick=()=>{const t=$('#utterance').value.trim();if(!t)return notice('先写一句今天的新认识');$('#utterance').value='';openCards(t)};
$('#utterance').addEventListener('keydown',e=>{if(e.key==='Enter')$('#send').click()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet()});
(function(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;const m=$('#mic');
  if(!SR){m.disabled=true;$('#voiceNote').textContent='这台浏览器不支持语音听写；可以直接粘贴对话文本（实时语音接入是后续能力）';return}
  const sr=new SR();sr.lang='zh-CN';sr.interimResults=true;
  sr.onresult=e=>{let t='';for(let i=0;i<e.results.length;i++)t+=e.results[i][0].transcript;$('#utterance').value=t};
  sr.onerror=()=>notice('语音听写失败，请直接粘贴文本');
  m.onclick=()=>{try{sr.start();notice('正在听写（浏览器本地能力，不是接入 AI）')}catch(err){}}})();

/* ---------- 启动 ---------- */
(async function boot(){
  try{
    await loadRaw();
    runImport();
    loadCog();
    if(!COG.seeded){seedCognition();seedCandidates();saveCog()}
    else{seedCognition();seedCandidates();saveCog()}   // 增量：已确认的边保持不变，只补新节点
    buildDistricts();buildWorld();renderOverview();toggleOverview(overviewShown);worldOverview();
    $('#brandsub').textContent='真实数据：'+recs().length+' 条记录 · '+IMP.projects.length+' 个项目';
    $('#offlineTag').textContent='数据源：'+RAW.source+' · 只读，不写回 RL-data · 召回与关系判断为离线启发式（未接入真实 AI）';
    requestAnimationFrame(render);
    setTimeout(()=>notice('已导入 '+Object.keys(RAW.files).length+' 个原始文件，'+recs().length+' 条记录'),900);
  }catch(e){
    $('#brandsub').textContent='读取失败';
    $('#offlineTag').textContent='读取失败：'+e.message;
    openSheet('<h3>没能读到真实数据</h3><div class="sub">错误：'+escapeHtml(e.message)+'</div>'+
      '<div class="card2"><div class="vv">这个页面必须读到真实 RL-data 才有意义，所以不会退回演示数据。\n\n两种办法：\n1）用本地服务器打开（file:// 下 fetch 会被浏览器拦住）：\n　 python3 -m http.server 8000\n　 然后访问 http://localhost:8000/world/\n2）或让它直连 GitHub：在控制台执行\n　 localStorage.setItem("rlworld.source","live");location.reload()</div></div>');
  }
})();
