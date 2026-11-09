/* ============================================================
   第三层：可视化世界 —— 只是认知关系的一种外形。
   区域数量、建筑高度、层数全部来自导入后的真实数据与已确认关系。
   ============================================================ */
let districts=[],goal={id:'__goal__',name:'核心欲望（未确认）',xyz:[0,0,-11],height:40};
let baseMesh=null,landmarkBuilders=[],labelNodes=[];
const PAL=[['#49525f','#57505c'],['#4c4658','#58434f'],['#3d5260','#45545f'],['#49415c','#555066'],['#3a535b','#44575c'],['#4b4a40','#55504a'],['#404a5c','#4a4458']];
const TONE=['#d9b18c','#e1a9a1','#8fbcc1','#b8a6d1','#9bd0b8','#e2bf8c','#a9c4e0'];

const confirmed=e=>e.confirm==='from-data'||e.confirm==='accepted';
function edgesOut(id){return Object.values(COG.edges).filter(e=>e.from===id)}
function edgesIn(id){return Object.values(COG.edges).filter(e=>e.to===id)}
// 深度 = 已确认「下一层」关系能连出的最长链。不固定七层。
function depthOf(proj){
  const nodes=Object.values(COG.nodes).filter(n=>n.proj===proj);
  const memo={};
  function f(id,seen){
    if(memo[id]!=null)return memo[id];
    if(seen.has(id))return 0;seen.add(id);
    let best=0;
    for(const e of edgesOut(id))if(e.rel==='deeper'&&confirmed(e))best=Math.max(best,1+f(e.to,seen));
    seen.delete(id);return memo[id]=best;
  }
  let m=0;for(const n of nodes)m=Math.max(m,f(n.id,new Set()));
  return m;
}
function statsOf(p){
  const rows=rowsOf(p.id),open=rows.filter(r=>r.open),closed=rows.filter(r=>!r.open);
  const nodeIds=new Set(Object.values(COG.nodes).filter(n=>n.proj===p.id).map(n=>n.id));
  const es=Object.values(COG.edges).filter(e=>nodeIds.has(e.from)||nodeIds.has(e.to));
  const sub=open.filter(r=>edgesIn(r.id).some(e=>e.rel==='deeper'&&confirmed(e)));
  const orphan=open.filter(r=>!edgesIn(r.id).some(e=>confirmed(e)));
  return {rows:rows.length,open:open.length,closed:closed.length,depth:depthOf(p.id),
    pending:es.filter(e=>e.confirm==='pending').length,
    accepted:es.filter(e=>e.confirm==='accepted').length,
    sub:sub.length,orphan:orphan.length,
    verified:es.filter(e=>e.ev==='verified').length,
    revised:es.filter(e=>e.rel==='revise'&&confirmed(e)).length,
    resolved:closed.length};
}
function buildDistricts(){
  const ps=IMP.projects,n=ps.length||1,R=27;
  districts=ps.map((p,i)=>{
    const a=(55+(n===1?125:250*i/(n-1)))*Math.PI/180;
    const st=statsOf(p);
    return {id:p.id,name:p.name,proj:p,st,color:TONE[i%TONE.length],pal:PAL[i%PAL.length],
      xyz:[+(R*Math.sin(a)).toFixed(2),0,+(-11+R*Math.cos(a)).toFixed(2)],
      height:Math.round(16+Math.min(16,st.open*1.2)+Math.min(11,st.depth*1.5)+Math.min(9,st.accepted*1.2)),
      short:(p.goal||'').slice(0,34),
      stline:(st.depth?('已确认深度 '+st.depth+' 层'):'尚无已确认的深入关系')+' · 未完成 '+st.open+' / '+st.rows+' · 待确认关联 '+st.pending+(st.accepted?' · 已确认 '+st.accepted:'')};
  });
  goal.name=COG.topDesire&&COG.topDesire.confirmed&&COG.topDesire.text?COG.topDesire.text:'核心欲望（未确认）';
  goal.height=COG.topDesire&&COG.topDesire.confirmed?46:26;
}
function buildWorld(){
  seed=77;
  const base=new Builder();landmarkBuilders=[];
  base.box(0,-.54,-11,128,.56,128,rgb('#1b202b'));base.box(0,-.36,-11,125,.2,125,rgb('#28303b'));
  for(let z=-65;z<55;z+=13){base.box(0,-.1,z,126,.05,1.45,rgb('#313640'));for(let x=-60;x<64;x+=13)base.box(x,-.08,z,1.2,.045,.09,rgb('#bd9677'),.65)}
  for(let x=-63;x<=63;x+=13){base.box(x,-.08,-11,.86,.04,125,rgb('#34343d'));for(let z=-62;z<53;z+=4)base.box(x,-.04,z,.12,.05,1.8,rgb('#be9075'),.5)}
  for(let x of [-8,8])base.box(x,-.02,26,.13,.12,80,rgb('#7dbbbb'),.85);
  for(let k=0;k<105;k++){let x=between(-61,61),z=between(-71,52);if(Math.abs(x)<7&&z>-5&&z<40)continue;if(rand()<.68){const hei=between(.2,.8);base.box(x,hei/2,z,.14,hei,.14,rgb('#c4a8a3'),.1)}}
  for(let x=-60;x<=60;x+=8.6)for(let z=-67;z<=47;z+=10.4){
    const near=districts.some(d=>Math.hypot(x-d.xyz[0],z-d.xyz[2])<11)||Math.hypot(x-goal.xyz[0],z-goal.xyz[2])<12;
    if(near||rand()<.29||Math.abs(x)<5&&z>0)continue;
    architecture(base,x+between(-1.3,1.3),z+between(-1.5,1.5),between(3.7,6.8),between(3.4,6.4),between(5,20));
  }
  for(let z=-61;z<51;z+=9.8)for(let x of [-7,7]){base.box(x,0,z,.16,3.4,.17,rgb('#61565b'));base.box(x,3.05,z,.8,.7,.8,rgb('#c75b4c'),.9);base.box(x,3.76,z,.95,.16,.95,rgb('#e8bc88'),.8)}
  // 每个项目一座主楼；楼体层数 = 已确认深入层数（没有就只有基座，不假装有深度）
  for(const d of districts){
    const b=new Builder(),x=d.xyz[0],z=d.xyz[2],h=d.height;
    b.box(x,-.15,z,14,.7,14,rgb('#505566'));b.box(x,-.03,z,15,.1,15,rgb('#a47d6e'),.3);
    architecture(b,x,z,7.3,7.1,h,{main:true,tones:d.pal});
    // 四座副楼 = 这个项目未完成问题的规模（最多四座，超出用高度表示）
    const wings=Math.min(4,Math.max(1,Math.ceil(d.st.open/3)));
    for(let j=0;j<wings;j++){const a=Math.PI*.5*j+Math.PI/4;architecture(b,x+Math.cos(a)*6.4,z+Math.sin(a)*6.4,3.1,3.2,6+Math.min(9,d.st.closed*.6)+rand()*3,{tones:d.pal})}
    landmarkBuilders.push(b.mesh());
  }
  // 中央主殿：核心欲望未确认时只建基座，不建高塔
  const cb=new Builder();cb.box(0,-.18,-11,18,.8,18,rgb('#55505b'));cb.box(0,-.03,-11,19,.12,19,rgb('#b18a73'),.4);
  architecture(cb,0,-11,10,10,goal.height,{main:true,tones:['#5a5054','#55505c']});
  if(COG.topDesire&&COG.topDesire.confirmed)for(let j=0;j<4;j++){let a=j*Math.PI/2+Math.PI/4;architecture(cb,Math.cos(a)*7.4,-11+Math.sin(a)*7.4,3.7,3.7,17,{tones:['#4f515e']})}
  landmarkBuilders.push(cb.mesh());
  baseMesh=base.mesh();
  buildLabels();
}
function buildLabels(){
  elLabels.innerHTML='';labelNodes.length=0;
  const add=(d,isRoot)=>{const node=document.createElement('button');node.className='world-label'+(isRoot?' rootlabel':'');
    node.innerHTML=`<span class="bullet" style="color:${isRoot?'#e8c59b':d.color};background:currentColor"></span><strong>${escapeHtml(d.name)}</strong>`;
    node.onclick=()=>{if(isRoot)openTopDesire();else select(d.id)};elLabels.appendChild(node);labelNodes.push({d,node,isRoot})};
  add(goal,true);for(const d of districts)add(d,false);
}
// 视觉标记（只是表现，不作为数据判据）
function drawMarkers(now){
  for(const d of districts){
    const s=d.st,p=projPoint([d.xyz[0],d.height+3,d.xyz[2]],viewProj,W,H);
    if(!p||p.x<-60||p.x>W+60)continue;
    // 探索：临时光点，不加建筑
    for(let k=0;k<Math.min(12,s.pending);k++){const a=k*2.399+now*.0004,r=22+((k*7)%18);
      ctx.fillStyle='rgba(141,228,220,'+(.35+.25*Math.sin(now*.003+k)).toFixed(3)+')';
      ctx.beginPath();ctx.arc(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r*.55,1.8,0,7);ctx.fill()}
    // 待完成的必要子问题：虚线脚手架
    if(s.sub){ctx.setLineDash([4,4]);ctx.strokeStyle='rgba(226,191,140,.45)';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(p.x,p.y+6,16+s.sub*2,0,Math.PI*2);ctx.stroke();ctx.setLineDash([])}
    // 待分类探索：灰色虚点，表示还没有父节点
    if(s.orphan){ctx.fillStyle='rgba(167,178,194,.5)';for(let k=0;k<Math.min(10,s.orphan);k++){
      ctx.beginPath();ctx.arc(p.x-26+k*6,p.y+24,1.4,0,7);ctx.fill()}}
    // 现实验证过：稳定信标
    if(s.verified){ctx.fillStyle='rgba(155,208,184,.85)';ctx.beginPath();ctx.arc(p.x,p.y-12,3.2,0,7);ctx.fill()}
  }
}
