// In-app confirm dialogs + Undo really restores what a replacement/clear/delete removed. node tests/dialogs.test.js
const fs=require("fs");const {chromium}=require("/opt/node22/lib/node_modules/playwright");
const A='if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
fs.writeFileSync("/tmp/undo_h2.html",fs.readFileSync(require("path").join(__dirname,"..","index.html"),"utf8").replace(A,A+'window.__ev=f=>eval("("+f+")");\n'));
(async()=>{const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});const p=await b.newPage({viewport:{width:1366,height:768}});let native=0;p.on("dialog",d=>{native++;d.accept()});const errs=[];p.on("pageerror",e=>errs.push(e.message));
await p.goto("file:///tmp/undo_h2.html#t");
const ev=(f,a)=>p.evaluate(([f,a])=>window.__ev(f)(a),[f.toString(),a]);
const st=()=>ev(()=>({undo:!document.getElementById("undoBtn").disabled,tiles:rooms.map(r=>(r.id===currentRoomId?board:r.board).flat().filter(Boolean).length),names:rooms.map(r=>r.name).join("|")}));
let ok=0,bad=0;const chk=(c,m)=>{console.log((c?"ok   ":"FAIL ")+m);c?ok++:bad++;};
// start from a recognisable project: 2 rooms
await ev(()=>{const s=SAMPLE_GAMES.find(s=>s.id==="cloud-hopper");loadExampleGame(s.builder,s.name,{skipConfirm:true});pushUndoSnapshot();board[1][1]="solid:none";});
const base=await st();
// sample via UI
await ev(()=>{const s=SAMPLE_GAMES.find(s=>s.id==="stonekeepers-vault");loadExampleGame(s.builder,s.name);});
chk(await p.isVisible("#askOverlay"),"asking uses the in-app dialog");
chk(/Undo/.test(await p.textContent("#askBody")),"text promises Undo: "+await p.textContent("#askBody"));
await p.click("#askNo");chk((await st()).names===base.names,"Keep mine changes nothing");
await ev(()=>{const s=SAMPLE_GAMES.find(s=>s.id==="stonekeepers-vault");loadExampleGame(s.builder,s.name);});
await p.click("#askYes");const after=await st();chk(after.names!==base.names,"sample opened: "+after.names);
await ev(()=>{document.getElementById("undoBtn").click();});
const un=await st();chk(JSON.stringify(un)===JSON.stringify(base),"Undo brings back the exact project (tiles "+un.tiles+" vs "+base.tiles+")");
await ev(()=>{document.getElementById("redoBtn").click();});chk((await st()).names===after.names,"Redo goes forward again");
await ev(()=>{document.getElementById("undoBtn").click();});
// New project
await ev(()=>{document.getElementById("newProjectBtn").click();});await p.click("#askYes");
await ev(()=>{document.getElementById("undoBtn").click();document.getElementById("undoBtn").click();});
chk(JSON.stringify(await st())===JSON.stringify(base),"New project: two Undos (starter board, then project) restore it");
// clear everything
await ev(()=>{document.getElementById("clearAllBtn").click();});chk(await p.isVisible("#askOverlay"),"clear asks in-app");await p.keyboard.press("Escape");chk(!(await p.isVisible("#askOverlay"))&&JSON.stringify(await st())===JSON.stringify(base),"Escape cancels");
await ev(()=>{document.getElementById("clearAllBtn").click();});await p.click("#askYes");chk((await st()).tiles.length===1,"cleared to one room");
await ev(()=>{document.getElementById("undoBtn").click();});chk(JSON.stringify(await st())===JSON.stringify(base),"Undo restores the cleared project");
// delete room
await ev(()=>{deleteRoom(rooms[1].id);});await p.click("#askYes");const d1=await st();chk(d1.tiles.length===base.tiles.length-1,"room deleted");
await ev(()=>{document.getElementById("undoBtn").click();});chk(JSON.stringify(await st())===JSON.stringify(base),"Undo restores a deleted room (it did not before)");
// load json file
const json=await ev(()=>JSON.stringify(wrapProjectSnapshot(captureProjectSnapshot())));
fs.writeFileSync("/tmp/p.json",json);
await ev(()=>{document.getElementById("clearAllBtn").click();});await p.click("#askYes");
const keep=await st();
await p.setInputFiles("#loadProjectInput","/tmp/p.json");await p.waitForSelector("#askOverlay.open",{timeout:3000}).catch(()=>{});
chk(await p.isVisible("#askOverlay"),"loading a file asks in-app");await p.click("#askYes");await p.waitForTimeout(200);
chk(JSON.stringify(await st())===JSON.stringify(base),"file loaded");
await ev(()=>{document.getElementById("undoBtn").click();});chk(JSON.stringify(await st())===JSON.stringify(keep),"Undo goes back to what was there before the file");
chk(native===0,"no native dialog appeared ("+native+")");chk(errs.length===0,"no page errors "+errs.slice(0,2));
console.log(bad?"FAILED":"ALL PASSED");await b.close();process.exit(bad?1:0);})();
