// 验证部署版本检测是真正比较新旧 APPVER，而不是只改常量。
const fs=require("fs"),vm=require("vm"),assert=require("node:assert/strict"),path=require("path");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const version=html.match(/const APPVER="(v[0-9-]+[a-z])"/)?.[1];
assert(version&&version!=="v2026-11-07b","必须更新 APPVER");
const a=html.indexOf("async function checkVer(){");
const b=html.indexOf("\ncheckVer();",a);
assert(a>=0&&b>a,"版本检查函数不存在");
const S={};let renderCount=0;
const ctx={APPVER:version,S,render:()=>renderCount++,Date,location:{pathname:"/rl-app/"},
 fetch:async()=>({text:async()=>html.replace('const APPVER="'+version+'"','const APPVER="v2026-11-24a"')})};
vm.createContext(ctx);
vm.runInContext(html.slice(a,b)+"\nthis.testCheckVer=checkVer;",ctx);
(async()=>{
 await ctx.testCheckVer();
 assert.equal(S.newver,"v2026-11-24a","应识别不同版本");
 assert.equal(renderCount,1,"只有第一次发现更新时才提示");
 await ctx.testCheckVer();
 assert.equal(renderCount,1,"同一更新不反复提示");
 ctx.fetch=async()=>({text:async()=>html});
 await ctx.testCheckVer();
 assert.equal(renderCount,1,"相同版本不提示");
 console.log("版本号与更新提示测试通过："+version);
})().catch(e=>{console.error(e);process.exitCode=1});
