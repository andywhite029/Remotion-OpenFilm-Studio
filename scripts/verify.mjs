import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const s=JSON.parse(await readFile(new URL('../.studio/session.json',import.meta.url),'utf8'));
const headers={'x-studio-key':s.key,'content-type':'application/json'};
const api=async (url,method='GET',body)=>{const r=await fetch(s.origin+url,{method,headers,...(body?{body:JSON.stringify(body)}:{})});const v=await r.json();if(!r.ok)throw new Error(JSON.stringify(v));return v;};
const base=`/api/projects/${s.project.id}`;
const browser=await chromium.launch({headless:true});
const errors=[];
const page=await browser.newPage({viewport:{width:1920,height:1080}});
page.on('pageerror',e=>errors.push(e.message));
await mkdir(new URL('../verification',import.meta.url),{recursive:true});
let original;
try{
 let state=await api(base); original=state.value.tracks.flatMap(track => track.clips).find(clip => clip.id === 'title').overrides || [];
 console.log('Project loaded',state.doc?.tracks?.length);
 await page.goto(state.folder+'film.html');
 await page.waitForFunction(()=>!!window.film);
 await page.evaluate(async()=>{await window.film.ready;await window.film.frame(1);});
 await page.screenshot({path:new URL('../verification/before.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
 const target=await page.evaluate(()=>{const f=document.querySelector('iframe');const nodes=[...f.contentDocument.querySelectorAll('[id]')];const el=nodes.find(e=>[...e.childNodes].some(n=>n.nodeType===3 && n.textContent.includes('把视频')));if(!el)throw new Error('Title not found');return {id:el.id,text:el.textContent,html:el.outerHTML.slice(0,500)};});
 console.log('Editable target',target);
 const edits=[...original,{at:'#'+target.id,t:[70,20],style:{color:'#c02828'},text:'Studio 接入验证'}];
 await api(base+'/edit','POST',{base:state.rev,ops:[{op:'set',clip:'title',field:'overrides',value:edits}]});
 state=await api(base);assert.ok(state.text.includes('Studio 接入验证'));
 await page.reload();await page.waitForFunction(()=>!!window.film);
 for(const t of [1,3,0.8,1])await page.evaluate(async t=>{await window.film.ready;await window.film.frame(t);},t);
 const result=await page.evaluate(id=>{const el=document.querySelector('iframe').contentDocument.getElementById(id);return {text:el.textContent,translate:el.style.translate,color:getComputedStyle(el).color};},target.id);
 assert.ok(result.text.includes('Studio 接入验证'));assert.equal(result.translate,'70px 20px');
 console.log('Persistence after reload and seeking',result);
 await page.screenshot({path:new URL('../verification/edited.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
 // Full editor boots, not only the bare film viewer.
 const ui=await browser.newPage({viewport:{width:1440,height:1000}});ui.on('pageerror',e=>errors.push(e.message));
 await ui.goto(s.url);await ui.waitForSelector('iframe',{timeout:60000});await ui.screenshot({path:new URL('../verification/studio.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
 console.log('Studio UI mounted',await ui.title());
 const {export:job}=await api(base+'/exports','POST',{kind:'video',codec:'h264',fps:30,shortEdge:360,range:[0.6,1.2],audio:false,hardware:false,name:'Adapter-edited-smoke'});
 let done;
 for(let i=0;i<180;i++){const list=await api(base+'/exports');done=list.exports.find(x=>x.id===job.id);if(['done','failed','cancelled'].includes(done?.status))break;await new Promise(r=>setTimeout(r,1000));}
 assert.equal(done?.status,'done',JSON.stringify(done));console.log('Export completed',JSON.stringify(done.outputs));
 assert.deepEqual(errors,[]);
 await writeFile(new URL('../verification/results.json',import.meta.url),JSON.stringify({target,result,export:done,errors},null,2));
}finally{
 if(original){const now=await api(base);await api(base+'/edit','POST',{base:now.rev,ops:[{op:'set',clip:'title',field:'overrides',value:original}]});}
 await browser.close();
}
console.log('PASS: frame commits, saved overrides, reload, seeking, complete Studio UI and video export.');
