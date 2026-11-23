// 运行：node tests/test_safe_save.cjs
// 读取当前 index.html 中的实际存取代码；所有 GitHub 请求由内存模拟，不会触及真实数据。
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const html = fs.readFileSync(require("node:path").join(__dirname, "..", "index.html"), "utf8");
const start = html.indexOf("const SHA={},BASE={};");
const end = html.indexOf("/* ============ 状态 ============ */", start);
assert(start >= 0 && end > start, "未找到 RL-app GitHub 存取代码");
const source = [
  'const cfg={owner:"test",repo:"test",branch:"dev",token:"fake"};',
  "const b64e=s=>Buffer.from(s,'utf8').toString('base64');",
  "const b64d=s=>Buffer.from(s,'base64').toString('utf8');",
  html.slice(start, end),
  "this.io={get,getOptional,put,cfg,SHA,BASE,READ};",
].join("\n");

const path="projects/rl/rows.json";
let assertions=0;
function make(initial,production=false,file=path) {
  const server={data:initial===undefined?undefined:JSON.parse(JSON.stringify(initial)),
                rev:1,exists:initial!==undefined,putErrors:[],readStatus:0,branchExists:true,requests:[],expectedBranch:production?"main":"dev"};
  const fetch=async(url,options={})=>{
    server.requests.push({url,method:options.method||"GET"});
    if(url.endsWith("/branches/"+server.expectedBranch))
      return server.branchExists?{ok:true,json:async()=>({name:"dev"})}:{ok:false,status:404};
    if(!url.startsWith("https://api.github.com/repos/test/test/contents/data/"+file))
      throw Error("unexpected path "+url);
    if(options.method!=="PUT"&&!url.endsWith("?ref="+server.expectedBranch))
      throw Error("读取未显式指定开发分支："+url);
    if(options.method==="PUT"){
      const input=JSON.parse(options.body);
      assert.equal(input.branch,server.expectedBranch,"写入必须显式绑定对应真实分支");
      if(server.putErrors.length){const code=server.putErrors.shift();
        return {ok:false,text:async()=>"simulated failure",status:code};}
      if(server.exists&&input.sha!=="rev"+server.rev)
        return {ok:false,text:async()=>"conflict",status:409};
      if(!server.exists&&input.sha)
        return {ok:false,text:async()=>"conflict",status:409};
      server.exists=true;
      server.data=JSON.parse(Buffer.from(input.content,"base64").toString("utf8"));
      server.rev++;
      return {ok:true,json:async()=>({content:{sha:"rev"+server.rev}})};
    }
    if(server.readStatus)return {ok:false,text:async()=>"simulated read error",status:server.readStatus};
    if(!server.exists)return {ok:false,text:async()=>"not found",status:404};
    return {ok:true,json:async()=>({
      sha:"rev"+server.rev,
      content:Buffer.from(JSON.stringify(server.data),"utf8").toString("base64")
    })};
  };
  const ctx=vm.createContext({fetch,Buffer,JSON,Error,Array,Object,
    location:{hostname:production?"vicki257.github.io":"dev-preview.example",pathname:production?"/rl-app/":"/dev"}});
  vm.runInContext(source,ctx);
  return {server,io:ctx.io};
}
async function expectReject(action,label){
  let failed=false;
  try{await action()}catch(e){failed=true;}
  assert(failed,label);
  assertions++;
}
(async()=>{
  // Actions 只添加 UID，旧页面编辑文字：自动带回 UID，后续再保存也不删除它。
  {
    const {server,io}=make([{id:"r1",date:"2026-11-21",q:"旧问题"}]);
    const rows=await io.get(path);
    server.data[0].uid="A000000225";server.rev++;
    rows[0].q="修改过的问题";
    await io.put(path,rows,"编辑问题");
    assert.equal(server.data[0].uid,"A000000225");
    assert.equal(server.data[0].q,"修改过的问题");
    assert.equal(rows[0].uid,"A000000225");
    rows[0].q="再次保存";
    await io.put(path,rows,"再次编辑");
    assert.equal(server.data[0].uid,"A000000225");
    assertions+=4;
  }
  // 其他 AI 修改内容：旧页面的整文件保存必须失败，不得覆盖。
  {
    const {server,io}=make([{id:"r1",date:"2026-11-21",q:"原问题"}]);
    const rows=await io.get(path);
    server.data[0].q="其他 AI 的新判断";server.rev++;
    rows[0].q="页面上的不同判断";
    await expectReject(()=>io.put(path,rows,"保存"),"旧内容覆盖应被拒绝");
    assert.equal(server.data[0].q,"其他 AI 的新判断");
    assertions++;
  }
  // 机器人补号期间用户在尾部新增记录：前缀可以安全合并，尾部应正常保存。
  {
    const {server,io}=make([{id:"r1",date:"2026-11-21",q:"原问题"}]);
    const rows=await io.get(path);
    server.data[0].uid="A000000225";server.rev++;
    rows.push({id:"r2",date:"2026-11-21",q:"新增问题"});
    await io.put(path,rows,"新增");
    assert.equal(server.data.length,2);
    assert.equal(server.data[0].uid,"A000000225");
    assert.equal(server.data[1].q,"新增问题");
    assertions+=3;
  }
  // 删除或原数组重排不能根据下标猜测原始身份。
  {
    const {server,io}=make([{id:"r1",date:"2026-11-21",q:"原问题"}]);
    const rows=await io.get(path);
    server.data[0].uid="A000000225";server.rev++;
    rows.pop();
    await expectReject(()=>io.put(path,rows,"删除"),"无稳定键的删除仍应要求刷新");
    assert.equal(server.data.length,1);assertions++;
  }
  {
    const {server,io}=make([
      {date:"2026-11-21",q:"甲"},{date:"2026-11-21",q:"乙"}
    ]);
    const rows=await io.get(path);
    server.data[0].uid="A000000225";server.data[1].uid="A000000226";server.rev++;
    rows.reverse();
    await expectReject(()=>io.put(path,rows,"重排"),"同日期记录换位应阻止 UID 错配");
    assert.equal(server.data[0].q,"甲");assertions++;
    assert.equal(rows[0].uid,undefined);
    assert.equal(rows[1].uid,undefined);assertions+=2;
  }
  // 数组头部插入而不是尾部追加时，不可把旧行的 UID 配给新行。
  {
    const {server,io}=make([{date:"2026-11-21",q:"甲"}]);
    const rows=await io.get(path);
    server.data[0].uid="A000000225";server.rev++;
    rows.unshift({date:"2026-11-21",q:"新插入"});
    await expectReject(()=>io.put(path,rows,"插入首条"),"数组头部插入不得误认尾部追加");
    assert.equal(server.data.length,1);
    assert.equal(server.data[0].q,"甲");
    assert.equal(rows[0].uid,undefined);
    assertions+=3;
  }
  // 同一天的多条记录还没 uid，且其中两条换位并改了内容时，不能只凭日期配号。
  {
    const {server,io}=make([
      {date:"2026-11-21",q:"甲"},{date:"2026-11-21",q:"乙"}
    ]);
    const rows=await io.get(path);
    server.data[0].uid="A000000225";server.data[1].uid="A000000226";server.rev++;
    rows[0].q="乙改";rows[1].q="甲改";
    await expectReject(()=>io.put(path,rows,"同日重排并修改"),
                       "同日期无稳定身份的两条改动必须拒绝");
    assert.equal(server.data[0].uid,"A000000225");
    assert.equal(server.data[1].uid,"A000000226");
    assert.equal(rows[0].uid,undefined);
    assert.equal(rows[1].uid,undefined);
    assertions+=4;
  }
  // 唯一日期的行身份可验证，不能因为新的保护而拒绝正常文字修改。
  {
    const {server,io}=make([
      {date:"2026-11-20",q:"甲"},{date:"2026-11-21",q:"乙"}
    ]);
    const rows=await io.get(path);
    server.data[0].uid="A000000225";server.data[1].uid="A000000226";server.rev++;
    rows[1].q="乙改";
    await io.put(path,rows,"唯一日期正常修改");
    assert.equal(server.data[1].uid,"A000000226");
    assert.equal(server.data[1].q,"乙改");
    assertions+=2;
  }
  // 原本允许不存在的 JSON 文件首次创建（不带 sha）。
  {
    const {server,io}=make(undefined);
    await io.put(path,[{date:"2026-11-21",q:"首条记录"}],"首次创建",{create:true});
    assert.equal(server.data[0].q,"首条记录");
    assert.equal(server.exists,true);
    assertions+=2;
  }
  // 第二次 PUT 如返回 401 等权限错误，必须保留真实状态而非谎称版本冲突。
  {
    const {server,io}=make([{id:"r1",date:"2026-11-21",q:"原问题"}]);
    const rows=await io.get(path);
    server.data[0].uid="A000000225";server.rev++;
    rows[0].q="修改问题";
    server.putErrors.push(409,401);
    await expectReject(()=>io.put(path,rows,"权限检测"),"冲突后再遇权限错误应失败");
    assertions++;
  }
  // 对象中间遇到身份错误时，不可部分改动已核对的 UID。
  {
    const {server,io}=make([{id:"r1",q:"甲"},{id:"r2",q:"乙"}]);
    const rows=await io.get(path);
    server.data[0].uid="A000000225";server.data[1].uid="A000000226";server.rev++;
    rows[1].uid="A000000999";
    await expectReject(()=>io.put(path,rows,"身份错误"),"身份不符应安全拒绝");
    assert.equal(rows[0].uid,undefined);assertions++;
  }
  // 反例：省略分支、目标分支不存在，以及换分支后继续使用旧 SHA。
  {
    const {server,io}=make([{id:"r1",q:"原始"}]);
    io.cfg.branch="";
    await expectReject(()=>io.put(path,[{id:"r1",q:"改变"}]),"未配置分支必须禁止写入");
    assert.equal(server.rev,1);
    assert.equal(server.requests.some(r=>r.method==="PUT"),false);
    assertions+=2;
  }
  {
    const {server,io}=make([{id:"r1",q:"原始"}]);
    server.branchExists=false;
    await expectReject(()=>io.put(path,[{id:"r1",q:"改变"}]),"不存在分支必须禁止写入");
    assert.equal(server.requests.some(r=>r.method==="PUT"),false);
    assertions++;
  }
  {
    const {server,io}=make([{id:"r1",q:"旧分支"}]);
    const rows=await io.get(path);
    io.cfg.branch="other";rows[0].q="新分支";
    await expectReject(()=>io.put(path,rows),"换分支后不能沿用旧缓存");
    assert.equal(server.requests.some(r=>r.method==="PUT"),false);
    assertions++;
  }
  // 正式站点历史用户未填写分支，仍明确读写 main；开发预览不允许这种回退。
  {
    const {server,io}=make([{id:"r1",q:"正式版旧记录"}],true);
    io.cfg.branch="";
    const rows=await io.get(path);rows[0].q="正式版更新";
    await io.put(path,rows);
    assert.equal(server.data[0].q,"正式版更新");
    assert(server.requests.some(x=>x.url.endsWith("?ref=main")));
    assert(server.requests.some(x=>x.url.endsWith("/branches/main")));
    assertions+=3;
  }
  // 不可把 401/403/网络错误当成空文件覆盖真实 29 条关系或 183 条方法。
  for(const [file,expected] of [["rels.json",29],["methods.json",183]]){
    const source=JSON.parse(fs.readFileSync(require("node:path").join(__dirname,"..","..","rl-data","data",file),"utf8"));
    const list=file==="rels.json"?"rels":"methods";
    assert.equal(source[list].length,expected);
    for(const code of [401,403,500]){
      const {server,io}=make(source,false,file);
      server.readStatus=code;
      await expectReject(()=>io.get(file),"读取失败必须抛错："+file);
      server.readStatus=0;
      const empty={...source,[list]:[]};
      await expectReject(()=>io.put(file,empty,"危险覆盖"),"读失败后不得写空："+file);
      assert.equal(server.data[list].length,expected);
      assert.equal(server.requests.some(x=>x.method==="PUT"),false);
      assertions+=2;
    }
  }
  // 已经成功加载后再次读失败，旧 SHA 也必须失去写入资格。
  {
    const {server,io}=make([{id:"r1",q:"原始"}]);
    const original=await io.get(path);
    server.readStatus=403;
    await expectReject(()=>io.get(path),"再次读取失败应失效");
    server.readStatus=0;
    await expectReject(()=>io.put(path,[{id:"r1",q:"危险覆盖"}]),"旧 SHA 不能写");
    assert.equal(server.data[0].q,original[0].q);assertions++;
  }
  console.log("RL-app 安全保存模拟测试通过：",assertions,"项断言");
})().catch(e=>{console.error(e);process.exitCode=1});
