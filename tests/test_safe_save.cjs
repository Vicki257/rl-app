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
  const server={data:JSON.parse(JSON.stringify(initial)),rev:1};
  const fetch=async(url,options={})=>{
    if(!url.endsWith("/data/"+path))throw Error("unexpected path "+url);
    if(options.method==="PUT"){
      const input=JSON.parse(options.body);
      if(input.sha!=="rev"+server.rev)
        return {ok:false,text:async()=>"conflict",status:409};
      server.data=JSON.parse(Buffer.from(input.content,"base64").toString("utf8"));
      server.rev++;
      return {ok:true,json:async()=>({content:{sha:"rev"+server.rev}})};
    }
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
  // 同时新增/删除记录：位置不可靠时不能把 UID 安到错误的对象上。
  {
    const {server,io}=make([{id:"r1",date:"2026-11-21",q:"原问题"}]);
    const rows=await io.get(path);
    server.data[0].uid="A000000225";server.rev++;
    rows.push({id:"r2",date:"2026-11-21",q:"新问题"});
    await expectReject(()=>io.put(path,rows,"新增"),"结构变化不应自动按位置合并");
    assert.equal(server.data.length,1);
    assert.equal(server.data[0].uid,"A000000225");
    assertions+=2;
  }
  console.log("RL-app 安全保存模拟测试通过：",assertions,"项断言");
})().catch(e=>{console.error(e);process.exitCode=1});
