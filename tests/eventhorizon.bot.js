const fs=require("fs"),os=require("os"),path=require("path");
// Event Horizon full run: node tests/eventhorizon.bot.js [fps list e.g. [30,60,144]] [index.html] [rel=0.35] [T=0.45]
// A scripted hero hops every required jump (teleport to a takeoff spot on the platform, hold Right+Space for T seconds), uses the real doors, waits for
// the Tug room's gate, and must end with playSessionEnded === "win" and all 3 lives. Manual 1/fps ticks, requestAnimationFrame off.
const {chromium}=require("/opt/node22/lib/node_modules/playwright");
const file=process.argv[3]||path.join(__dirname,"..","index.html");
const src=fs.readFileSync(file,"utf8");
const anchor='if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const tmp=path.join(os.tmpdir(),"eh_bot2.html");
fs.writeFileSync(tmp,src.replace(anchor,anchor+`window.__ev=f=>eval("("+f+")");`));
(async()=>{
const fpsList=JSON.parse(process.argv[2]||"[60]");const REL=+(process.argv[4]||0.35),TT=+(process.argv[5]||0.45);
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
for(const FPS of fpsList){
const pg=await b.newPage();const errs=[];pg.on("pageerror",e=>errs.push(String(e)));pg.on("dialog",d=>d.accept());
await pg.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
await pg.goto("file://"+tmp+"#t");await pg.waitForFunction(()=>window.__ev);
const res=await pg.evaluate(([FPS,REL,TT])=>window.__ev(`()=>{
 const FPS=${FPS},REL=${REL},TT=${TT};const dt=1/FPS;
 loadExampleGame(SAMPLE_GAMES.find(s=>s.id==="event-horizon").builder,"x");
 enterPlayMode();playReadyUntil=null;roomTransition=null;
 const P=()=>actors.find(a=>a.isPlayer);
 let frames=0;const out=[];
 const secs=s=>Math.round(s*FPS);
 const tk=(n)=>{for(let i=0;i<n;i++){roomTransition=null;playReadyUntil=null;tick(dt);frames++;if(playSessionEnded)return;}};
 const off=()=>{for(const q of Object.keys(keys))keys[q]=false;};
 const settle=()=>{off();for(let i=0;i<secs(2.5);i++){tk(1);if(P().grounded&&Math.abs(P().vx)<3&&Math.abs(P().vy)<3&&i>3)break;}};
 const here=()=>{const p=P();return currentRoomId+":"+(p.x/32).toFixed(1)+","+(p.y/32).toFixed(1);};
 const room0=()=>currentRoomId;
 const toDoor=(xt,max)=>{const r0=currentRoomId;const up=gravityDir==="up";keys.ArrowRight=true;for(let i=0;i<secs(max);i++){tk(1);if(playSessionEnded||currentRoomId!==r0)break;}off();for(let i=0;i<secs(0.4);i++)tk(1);};
 const hopAt=(cx,A,B,T,label,crateTop)=>{const p=P();const up=gravityDir==="up";
   p.x=cx-p.w/2;p.y=up?(A[2]+1)*32+0.01:A[2]*32-p.h-0.01;p.vx=0;p.vy=0;p.grounded=true;
   keys.ArrowRight=true;keys[" "]=true;let ok=false;
   for(let i=0;i<secs(1.6);i++){tk(1);if(i/FPS>=T)keys.ArrowRight=false;if(i/FPS>=0.3)keys[" "]=false;if(i>5&&P().grounded)break;}
   off();const q=P();const feet=up?q.y:q.y+q.h;const bx=q.x+q.w/2;
   const ty=up?(B[2]+1)*32:B[2]*32;
   ok=Math.abs(feet-ty)<2.5&&bx>=B[0]*32&&bx<=(B[1]+1)*32;
   out.push([label,ok?"ok":"MISS "+here(),lives]);return ok;};
 const hop=(A,B,rel,T,label)=>{const up=gravityDir==="up";const w=(A[1]-A[0]+1)*32;return hopAt(up?(A[0]*32+w*(1-rel)):(A[0]*32+w*rel),A,B,T,label);};
 const climb=(pl,tag,rot)=>{for(let i=0;i<pl.length-1;i++){const A=rot?rot(pl[i]):pl[i],B=rot?rot(pl[i+1]):pl[i+1];hop(A,B,REL,TT,tag+i);}};
 const stairs=[[0,2,15],[3,5,13],[6,8,11],[9,11,9],[12,14,7]];
 const R=a=>[23-a[1],23-a[0],17-a[2]];
 settle();
 climb(stairs,"r1.");toDoor(0,8);out.push(["->room",currentRoomId,""]);
 // room 2: swing, then two steps
 settle();keys.ArrowRight=true;for(let i=0;i<secs(1.3);i++)tk(1);off();settle();out.push(["r2 swing lands "+here(),"",lives]);
 hop([9,16,15],[17,19,13],0.85,0.3,"r2.a");hop([17,19,13],[20,23,11],REL,TT,"r2.b");toDoor(0,6);out.push(["->room",currentRoomId,""]);
 // room 3
 settle();
 hopAt(1.2*32,[0,11,17],[2,4,15],0.4,"r3.floor>S1");hop([2,4,15],[5,7,13],REL,TT,"r3.S1>S2");hop([5,7,13],[8,23,11],REL,TT,"r3.S2>A");
 off();let waited=0;while(!isChannelOn("red")&&waited<secs(12)){tk(1);waited++;}
 out.push(["r3 gate open after "+(waited/FPS).toFixed(1)+"s more",isChannelOn("red"),lives]);
 toDoor(0,12);out.push(["->room",currentRoomId,""]);
 // room 4
 settle();climb(stairs,"r4.");toDoor(0,8);out.push(["->room",currentRoomId,""]);
 // room 5 (turned)
 settle();climb(stairs,"r5.",R);
 keys.ArrowRight=true;for(let i=0;i<secs(10);i++){tk(1);if(playSessionEnded)break;}off();
 out.push(["end "+playSessionEnded+" "+here(),"",lives]);
 return {out,frames,lives};}`)(),[FPS,REL,TT]).catch(e=>({err:String(e)}));
console.log("fps",FPS,JSON.stringify(res));console.log(errs.join("|"));await pg.close();}
await b.close();})();
