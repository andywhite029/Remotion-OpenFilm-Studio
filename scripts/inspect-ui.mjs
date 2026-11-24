import {readFile} from 'node:fs/promises';import {chromium} from 'playwright-core';
const s=JSON.parse(await readFile(new URL('../.studio/session.json',import.meta.url),'utf8'));
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1600,height:1100}});await p.goto(s.url);await p.waitForSelector('iframe');
await p.waitForFunction(()=>{const f=document.querySelector('iframe');return f?.src && f.src.includes('film.html')});await p.waitForFunction(()=>!document.body.innerText.includes('正在绘制第一帧'),{timeout:60000});
console.log((await p.locator('button').evaluateAll(es=>es.map(e=>({text:e.textContent,title:e.title,aria:e.getAttribute('aria-label')})))).slice(0,100));
console.log('FRAMES',p.frames().map(f=>f.url()));
console.log((await p.locator('body').innerText()).slice(0,9000));await b.close();
