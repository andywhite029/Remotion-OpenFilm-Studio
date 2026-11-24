import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {chromium} from 'playwright-core';
const s=JSON.parse(await readFile(new URL('../.studio/session.json',import.meta.url),'utf8'));const headers={'x-studio-key':s.key,'content-type':'application/json'};const endpoint=s.origin+`/api/projects/${s.project.id}`;
async function api(suffix='',body){const r=await fetch(endpoint+suffix,{headers,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok)throw Error(JSON.stringify(j));return j;}
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1600,height:1100}});const initial=await api();
try{
 await p.goto(s.url);await p.waitForFunction(()=>{const f=document.querySelector('iframe');return f?.src.includes('film.html')});
 await p.waitForFunction(()=>!document.body.innerText.includes('正在绘制第一帧'));
 await p.evaluate(()=>{const f=document.querySelector('iframe');f.contentWindow.postMessage({source:'openfilm-studio',type:'seek',t:1,seq:9001},new URL(f.src).origin);});
 await p.waitForFunction(()=>{const f=document.querySelector('iframe');return !!f});
 await p.getByRole('button',{name:'显示图层',exact:true}).click();
 const scene=await (async()=>{for(let i=0;i<100;i++){const f=p.frames().find(f=>f.url().includes('scenes/title.html'));if(f&&await f.locator('[id]').count()>10)return f;await new Promise(r=>setTimeout(r,50));}})();assert.ok(scene);
 const el=scene.locator('[id]').filter({hasText:'把视频'});const id=await scene.evaluate(()=>[...document.querySelectorAll('[id]')].find(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.includes('把视频'))).id);
 const box=await scene.locator('#'+id).boundingBox();assert.ok(box);
 const x=box.x+box.width*0.25,y=box.y+box.height*0.35;
 await p.mouse.click(x,y);await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+55,y+25,{steps:10});await p.mouse.up();
 let saved;for(let i=0;i<30;i++){saved=await api();if(saved.text!==initial.text)break;await new Promise(r=>setTimeout(r,100));}
 assert.notEqual(saved.text,initial.text,'Mouse drag did not persist');
 const clip=saved.value.tracks.flatMap(t=>t.clips).find(c=>c.id==='title');assert.ok(clip.overrides.some(o=>o.t&&o.t.some(v=>v!==0)));
 await p.screenshot({path:new URL('../verification/studio-dragged.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
 await writeFile(new URL('../verification/ui-drag.json',import.meta.url),JSON.stringify({id,overrides:clip.overrides},null,2));console.log('PASS actual Studio pointer selection/drag/save',clip.overrides);
 // Exercise timeline movement with magnetic packing off, then restore source timing.
 const magnetic=p.getByRole('button',{name:/主轨磁吸/});await magnetic.click();
 const block=p.locator('div[title="end"]').first();const cb=await block.boundingBox();assert.ok(cb);
 await p.mouse.move(cb.x+cb.width/2,cb.y+12);await p.mouse.down();await p.mouse.move(cb.x+cb.width/2+70,cb.y+12,{steps:12});await p.mouse.up();
 let moved;for(let i=0;i<30;i++){moved=await api();if(moved.value.tracks.flatMap(t=>t.clips).find(c=>c.id==='end').at!==13.2)break;await new Promise(r=>setTimeout(r,100));}
 const end=moved.value.tracks.flatMap(t=>t.clips).find(c=>c.id==='end');assert.notEqual(end.at,13.2);console.log('PASS timeline mouse move',end.at);
 await api('/edit',{base:moved.rev,ops:[{op:'set',clip:'end',field:'at',value:13.2}]});
}finally{const now=await api();const ops=initial.value.tracks.flatMap(t=>t.clips).map(c=>({op:'set',clip:c.id,field:'overrides',value:c.overrides||[]}));await api('/edit',{base:now.rev,ops});await b.close();}
