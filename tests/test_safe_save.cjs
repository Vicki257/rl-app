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
  'const cfg={owner:"test",repo:"test",token:"fake"};',
  "const b64e=s=>Buffer.from(s,'utf8').toString('base64');",
  "const b64d=s=>Buffer.from(s,'base64').toString('utf8');",
  html.slice(start, end),
  "this.io={get,put};",
].join("\n");

const path="projects/rl/rows.json";
let assertions=0;
function make(initial) {
  const server={data:initial===undefined?undefined:JSON.parse(JSON.stringify(initial)),
                rev:1,exists:initial!==undefined,putErrors:[]};
  const fetch=async(url,options={})=>{
    if(!url.endsWith("/data/"+path))throw Error("unexpected path "+url);
    if(options.method==="PUT"){
      const input=JSON.parse(options.body);
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
    if(!server.exists)return {ok:false,text:async()=>"not found",status:404};
    return {ok:true,json:async()=>({
      sha:"rev"+server.rev,
      content:Buffer.from(JSON.stringify(server.data),"utf8").toString("base64")
    })};
  };
  const ctx=vm.createContext({fetch,Buffer,JSON,Error,Array,Object});
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
    await io.put(path,[{date:"2026-11-21",q:"首条记录"}],"首次创建");
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
  console.log("RL-app 安全保存模拟测试通过：",assertions,"项断言");
})().catch(e=>{console.error(e);process.exitCode=1});
