// 验证部署版本检测是真正比较新旧 APPVER，而不是只改常量。
const fs=require("fs"),vm=require("vm"),assert=require("node:assert/strict"),path=require("path");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const version=html.match(/const APPVER="([^"]+)"/)?.[1];
// checkVer 自己用的那条正则：APPVER 必须能被它解析，否则线上永远发现不了新版
const APPRE=html.match(/\(await r\.text\(\)\)\.match\((\/[^/]+\/)\)/)?.[1];
assert(APPRE,"没找到 checkVer 里的版本正则");
assert(new RegExp(APPRE.slice(1,-1)).test('const APPVER="'+version+'"'),
  "APPVER "+version+" 不符合 checkVer 的正则 "+APPRE+"，线上将永远提示不到新版本");
assert(version&&version!=="v2026-11-07b","必须更新 APPVER");
const a=html.indexOf("async function checkVer(){");
const b=html.indexOf("\ncheckVer();",a);
assert(a>=0&&b>a,"版本检查函数不存在");
const S={};let renderCount=0;
// 远端「新版本」从当前版本派生（末位字母 +1），永远和 APPVER 不同、又符合同一套格式。
// 写死一个具体版本号会有一天正好等于 APPVER，那时测试会静默失效。
const NEWVER=version.slice(0,-1)+String.fromCharCode(version.charCodeAt(version.length-1)+1);
assert(NEWVER!==version,"派生版本不能和当前版本相同");
const ctx={APPVER:version,S,render:()=>renderCount++,Date,location:{pathname:"/rl-app/"},
 fetch:async()=>({text:async()=>html.replace('const APPVER="'+version+'"','const APPVER="'+NEWVER+'"')})};
vm.createContext(ctx);
vm.runInContext(html.slice(a,b)+"\nthis.testCheckVer=checkVer;",ctx);
(async()=>{
 await ctx.testCheckVer();
 assert.equal(S.newver,NEWVER,"应识别不同版本");
 assert.equal(renderCount,1,"只有第一次发现更新时才提示");
 await ctx.testCheckVer();
 assert.equal(renderCount,1,"同一更新不反复提示");
 ctx.fetch=async()=>({text:async()=>html});
 await ctx.testCheckVer();
 assert.equal(renderCount,1,"相同版本不提示");
 console.log("版本号与更新提示测试通过："+version);
})().catch(e=>{console.error(e);process.exitCode=1});
