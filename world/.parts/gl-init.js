const canvas=document.getElementById('gl'), nativeGL=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:false,depth:true});
const gl=nativeGL || new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getUniformLocation:()=>null},{get:(obj,key)=>key in obj?obj[key]:()=>null});
const glow=document.getElementById('glow'),ctx=glow.getContext('2d');
