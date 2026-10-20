// v2.53 follow-up repro (not deployed): chaser/wanderer walking into a crate or Large Stone; prints sound counts and positions over 10 s. node tests/entangle.js
const fs=require("fs"),path=require("path");const {chromium}=require("/opt/node22/lib/node_modules/playwright");
const src=fs.readFileSync("/home/user/ToyGameDesigner/index.html","utf8");
const anchor='if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const H=`window.__e=(()=>{const snd={};for(const k of Object.keys(sounds)){const f=sounds[k];sounds[k]=function(){snd[k]=(snd[k]||0)+1;return f.apply(this,arguments)}}
function room(){suppressHistory=true;restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT));suppressHistory=false;gravityEnabled=true;gravityDir="down";for(let x=0;x<24;x++)board[17][x]="solid:none";for(let y=0;y<18;y++){board[y][0]="solid:none";board[y][23]="solid:none"}actors.length=0;for(const k in snd)delete snd[k];}
const F=17*TILE-ACTOR_SIZE/2-1;
return {run(kind,npcKind,withWall){room();const defs={crate:PUSHABLE_DEF_ID,stone:LARGE_STONE_DEF_ID};
 const o=placeCarryableActor(defs[kind],10*TILE+16,F);o.spawnX=o.x;o.spawnY=o.y;
 if(withWall){const o2=placeCarryableActor(defs[kind],11*TILE+16,F);o2.spawnX=o2.x;}
 const n=placeCarryableActor(defaultDefIdForKind(npcKind),5*TILE+16,F);n.spawnX=n.x;n.spawnY=n.y;
 const P=placeCarryableActor(defaultDefIdForKind("wanderer"),1*TILE,F); P.isPlayer=false;
 // player far right so chaser heads right
 selectedActorDefId=playerDefId;placeNewActor(20*TILE,F);
 actors.find(a=>a.isPlayer).hazardCooldown=1e9;
 for(const k in snd)delete snd[k];
 const tr=[];for(let f=0;f<600;f++){tick(1/60);if(f%100==0)tr.push([Math.round(n.x),Math.round(o.x),Math.round(n.y)]);}
 return {snd:Object.assign({},snd),tr,n:[n.x,n.y,n.vx,n.vy],o:[o.x,o.y]};}}})();`;
(async()=>{const fsx=require("fs");fsx.writeFileSync("/tmp/ent.html",src.replace(anchor,anchor+H));
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
for(const [k,nk,w] of [["crate","chaser",0],["stone","chaser",0],["crate","wanderer",0],["stone","wanderer",0],["stone","chaser",1],["crate","chaser",1]]){
const p=await (await b.newContext()).newPage();p.on("dialog",d=>d.accept());await p.goto("file:///tmp/ent.html#t");await p.waitForFunction(()=>window.__e);
console.log(k,nk,w,JSON.stringify(await p.evaluate(a=>window.__e.run(...a),[k,nk,w])));await p.close();}
await b.close();})();
