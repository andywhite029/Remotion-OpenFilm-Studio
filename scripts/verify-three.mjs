import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright-core';

// Verification only: no edits to project, adapter, or template source.
const root=new URL('../',import.meta.url);
const out=new URL('verification/',root);
await mkdir(out,{recursive:true});
const artifact=name=>fileURLToPath(new URL('three'+name,out));
const session=JSON.parse(await readFile(new URL('.studio/session.json',root),'utf8'));
const report={startedAt:new Date().toISOString(),projectPath:fileURLToPath(new URL('projects/ThreeDemo',root)),origin:session.origin,verified:[],unknown:[],errors:[],console:[],requestsFailed:[],frames:[],export:null};
const api=async(path,method='GET',body)=>{
 const res=await fetch(session.origin+path,{method,headers:{'x-studio-key':session.key,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(90000)});
 const text=await res.text();let value;try{value=JSON.parse(text);}catch{throw new Error(`${method} ${path}: ${res.status}: ${text.slice(0,1000)}`);}
 if(!res.ok)throw new Error(`${method} ${path}: ${res.status}: ${JSON.stringify(value)}`);return value;
};
let browser;
try{
 const {project}=await api('/api/projects','POST',{path:report.projectPath,create:false});
 report.project={id:project.id,name:project.name,path:project.path};
 report.verified.push('Opened projects/ThreeDemo using POST /api/projects with create:false.');
 const base='/api/projects/'+encodeURIComponent(project.id);
 const state=await api(base);report.state={folder:state.folder,rev:state.rev,doc:state.doc,value:state.value};
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.setDefaultTimeout(60000);
 page.on('pageerror',e=>report.errors.push({stage:'browser',message:e.message,stack:e.stack}));
 page.on('console',m=>{if(['error','warning'].includes(m.type()))report.console.push({type:m.type(),text:m.text()});});
 page.on('requestfailed',r=>report.requestsFailed.push({url:r.url(),failure:r.failure()}));
 await page.goto(new URL('film.html',state.folder).href,{waitUntil:'load',timeout:90000});
 await page.waitForFunction(()=>!!window.film,{timeout:60000});
 await page.evaluate(async()=>{await window.film.ready;});
 report.film=await page.evaluate(()=>({duration:window.film.duration,width:window.film.width,height:window.film.height}));
 report.verified.push('Film loaded and window.film.ready resolved in playwright-core headless Chromium.');
 for(const [index,t] of [0,1,2,1].entries()){
  console.log(`Seek ${index}: ${t}s`);
  await page.evaluate(async t=>{await window.film.frame(t);},t);
  await page.waitForTimeout(200);
  const canvases=[];
  for(const frame of page.frames()){
   const info=await frame.evaluate(()=>[...document.querySelectorAll('canvas')].map(c=>{
    const result={width:c.width,height:c.height,rect:{width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height},webgl:false};
    try{
     const gl=c.getContext('webgl2')||c.getContext('webgl')||c.getContext('experimental-webgl');result.webgl=!!gl;
     if(gl){result.contextLost=gl.isContextLost();result.renderer=gl.getParameter(gl.RENDERER);}
     const probe=document.createElement('canvas');probe.width=64;probe.height=36;const ctx=probe.getContext('2d',{willReadFrequently:true});ctx.drawImage(c,0,0,64,36);const pixels=ctx.getImageData(0,0,64,36).data;
     const colors=new Set();let opaque=0,nonzero=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i+3])opaque++;if(pixels[i]||pixels[i+1]||pixels[i+2])nonzero++;colors.add([pixels[i],pixels[i+1],pixels[i+2],pixels[i+3]].join(','));}
     result.pixels={sampleCount:pixels.length/4,opaque,nonzero,uniqueColors:colors.size};
    }catch(e){result.readError=String(e);}
    return result;
   }));
   for(const c of info)canvases.push({frameUrl:frame.url(),...c});
  }
  const screenshot=artifact(`-frame-${index}-t${t}.png`);
  const bytes=await page.screenshot({path:screenshot});
  // Decode the compositor screenshot: WebGL buffers may be cleared after compositing.
  // The central half of the image excludes the demo's top/bottom DOM HUD.
  const screenshotPixels=await page.evaluate(async base64=>{
   const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
   const c=document.createElement('canvas');c.width=96;c.height=54;const ctx=c.getContext('2d');ctx.drawImage(image,image.width/4,image.height/4,image.width/2,image.height/2,0,0,96,54);
   const p=ctx.getImageData(0,0,96,54).data;const colors=new Set();let min=255,max=0,bright=0;
   for(let i=0;i<p.length;i+=4){colors.add([p[i],p[i+1],p[i+2]].join(','));for(let k=0;k<3;k++){min=Math.min(min,p[i+k]);max=Math.max(max,p[i+k]);}if(Math.max(p[i],p[i+1],p[i+2])>80)bright++;}
   return {region:'central 50% width and height, excluding top/bottom DOM HUD',sampleCount:p.length/4,uniqueColors:colors.size,min,max,bright};
  },bytes.toString('base64'));
  const entry={index,time:t,canvases,screenshot,screenshotPixels,sha256:createHash('sha256').update(bytes).digest('hex')};
  report.frames.push(entry);
  console.log(JSON.stringify(entry));
 }
 if(report.frames.every(f=>f.canvases.some(c=>c.webgl&&!c.contextLost&&c.width>0&&c.height>0&&c.pixels?.nonzero>0&&c.pixels.uniqueColors>1)))report.verified.push('All seeks [0,1,2,1] exposed a live WebGL canvas with nonempty, multicolor sampled pixels.');
 else if(report.frames.every(f=>f.canvases.some(c=>c.webgl&&!c.contextLost)&&f.screenshotPixels.uniqueColors>20&&f.screenshotPixels.max-f.screenshotPixels.min>40))report.verified.push('All seeks [0,1,2,1] showed a live WebGL canvas and nonempty multicolor compositor screenshots in the central scene area, excluding the DOM HUD. Direct canvas pixel reads were transparent after compositing.');
 else report.unknown.push('Nonempty WebGL rendering was not established for every seek; consult screenshots and canvas diagnostics.');
 if(report.frames[1].sha256===report.frames[3].sha256)report.verified.push('Repeated t=1 screenshots are byte-identical after seeking backward from t=2.');
 else report.unknown.push('Repeated t=1 screenshots differ; visual/deterministic equivalence is not established.');
 const ask={kind:'video',codec:'h264',fps:10,shortEdge:360,range:[0,0.5],audio:false,hardware:false,name:'three-verification'};
 const queued=await api(base+'/exports','POST',{jobs:[ask],folder:fileURLToPath(out)});
 const job=queued.exports?.[0];if(!job)throw new Error('Export API did not return a queued job');
 report.export={requested:ask,job,history:[]};
 let done;
 const deadline=Date.now()+240000;
 while(Date.now()<deadline){
  const jobs=await api(base+'/exports');done=jobs.exports.find(j=>j.id===job.id);
  if(!done)throw new Error('Queued export missing from export list');
  const event={at:new Date().toISOString(),status:done.status,phase:done.phase,framesDone:done.framesDone,framesTotal:done.framesTotal,error:done.error};
  if(JSON.stringify({...event,at:undefined})!==JSON.stringify({...report.export.history.at(-1),at:undefined})){report.export.history.push(event);console.log('Export',JSON.stringify(event));}
  if(['done','failed','cancelled'].includes(done.status))break;
  await new Promise(r=>setTimeout(r,1000));
 }
 report.export.terminal=done;
 report.export.files=[];
 for(const path of done.outputs||[]){try{const s=await stat(path);report.export.files.push({path,bytes:s.size});}catch(e){report.export.files.push({path,error:String(e)});}}
 if(done.status==='done'&&report.export.files.some(f=>f.bytes>0)){
  report.verified.push('Studio short video export reached terminal done with a nonempty output file.');
  const video=done.outputs[0];
  const probe=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',video],{encoding:'utf8'});
  report.export.probe={status:probe.status,error:probe.error?.message,stderr:probe.stderr};
  if(probe.status===0){report.export.probe.result=JSON.parse(probe.stdout);report.verified.push('ffprobe inspected the completed video stream and container.');}
  else report.unknown.push('ffprobe could not inspect the exported video.');
  const decode=spawnSync('ffmpeg',['-v','error','-i',video,'-f','null','-'],{encoding:'utf8'});
  report.export.decode={status:decode.status,error:decode.error?.message,stderr:decode.stderr};
  if(decode.status===0)report.verified.push('ffmpeg decoded the complete exported video without errors.');else report.unknown.push('ffmpeg did not establish complete video decodability.');
 }
 else report.unknown.push(`Studio video export did not prove completion: terminal status ${done.status}; ${done.error||''}`);
}catch(e){report.errors.push({stage:'verification',message:e.message,stack:e.stack});console.error(e);}
finally{
 if(browser)await browser.close();
 report.finishedAt=new Date().toISOString();
 report.status=report.errors.length||report.unknown.length?'partial':'passed';
 await writeFile(artifact('-report.json'),JSON.stringify(report,null,2));
 const md=`# ThreeDemo verification\n\nRun: ${report.startedAt} to ${report.finishedAt}\n\nStatus: **${report.status}**\n\n## Verified\n\n${report.verified.map(x=>'- '+x).join('\n')||'- None.'}\n\n## Unknown or failed\n\n${[...report.unknown,...report.errors.map(e=>e.stage+': '+e.message)].map(x=>'- '+x).join('\n')||'- None.'}\n\n## Scope\n\nOnly scripts/verify-three.mjs and verification/three* artifacts are written by this script. The script opens the existing project but never edits its film or source. Studio may maintain its own project registry/history when opening. Export uses Studio API and is directed to verification; see JSON for terminal job state and output paths. No external network sources are consulted.\n\n## Evidence\n\nSee three-report.json and three-frame-*-t*.png. Canvas pixel reads sample each WebGL canvas through a 64×36 2D canvas after each committed frame. Screenshot equality is a strict byte check. The export JSON records terminal state, ffprobe stream/container metadata, and full ffmpeg decode result. This is a smoke check of nonempty rendering and seek repeatability, not a visual quality review or proof of arbitrary scene correctness. Direct canvas readback remains transparent; compositor screenshots provide the rendering evidence. Browser console warnings and aborted requests, if any, are retained in JSON separately from page errors.\n`;
 await writeFile(artifact('-report.md'),md);
 console.log(JSON.stringify({status:report.status,verified:report.verified,unknown:report.unknown,errors:report.errors,exportStatus:report.export?.terminal?.status},null,2));
}
if(report.status!=='passed')process.exitCode=1;
