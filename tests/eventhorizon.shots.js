// Event Horizon: coverage + a screenshot of each room at 1366x635 and 1920x1080 into prototypes/eventhorizon-shots (node tests/eventhorizon.shots.js)
const fs=require("fs"),os=require("os"),path=require("path");
const {chromium}=require("/opt/node22/lib/node_modules/playwright");
const src=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const anchor='if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const tmp=path.join(os.tmpdir(),"eh_sh.html");fs.writeFileSync(tmp,src.replace(anchor,anchor+`window.__ev=f=>eval("("+f+")");`));
const out=path.join(__dirname,"..","prototypes","eventhorizon-shots");
(async()=>{const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
const pg=await b.newPage({viewport:{width:1366,height:768}});const errs=[];pg.on("pageerror",e=>errs.push(String(e)));pg.on("dialog",d=>d.accept());
await pg.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
await pg.goto("file://"+tmp+"#t");await pg.waitForFunction(()=>window.__ev);
const R=(c,a)=>pg.evaluate(([c,a])=>window.__ev(c)(a),[c,a]);
for(const [w,h] of [[1366,635],[1920,1080]]){await pg.setViewportSize({width:w,height:h});
 for(let ri=0;ri<5;ri++){
  const r=await R(`(ri)=>{loadExampleGame(SAMPLE_GAMES.find(s=>s.id==="event-horizon").builder,"x");activateRoom(rooms[ri].id);
   let empty=0,miss=0;for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const bg=backgroundBoard[y][x],sk=groundSkinBoard[y][x];if(!bg&&!sk)empty++;if(bg&&!backgroundTileDefs[bg])miss++;if(sk&&!groundTileDefs[sk])miss++;}
   return {name:rooms[ri].name,empty,miss,actors:actors.length,rooms:rooms.length,gdir:gravityDir};}`,ri);
  console.log(w,h,JSON.stringify(r));
  await R(`()=>{fitCanvasAndAlign();renderGame();return 1}`);await pg.waitForTimeout(150);await R(`()=>{renderGame();return 1}`);
  await (await pg.$("#gameCanvas")).screenshot({path:`${out}/room${ri+1}-${w}x${h}.png`});
  const sc=await pg.evaluate(()=>({sx:document.documentElement.scrollHeight>innerHeight,r:document.getElementById("gameCanvas").getBoundingClientRect().toJSON()}));
  if(ri==0)console.log("scroll?",sc.sx,Math.round(sc.r.width),Math.round(sc.r.height),Math.round(sc.r.bottom));}}
console.log("errors",errs);await b.close();})();
