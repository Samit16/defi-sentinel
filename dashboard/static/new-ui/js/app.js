import { uploadView, configureView, runningView, reportView, historyView, rolesForProtocol } from "./views.js";
import { runFakeScan, saveReport, getReportById } from "./mock-api.js";
import { initGlass, setGlassScreen } from "./glass.js";

const root = document.querySelector("#app");
const state = {
  fileName: "", source: "", uploadValid: false, protocol: "", roleMap: {},
  constructorArgs: "", holds: { ETH: true, TOKEN: false }, report: null,
  runRows: null, overallProgress: 0, controller: null, runPromise: null
};
window.appState = state;
const ROUTES = ["upload","configure","running","report"];
let toastTimer;

function routeName() {
  const raw = location.hash.replace(/^#\/?/,"").split("?")[0];
  return ["upload","configure","running","report","history"].includes(raw) ? raw : "upload";
}
function syncNav(route) {
  document.querySelectorAll("[data-step]").forEach(link=>{
    const step = link.dataset.step;
    link.classList.toggle("active", step===route);
    link.classList.toggle("done", ROUTES.indexOf(step)>=0 && ROUTES.indexOf(step)<ROUTES.indexOf(route));
    if (step===route) link.setAttribute("aria-current","step"); else link.removeAttribute("aria-current");
  });
}
function showToast(message) {
  let node=document.querySelector(".toast");
  if (!node) { node=document.createElement("div"); node.className="toast"; node.setAttribute("role","status"); document.body.append(node); }
  node.textContent=message; node.classList.add("is-visible"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>node.classList.remove("is-visible"),2200);
}
async function render({transition=false}={}) {
  const route=routeName();
  syncNav(route);
  if (transition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("is-transitioning");
    setTimeout(async ()=>{await draw(route);root.classList.remove("is-transitioning")},140);
  } else await draw(route);
  setGlassScreen(route,state);
}
async function draw(route) {
  const views={upload:()=>uploadView(state),configure:()=>configureView(state),running:()=>runningView(state),report:()=>reportView(state.report),history:()=>historyView()};
  root.innerHTML=await views[route]();
  bindRoute(route);
}
function errorsForUpload(name, source) {
  const errors=[];
  if (!name.toLowerCase().endsWith(".sol")) errors.push("File name must end in .sol.");
  if (!source.trim()) errors.push("Source is empty. Select a file or paste Solidity code.");
  if (new TextEncoder().encode(source).length >= 100*1024) errors.push("Source must be smaller than 100 KB.");
  return errors;
}
function validateUpload() {
  const name=document.querySelector("#sourceName")?.value ?? state.fileName ?? "PastedContract.sol";
  const source=document.querySelector("#sourceCode")?.value ?? state.source;
  state.fileName=name.trim(); state.source=source; const errors=errorsForUpload(state.fileName,state.source);
  state.uploadValid=errors.length===0;
  const list=document.querySelector("#uploadErrors");
  if(list){list.innerHTML=errors.map(e=>`<li>${e}</li>`).join("");list.classList.toggle("is-visible",errors.length>0);}
  const button=document.querySelector("#continueUpload"); if(button)button.disabled=!state.uploadValid;
  const bytes=new TextEncoder().encode(state.source).length;
  const meta=document.querySelector("#fileMetaName");if(meta)meta.innerHTML=`<strong>${escapeHtml(state.fileName||"No source selected")}</strong>`;
  const size=document.querySelector("#fileMetaSize");if(size)size.textContent=`${bytes.toLocaleString()} B`;
  const preview=document.querySelector("#codePreview");if(preview){const shown=state.source.split("\n").slice(0,7).map((line,i)=>`${String(i+1).padStart(2,"0")}  ${line}`).join("\n");preview.textContent=shown||"Preview appears when source is entered.";preview.classList.toggle("is-visible",!!state.source);}
}
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function loadFile(file) {
  if (!file) return;
  state.fileName=file.name; state.source=""; validateUpload();
  if (file.size>100*1024) { state.source=""; validateUpload(); return; }
  try { state.source=await file.text(); }
  catch { state.source=""; showToast("The selected file could not be read."); }
  const name=document.querySelector("#sourceName"); if(name)name.value=state.fileName;
  const source=document.querySelector("#sourceCode");if(source)source.value=state.source;
  validateUpload();
}
function bindUpload() {
  const input=document.querySelector("#fileInput"), zone=document.querySelector("#dropzone");
  input?.addEventListener("change",e=>loadFile(e.target.files?.[0]));
  ["dragenter","dragover"].forEach(type=>zone?.addEventListener(type,e=>{e.preventDefault();zone.classList.add("is-dragging")}));
  ["dragleave","drop"].forEach(type=>zone?.addEventListener(type,e=>{e.preventDefault();zone.classList.remove("is-dragging")}));
  zone?.addEventListener("drop",e=>{const files=[...(e.dataTransfer?.files||[])]; if(files.length!==1){showToast("Choose one .sol file at a time.");return;} loadFile(files[0]);});
  document.querySelector("#sourceName")?.addEventListener("input",validateUpload);
  document.querySelector("#sourceCode")?.addEventListener("input",validateUpload);
  document.querySelector("#uploadForm")?.addEventListener("submit",e=>{e.preventDefault();validateUpload();if(!state.uploadValid)return;state.protocol="";state.roleMap={};location.hash="/configure";});
}
function bindConfigure() {
  document.querySelectorAll("[data-protocol]").forEach(button=>button.addEventListener("click",()=>{state.protocol=button.dataset.protocol;state.roleMap={};state.constructorArgs=document.querySelector("#constructorArgs")?.value||"";render();}));
  document.querySelectorAll(".role-select").forEach(select=>select.addEventListener("change",()=>{state.roleMap[select.dataset.role]=select.value;render();}));
  document.querySelector("#constructorArgs")?.addEventListener("input",e=>state.constructorArgs=e.target.value);
  document.querySelectorAll("[data-holds]").forEach(button=>button.addEventListener("click",()=>{const key=button.dataset.holds;state.holds[key]=!state.holds[key];button.setAttribute("aria-pressed",String(state.holds[key]));}));
  document.querySelector("#runSimulation")?.addEventListener("click",()=>{if(!state.protocol)return;const roles=rolesForProtocol(state.protocol);if(roles.some(role=>!state.roleMap[role]))return;location.hash="/running";});
}
function updateRunUI(snapshot) {
  state.runRows=snapshot.rows;state.overallProgress=snapshot.overall;
  snapshot.rows.forEach((row,i)=>{
    const node=document.querySelector(`[data-attack="${i}"]`);if(!node)return;
    node.dataset.state=row.state.toLowerCase();node.querySelector(".state-label").textContent=row.state;
    node.querySelector(".progress-bar").style.width=`${Math.round(row.progress)}%`;
    const track=node.querySelector(".progress-track");track.setAttribute("aria-valuenow",String(Math.round(row.progress)));
    node.querySelector(".elapsed").textContent=`${Number(row.elapsed_s||0).toFixed(1)} S`;
  });
  const p=document.querySelector("#overallProgress");if(p)p.textContent=String(snapshot.overall);
  const t=document.querySelector("#overallElapsed");if(t)t.textContent=Number(snapshot.elapsed_s||0).toFixed(1);
  window.dispatchEvent(new CustomEvent("defisentinel:progress",{detail:snapshot.overall}));
}
function startSimulation() {
  if(state.runPromise)return;
  const controller=new AbortController();state.controller=controller;
  state.runRows=null;state.overallProgress=0;
  state.runPromise=runFakeScan({target:state.fileName||"PastedContract.sol",protocol:state.protocol,onUpdate:updateRunUI,signal:controller.signal})
    .then(report=>{state.report=report;saveReport(report);state.runRows=null;state.overallProgress=0;state.runPromise=null;state.controller=null;if(routeName()==="running")location.hash="/report";})
    .catch(error=>{state.runPromise=null;state.controller=null;state.runRows=null;state.overallProgress=0;if(error.name==="AbortError"){state.report=null;if(routeName()==="running")location.hash="/configure";}else{console.error(error);showToast("The local simulation could not finish.");}});
}
function bindRunning() {
  document.querySelector("#cancelRun")?.addEventListener("click",()=>{state.controller?.abort();state.controller=null;showToast("Simulation cancelled. No chain or contract was touched.");});
  if(!state.runPromise)startSimulation();
}
function bindReport() {
  document.querySelector("#runAgain")?.addEventListener("click",()=>{state.runRows=null;state.report=null;location.hash="/configure";});
  document.querySelector("#copyReport")?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(JSON.stringify(state.report,null,2));showToast("Report JSON copied.");}catch{const text=JSON.stringify(state.report,null,2);const area=document.createElement("textarea");area.value=text;document.body.append(area);area.select();document.execCommand("copy");area.remove();showToast("Report JSON copied.");}});
}
function bindHistory() {
  const open=row=>{const report=getReportById(row.dataset.reportId);if(!report)return;state.report=report;location.hash="/report";};
  document.querySelectorAll("[data-report-id]").forEach(row=>{row.addEventListener("click",()=>open(row));row.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open(row);}});});
}
function bindRoute(route) {
  if(route==="upload")bindUpload();
  if(route==="configure")bindConfigure();
  if(route==="running")bindRunning();
  if(route==="report")bindReport();
  if(route==="history")bindHistory();
}
window.addEventListener("hashchange",()=>render({transition:true}));
window.addEventListener("defisentinel:open-report",event=>{state.report=event.detail;location.hash="/report";});
initGlass();
if(!location.hash)location.hash="/upload";else render();
