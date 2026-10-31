const fs=require("fs"),os=require("os"),path=require("path");
// Event Horizon hop windows: node tests/eventhorizon.hops.js '[roomIndex,[[A,B,dir,label],...],fps,layout,warmSeconds]' (A,B = [col0,col1,row]); DBG env = one trial.
// Prints, per hold time 0.10..0.80 s, how many of 5 takeoff positions on A land on B, and the longest run of hold times with >=4/5.
const {chromium}=require("/opt/node22/lib/node_modules/playwright");
const src=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const anchor='if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const tmp=path.join(os.tmpdir(),"eh_hp.html");
fs.writeFileSync(tmp,src.replace(anchor,anchor+`window.__ev=f=>eval("("+f+")");`));
(async()=>{
const [ri,hops,fps,lay,warm]=JSON.parse(process.argv[2]);
const FPS=fps||60;
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
const pg=await b.newPage();const errs=[];pg.on("pageerror",e=>errs.push(String(e)));pg.on("dialog",d=>d.accept());
await pg.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
await pg.goto("file://"+tmp+"#t");await pg.waitForFunction(()=>window.__ev);
const R=(c,a)=>pg.evaluate(([c,a])=>window.__ev(c)(a),[c,a]);
await R(`([ri,LAY,FPS,WARM])=>{loadExampleGame(SAMPLE_GAMES.find(s=>s.id==="event-horizon").builder,"x");activateRoom(rooms[ri].id);removeAllPlayerInstances();selectedActorDefId=playerDefId;paintMode="actor";placeNewActor(2*32,2*32);
 if(LAY){for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)board[y][x]=null;for(const [x0,x1,y] of LAY.p)for(let x=x0;x<=x1;x++)board[y][x]=gameplayKey('solid','none');for(const [x,y] of LAY.h)board[y][x]=gameplayKey('gravitywell','none');}
 enterPlayMode();playReadyUntil=null;roomTransition=null;
 if(WARM){const P0=actors.find(a=>a.isPlayer);P0.x=9*32;P0.y=10*32-5;for(let i=0;i<WARM*FPS;i++){roomTransition=null;playReadyUntil=null;tick(1/FPS);}}
 scheduleLevelRetry=function(){};
 window.keysOff=()=>{for(const k of Object.keys(keys))keys[k]=false;};
 const RID=rooms[ri].id;
 window.trial=(A,B,opt)=>{if(currentRoomId!==RID||!actors.find(a=>a.isPlayer)){activateRoom(RID);removeAllPlayerInstances();selectedActorDefId=playerDefId;paintMode="actor";placeNewActor(64,64);}const P=actors.find(a=>a.isPlayer);keysOff();if(typeof gameTimers!=="undefined"&&gameTimers.length)gameTimers.length=0;levelResetPending=false;P.vortexHidden=false;P.hazardCooldown=0;playSessionEnded=null;
  const up=gravityDir==="up";
  P.vx=0;P.vy=0;P.x=opt.x-P.w/2;P.y=up?(A[2]+1)*TILE+0.01:A[2]*TILE-P.h-0.01;P.grounded=true;
  const key=(opt.dir*(up?-1:1))>0?"ArrowRight":"ArrowLeft";keys[key]=true;keys[" "]=true;let land=null,cap=false;
  const dt=1/FPS;
  for(let i=0;i<FPS*4;i++){roomTransition=null;playReadyUntil=null;
   if(i*dt>=opt.T)keys[key]=false; if(i*dt>=opt.J)keys[" "]=false;
   tick(dt);
   if(levelResetPending||P.vortexHidden){cap=true;break;}
   if(P.grounded&&i>5){const cx=P.x+P.w/2;const feet=up?P.y:P.y+P.h;
     const ty=(r)=>up?(r+1)*TILE:r*TILE;
     if(cx>=B[0]*TILE&&cx<=(B[1]+1)*TILE&&Math.abs(feet-ty(B[2]))<2){land="B";break;}
     if(Math.abs(feet-ty(A[2]))<2&&cx>=A[0]*TILE&&cx<=(A[1]+1)*TILE&&i*dt>0.7){land="A";break;}
     land="other";break;}
  }keysOff();return cap?"cap":(land||"air");};
 return 1;}`,[ri,lay||null,FPS,warm||0]);
if(process.env.DBG){const o=JSON.parse(process.env.DBG);console.log(JSON.stringify(await R(`(o)=>{const A=o.A,B=o.B;const r=trial(A,B,o);const P=actors.find(a=>a.isPlayer);return [r,+(P.x/32).toFixed(2),+(P.y/32).toFixed(2),P.grounded,actors.filter(a=>!a.isPlayer).slice(0,3).map(a=>[+(a.x/32).toFixed(2),+(a.y/32).toFixed(2)])]}`,o)));}
for(const [A,B,dir,label] of hops){
 const w=(A[1]-A[0]+1)*32;const Ts=[];for(let t=0.1;t<=0.8;t+=0.05)Ts.push(+t.toFixed(2));const row=[];
 for(const T of Ts){let ok=0;for(let xi=0;xi<5;xi++){const x=A[0]*32+10+(w-20)*xi/4;
  const r=await R(`(o)=>trial(${JSON.stringify(A)},${JSON.stringify(B)},o)`,{x,T,J:0.3,dir});if(r==="B")ok++;}row.push(ok);}
 let best=0,cur=0;for(const k of row){if(k>=4){cur++;best=Math.max(best,cur);}else cur=0;}
 console.log(label.padEnd(10),row.join(""),"window",(best*0.05).toFixed(2)+"s");
 if(process.env.ST)console.log(JSON.stringify(await R(`()=>{const P=actors.find(a=>a.isPlayer);return [currentRoomId,lives,playSessionEnded,levelResetPending,+(P.x/32).toFixed(1),+(P.y/32).toFixed(1),appMode,gamePaused]}`)));}
console.log(errs.join("|"));await b.close();})();
