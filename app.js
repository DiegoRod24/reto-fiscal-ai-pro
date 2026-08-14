
const Q = window.RETO_QUESTION_BANK || [];
const APP_VERSION="2.3.1";
const APP_BUILD="NOVA_ULTRA_HOTFIX_20260813";
const UpdateState={remote:null,available:false,checking:false,dismissed:false,progress:0};
const StudyToday={mode:"smart"};
const $ = s => document.querySelector(s);
const app = $("#app");
const portal = $("#portal");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const Store = {
  root:"rfsolo_",
  get(k,d=null){try{const x=localStorage.getItem(this.root+k);return x===null?d:JSON.parse(x)}catch{return d}},
  set(k,v){localStorage.setItem(this.root+k,JSON.stringify(v))},
  remove(k){localStorage.removeItem(this.root+k)}
};

const defaultPrefs = {voice:true,sfx:true,haptics:true,motion:true,coachStyle:"balanced",captions:true,recovery:true};
let user = migrateLegacyUser();

function freshData(){return {xp:0,coins:0,streak:1,lastStudy:null,total:0,correct:0,mastery:{},history:[],spaced:{},achievements:[],daily:{date:"",count:0},sessions:0,bestCombo:0,totalMinutes:0,lastBackup:null,lastSession:null}}
function migrateLegacyUser(){
  const current=Store.get("user",null); if(current)return current;
  try{
    const profiles=JSON.parse(localStorage.getItem("rf2_profiles")||"[]");
    const activeId=JSON.parse(localStorage.getItem("rf2_activeId")||"null");
    const old=profiles.find(x=>x.id===activeId)||profiles[0];
    if(old){const migrated={...old,callMe:old.callMe||(old.name||"").trim().split(/\s+/)[0],prefs:{...defaultPrefs,...(old.prefs||{})},data:{...freshData(),...(old.data||{})},storageMode:"local-only",migratedFrom:"v2"};Store.set("user",migrated);return migrated}
  }catch{}
  try{
    const old=JSON.parse(localStorage.getItem("rf_user")||"null"),d=JSON.parse(localStorage.getItem("rf_profile")||"null");
    if(old){const migrated={id:uid(),name:old.name||"Usuario",callMe:(old.name||"Usuario").trim().split(/\s+/)[0],goal:old.goal||10,examDate:"",prefs:{...defaultPrefs},data:{...freshData(),...(d||{})},storageMode:"local-only",migratedFrom:"v1"};Store.set("user",migrated);return migrated}
  }catch{}
  return null
}
let deferredPrompt = null;
let recognition = null;
let audioCtx = null;
let wakeLock = null;

const BankUI = {topic:"all", query:"", page:0, size:24};
const Tutor = {topic:"", q:null, awaiting:false, handsFree:false, transcript:"", lastSpeech:"", history:[]};

const S = {
  screen:user?"home":"onboarding",
  mode:null, queue:[], index:0, current:null, answered:false, timer:null, sec:0,
  correctSession:0, wrongSession:0, combo:0, maxCombo:0, wrongStreak:0, sessionStarted:0,
  interrupted:0, transcript:"", listening:false, paused:false
};

function uid(){return (crypto.randomUUID?.() || Math.random().toString(36).slice(2)+Date.now())}
function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function first(){return user?.callMe?.trim() || (user?.name||"").trim().split(/\s+/)[0] || "amiga"}

function showBootRecovery(error){
  try{
    const msg=String(error?.message||error||"Error inesperado");
    const target=document.querySelector("#app");
    if(!target)return;
    target.innerHTML=`<main class="shell"><section class="card pad-lg" style="max-width:780px;margin:8vh auto">
      <span class="pill">🛡️ MODO RECUPERACIÓN</span>
      <h1 style="margin-top:14px">Reto Fiscal detectó un problema al iniciar.</h1>
      <p class="muted">Tu progreso local sigue guardado. Esta pantalla evita que la aplicación vuelva a quedarse completamente vacía.</p>
      <div class="notice warn"><strong>Detalle:</strong><br><code style="word-break:break-word">${esc(msg)}</code></div>
      <div class="row" style="margin-top:16px">
        <button class="btn primary big" onclick="location.reload()">🔄 Recargar app</button>
        <button class="btn ghost big" onclick="safeBootHome()">🏠 Inicio seguro</button>
      </div>
      <p class="small muted" style="margin-top:16px">Versión ${APP_VERSION} · ${APP_BUILD}</p>
    </section></main>`;
  }catch{}
}
window.safeBootHome=()=>{
  try{
    S.screen=user?"home":"onboarding";
    render();
  }catch(e){
    showBootRecovery(e);
  }
};
window.addEventListener("error",e=>{
  console.error("RETO FISCAL ERROR",e.error||e.message);
  const a=document.querySelector("#app");
  if(a && !a.innerHTML.trim())showBootRecovery(e.error||e.message);
});
window.addEventListener("unhandledrejection",e=>{
  console.error("RETO FISCAL PROMISE ERROR",e.reason);
  const a=document.querySelector("#app");
  if(a && !a.innerHTML.trim())showBootRecovery(e.reason);
});
function prefs(){return {...defaultPrefs,...(user?.prefs||{})}}
function profileData(){ return user?.data || freshData(); }
function saveUser(){ if(!user)return; user.prefs={...defaultPrefs,...(user.prefs||{})}; user.data={...freshData(),...(user.data||{})}; Store.set("user",user); }
function setScene(scene){document.body.dataset.scene=scene; ambient.scene=scene}
function level(xp){return Math.floor((xp||0)/650)+1}
function nowDay(){return new Date().toISOString().slice(0,10)}
function updateStreak(){
  if(!user)return; const d=profileData(), today=nowDay();
  if(!d.lastStudy){d.lastStudy=today;d.streak=1}
  else if(d.lastStudy!==today){
    const a=new Date(d.lastStudy+"T00:00:00"), b=new Date(today+"T00:00:00"), diff=Math.round((b-a)/86400000);
    d.streak=diff===1?(d.streak||0)+1:1;d.lastStudy=today;
  }
  if(d.daily?.date!==today)d.daily={date:today,count:0};
  user.data=d;saveUser();
}
function coachTone(){
  const s=prefs().coachStyle;
  if(s==="strict")return {ok:"Eso es. Precisión primero.",bad:"No alcanza todavía. Vamos a corregirlo."};
  if(s==="competitive")return {ok:"¡Punto limpio! Mantén la racha.",bad:"Te ganó esta. La siguiente es tuya."};
  if(s==="calm")return {ok:"Muy bien. La idea quedó clara.",bad:"Esta necesita una vuelta más. Te la simplifico."};
  return {ok:"Muy bien. Captaste la idea.",bad:"Casi. Vamos a fijar el concepto clave."};
}
function speech(text){
  if(!prefs().voice || !("speechSynthesis" in window))return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text.replace(/[🔥⚡🎙️✅❌🏆👹]/g,""));
  u.lang="es-PE";u.rate=1.02;u.pitch=1.01; u.onstart=()=>{const bot=$("#coreBot");if(bot)bot.className="core-bot talking"};
  u.onend=()=>{const bot=$("#coreBot");if(bot&&bot.classList.contains("talking"))bot.className="core-bot idle"};
  speechSynthesis.speak(u);
}
function beep(kind="tap"){
  if(!prefs().sfx)return;
  try{
    audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination);
    const map={tap:[430,.05],ok:[720,.12],bad:[170,.15],tick:[520,.035],boss:[95,.24]};
    const [f,d]=map[kind]||map.tap;o.frequency.value=f;o.type=kind==="bad"?"sawtooth":"sine";
    g.gain.setValueAtTime(.05,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+d);
    o.start();o.stop(audioCtx.currentTime+d);
  }catch{}
}
function haptic(pattern=18){if(prefs().haptics && navigator.vibrate)navigator.vibrate(pattern)}
function toast(text){const e=document.createElement("div");e.className="toast";e.textContent=text;portal.appendChild(e);setTimeout(()=>e.remove(),1900)}
function confetti(){
  const c=document.createElement("div");c.className="confetti";
  for(let i=0;i<46;i++){const e=document.createElement("i");e.style.left=Math.random()*100+"%";e.style.animationDelay=(Math.random()*.3)+"s";e.style.transform=`rotate(${Math.random()*180}deg)`;c.appendChild(e)}
  portal.appendChild(c);setTimeout(()=>c.remove(),1800)
}
function mentor(text,mood="idle",speak=true){
  const b=$("#mentorBubble"),bot=$("#coreBot"),wave=$("#coachWave");
  if(b)b.textContent=text;if(bot)bot.className="core-bot "+mood;if(wave)wave.style.display=mood==="listening"?"flex":"none";
  if(speak)speech(text)
}
function transition(fn){
  if(document.startViewTransition && prefs().motion){document.startViewTransition(fn)}else fn()
}
function go(screen){stopTimer();transition(()=>{S.screen=screen;render();window.scrollTo({top:0,behavior:prefs().motion?"smooth":"auto"})})}
function sceneForMode(m){return m==="rapid"?"arena":m==="refute"?"debate":m==="explain"?"focus":m==="boss"?"boss":m==="exam"?"focus":"aurora"}

function backBar(label="Volver al inicio",target="home"){
  return `<div class="back-row"><button class="btn ghost back-btn" onclick="go('${target}')">← ${esc(label)}</button></div>`
}

function coachHTML(){
  return `<div class="coach-card">
    <div class="avatar-stage" aria-label="Mentor virtual">
      <div class="orbit a"></div><div class="orbit b"></div><div class="orbit c"></div>
      <div id="coreBot" class="core-bot idle">
        <div class="bot-head"><div class="bot-face"><span class="eye"></span><span class="eye"></span><span class="mouth"></span></div></div>
        <div class="bot-neck"></div><div class="bot-body"></div><div class="bot-core"></div>
      </div>
    </div>
    <div class="coach-bubble">
      <div id="coachWave" class="wave" style="display:none"><i></i><i></i><i></i><i></i><i></i></div>
      <div id="mentorBubble">Tu mentor está listo.</div>
    </div>
  </div>`
}
function header(){
  if(!user)return "";
  const d=profileData();
  return `<div class="topbar">
    <div class="ultra-logo-shell"><img src="./brand-wordmark.svg" class="ultra-wordmark" alt="Reto Fiscal AI Pro"><span class="ultra-pro">ULTRA</span></div>
    <div class="nav-actions">
      <span class="pill live hide-phone">LOCAL SAFE</span><span class="pill">🔥 ${d.streak||1}</span><span class="pill hide-phone">⭐ ${d.xp||0} XP</span>
      <button class="btn icon ghost" onclick="openQuick()">⚙️</button>
    </div>
  </div>`
}
function nav(){
  if(!user||["quiz","onboarding"].includes(S.screen))return "";
  const items=[["home","🏠","Inicio"],["train","⚡","Entrenar"],["progress","📊","Progreso"],["bank","📚","Banco"],["profile","👤","Perfil"]];
  return `<button class="quick-nova-fab" onclick="startTutor()" title="Hablar con NOVA">🤖</button><div class="bottom-nav">${items.map(([s,i,t])=>`<button class="navbtn ${S.screen===s?"active":""}" onclick="go('${s}')"><b>${i}</b><span>${t}</span></button>`).join("")}</div>`
}
function layout(body){app.innerHTML=`<main class="shell">${header()}${body}</main>${nav()}`}

function render(){
  document.body.classList.toggle("reduced-motion",user?!prefs().motion:false);
  if(S.screen==="onboarding")return renderOnboarding();
  if(S.screen==="home")return renderHome();
  if(S.screen==="train")return renderTrain();
  if(S.screen==="quiz")return renderQuiz();
  if(S.screen==="study")return renderStudy();
  if(S.screen==="updates")return renderUpdates();
  if(S.screen==="progress")return renderProgress();
  if(S.screen==="bank")return renderBank();
  if(S.screen==="profile")return renderProfile();
}

function renderOnboarding(){
  setScene("aurora");
  app.innerHTML=`<main class="shell">
    <div class="topbar"><div class="ultra-logo-shell"><img src="./brand-wordmark.svg" class="ultra-wordmark" alt="Reto Fiscal AI Pro"><span class="ultra-pro">ULTRA</span></div><span class="pill live">SIN CUENTA · LOCAL</span></div>
    <section class="card auth-shell">
      <div class="auth-copy">
        <span class="pill" style="width:max-content">🧠 Configuración inicial</span>
        <h1>Tu entrenadora será <span class="gradient">solo para ti.</span></h1>
        <p class="lead">Sin login y sin nube. Configura cómo quieres que te llame, tu meta y el estilo del mentor. Después entrarás directamente cada vez.</p>
        <div class="notice" style="margin-top:18px">🔒 Tus avances quedan en este dispositivo. La app incluye respaldo y restauración para no depender de Supabase.</div>
      </div>
      <div class="auth-form">
        <h2>Empezamos</h2><p class="muted">Esta configuración se realiza una sola vez.</p>
        <div class="field"><label>Nombre y apellidos</label><input id="regName" placeholder="Ej. Andrea Rodríguez"></div>
        <div class="field"><label>¿Cómo quieres que te llame el mentor?</label><input id="regCall" placeholder="Ej. Andrea"></div>
        <div class="grid grid2">
          <div class="field"><label>Minutos por día</label><input id="regGoal" type="number" min="3" max="180" value="10"></div>
          <div class="field"><label>Estilo del mentor</label><select id="regStyle"><option value="balanced">Equilibrado</option><option value="competitive">Competitivo</option><option value="strict">Exigente</option><option value="calm">Tranquilo</option></select></div>
        </div>
        <div class="field"><label>Fecha objetivo / examen (opcional)</label><input id="regExam" type="date"></div>
        <button class="btn primary big full" onclick="createSoloProfile()">Crear mi experiencia →</button>
      </div>
    </section>
  </main>`
}
window.createSoloProfile=()=>{
  const name=$("#regName").value.trim();if(!name)return toast("Escribe el nombre");
  const call=$("#regCall").value.trim()||name.split(/\s+/)[0];
  user={id:uid(),name,callMe:call,goal:+$("#regGoal").value||10,examDate:$("#regExam").value||"",prefs:{...defaultPrefs,coachStyle:$("#regStyle").value},data:freshData(),createdAt:new Date().toISOString(),storageMode:"local-only"};
  saveUser();updateStreak();go("home")
}

function masteryRate(topic){
  const m=profileData().mastery[topic];return m?.attempts?Math.round(m.correct/m.attempts*100):null
}
function weakTopic(){
  const entries=Object.entries(profileData().mastery).filter(([,v])=>v.attempts>0);
  if(!entries.length)return null;entries.sort((a,b)=>(a[1].correct/a[1].attempts)-(b[1].correct/b[1].attempts));return entries[0][0]
}
function dueQuestions(){
  const d=profileData(),today=Date.now();return Q.filter(q=>!d.spaced[q.id] || (d.spaced[q.id].due||0)<=today)
}
function dailyPct(){const d=profileData();return Math.min(100,Math.round((d.daily?.count||0)/10*100))}

function examCountdown(){
  if(!user?.examDate)return "";
  const target=new Date(user.examDate+"T23:59:59");
  const days=Math.ceil((target-Date.now())/86400000);
  if(!Number.isFinite(days))return "";
  if(days<0)return `<span class="pill">📅 Fecha objetivo cumplida</span>`;
  if(days===0)return `<span class="pill">📅 Tu objetivo es hoy</span>`;
  return `<span class="pill">📅 ${days} día${days===1?"":"s"} para tu objetivo</span>`
}
function resumeState(){return Store.get("resume",null)}
function modeCard(icon,title,desc,mode,tag=""){
  const action=mode==="study"?"startTutor()":`startMode('${mode}')`;
  return `<button class="card mode-card" onclick="${action}">${tag?`<span class="tag">${tag}</span>`:""}<div class="mode-icon">${icon}</div><h3>${title}</h3><p>${desc}</p></button>`
}
function renderHome(){
  updateStreak();setScene("aurora");
  const d=profileData(),weak=weakTopic(),resume=resumeState();
  const updateBadge=UpdateState.available&&!UpdateState.dismissed?`<span class="pill"><span class="update-dot"></span> ${esc(UpdateState.remote?.latest||"Nueva")}</span>`:"";
  layout(`<section class="ultra-home">
    <div class="ultra-topbar">
      <div class="ultra-profile-strip"><span class="ultra-avatar">${esc(first()[0]?.toUpperCase()||"U")}</span><div><strong>${esc(first())}</strong><br><span class="small muted">Tu entrenamiento personal</span></div></div>
      <div class="row">${updateBadge}<button class="btn icon ghost ultra-bell" onclick="go('updates')">🔔</button></div>
    </div>

    <section class="ultra-hero">
      <div class="card ultra-hero-copy ultra-card-glow">
        <div class="eyebrow"><span class="pill live">NOVA ONLINE</span><span class="pill">Nivel ${level(d.xp)}</span><span class="pill">🔥 ${d.streak||1} días</span>${examCountdown()}</div>
        <h1 class="ultra-hero-title">Hola, ${esc(first())}.<br><span class="gradient">${weak?`Hoy vamos a dominar ${esc(weak)}.`:"¿Cómo estudiamos hoy?"}</span></h1>
        <p class="ultra-hero-sub">${weak?`Tu historial local detecta que <strong>${esc(weak)}</strong> merece prioridad. NOVA ajustará ritmo, preguntas y repaso automáticamente.`:"Elige cómo te sientes y NOVA ajustará la sesión: velocidad, dificultad, explicaciones y voz."}</p>

        <div class="study-intent-grid" style="margin-top:18px">
          ${studyIntent("⚡","Tengo 5 minutos","Rápido y directo","rapid")}
          ${studyIntent("🧠","Quiero estudiar bien","Profundidad y comprensión","smart")}
          ${studyIntent("🎧","Solo quiero escuchar","Audio + voz","audio")}
          ${studyIntent("😴","Estoy cansada","Suave y sin presión","recovery")}
          ${studyIntent("🔥","Quiero un reto","Difícil y con combos","boss")}
          ${studyIntent("📝","Examen pronto","Prioriza debilidades","exam")}
        </div>

        ${resume?`<div class="notice resume" style="margin-top:16px"><div class="spread row"><div><strong>▶ Tienes una sesión pendiente</strong><br><span class="small muted">Ibas por la pregunta ${resume.index+1} de ${resume.queue.length}.</span></div><button class="btn cyan" onclick="resumeSession()">Continuar</button></div></div>`:""}

        <div class="row" style="margin-top:18px">
          <button class="btn primary big" onclick="startTutor()">✨ Hablar con NOVA</button>
          <button class="btn ghost big" onclick="startMode('smart')">🧬 Entrenamiento inteligente</button>
        </div>
      </div>

      <div class="card ultra-nova-stage">
        <div class="ultra-nova-title"><strong>NOVA</strong><span>Tu asistente de estudio inteligente</span></div>
        ${coachHTML()}
        <div class="ultra-nova-actions">
          <button class="ultra-mini" onclick="startTutor()">🎙️ Hablar</button>
          <button class="ultra-mini" onclick="startMode('weak')">🎯 Mi punto débil</button>
          <button class="ultra-mini" onclick="go('progress')">📊 Mi progreso</button>
        </div>
      </div>
    </section>

    <div class="grid grid4">
      <div class="card stat"><span class="k">Progreso</span><strong>${d.total?Math.round(d.correct/d.total*100):0}%</strong><span class="small muted">precisión histórica</span></div>
      <div class="card stat"><span class="k">XP</span><strong>${d.xp||0}</strong><span class="small muted">nivel ${level(d.xp)}</span></div>
      <div class="card stat"><span class="k">Repasos</span><strong>${dueQuestions().length}</strong><span class="small muted">pendientes hoy</span></div>
      <div class="card stat"><span class="k">Banco</span><strong>${Q.length}</strong><span class="small muted">preguntas activas</span></div>
    </div>

    <div class="section-title"><div><h2>Acceso rápido</h2><p class="muted">Todo el estudio en un toque.</p></div><button class="btn ghost" onclick="go('train')">Ver todo →</button></div>
    <div class="ultra-dock">
      ${modeCard("✨","NOVA Study Lab","Estudia conversando.","study","VOZ")}
      ${modeCard("⚡","Ráfaga","10 preguntas rápidas.","rapid","12 s")}
      ${modeCard("🗣️","Refútame","Defiende tu idea.","refute")}
      ${modeCard("🌿","Recovery","Errores y memoria.","recovery")}
      ${modeCard("👹","Boss","Máxima dificultad.","boss")}
    </div>

    ${UpdateState.available&&!UpdateState.dismissed?updateBannerHTML():""}

    <div class="grid grid2">
      <div class="card pad"><div class="spread row"><div><h3>🎯 Foco recomendado</h3><p class="muted">${weak?`Conviene reforzar <strong>${esc(weak)}</strong>.`:"Completa una sesión y NOVA detectará tu área más débil."}</p></div><button class="btn" onclick="startMode('weak')">Practicar</button></div></div>
      <div class="card pad"><div class="spread row"><div><h3>🧬 Memoria espaciada</h3><p class="muted">${dueQuestions().length} preguntas están listas para reaparecer según tu memoria.</p></div><button class="btn" onclick="startMode('recovery')">Repasar</button></div></div>
    </div>
  </section>`);
  setTimeout(()=>mentor(weak?`${first()}, hoy quiero trabajar contigo ${weak}. ¿Empezamos hablando o prefieres un reto?`:`${first()}, dime cómo quieres estudiar hoy. Yo ajusto el resto.`,"idle",true),180)
}
function studyIntent(icon,title,desc,mode){
  return `<button class="study-intent" onclick="startTodayMode('${mode}')"><span class="intent-icon">${icon}</span><b>${title}</b><span>${desc}</span></button>`
}
window.startTodayMode=mode=>{
  StudyToday.mode=mode;
  if(mode==="audio")return startMode("audio");
  if(mode==="recovery")return startMode("recovery");
  if(mode==="boss")return startMode("boss");
  if(mode==="exam")return startMode("weak");
  return startMode(mode)
}
function updateBannerHTML(){
  const r=UpdateState.remote||{};
  return `<div class="card pad ultra-update-banner"><div class="spread row"><div class="row"><span class="cube">⬡</span><div><span class="pill">✨ NUEVA VERSIÓN</span><h3 style="margin:8px 0 5px">${esc(r.title||"Actualización disponible")} · v${esc(r.latest||"")}</h3><p class="muted" style="margin:0">${esc(r.subtitle||"Hay mejoras disponibles.")}</p></div></div><div class="row"><button class="btn primary" onclick="applyAppUpdate()">Actualizar ahora</button><button class="btn ghost" onclick="go('updates')">Ver novedades</button><button class="btn icon ghost" onclick="dismissUpdate()">✕</button></div></div></div>`
}
window.dismissUpdate=()=>{UpdateState.dismissed=true;renderHome()}
function renderTrain(){
  setScene("aurora");
  layout(`${backBar("Volver al inicio","home")}<div class="section-title"><div><h1>Centro de entrenamiento</h1><p class="muted">Cada ambiente está optimizado para una forma distinta de recordar.</p></div><span class="pill">${Q.length} preguntas activas</span></div>
  <div class="grid grid3">
    <button class="card mode-card nova-card" onclick="startTutor()"><span class="tag">NUEVO</span><div class="mode-icon">✨</div><h3>Aula IA · NOVA</h3><p>Una sala de estudio conversacional con voz, explicación, pistas y preguntas.</p></button>
    ${modeCard("🧬","Entrenamiento inteligente","Mezcla formatos según tus debilidades y memoria pendiente.","smart","RECOMENDADO")}
    ${modeCard("⚡","Ráfaga","Respuesta inmediata con límite de tiempo.","rapid")}
    ${modeCard("🗣️","Refútame","Defiende una idea correcta frente a una afirmación falsa.","refute")}
    ${modeCard("🎙️","Explícalo","Responde oralmente con tus propias palabras.","explain")}
    ${modeCard("📝","Simulacro","20 preguntas, sin explicaciones hasta terminar.","exam")}
    ${modeCard("👹","Jefe final","Dificultad elevada y multiplicador de XP.","boss")}
    ${modeCard("🌿","Recovery Lab","Solo errores y preguntas vencidas del repaso espaciado.","recovery")}
    ${modeCard("🎧","Audio Coach","Pensado para estudiar escuchando y hablando.","audio","BETA")}
    ${modeCard("🎯","Punto débil","Ataca automáticamente la materia con peor dominio.","weak")}
  </div>`)
}

function tutorPool(topic=""){
  let pool=topic?Q.filter(q=>q.topic===topic):[...Q];
  const due=new Set(dueQuestions().map(q=>q.id));
  pool.sort((a,b)=>{
    const ad=due.has(a.id)?0:1, bd=due.has(b.id)?0:1;
    if(ad!==bd)return ad-bd;
    const ma=masteryRate(a.topic)??50, mb=masteryRate(b.topic)??50;
    return ma-mb || Math.random()-.5;
  });
  return pool
}
function pickTutorQuestion(topic="",avoid=""){
  const pool=tutorPool(topic).filter(q=>q.id!==avoid);
  return pool.length?pool[Math.floor(Math.random()*Math.min(pool.length,18))]:Q[Math.floor(Math.random()*Q.length)]
}
window.startTutor=(topic="")=>{
  Tutor.topic=topic||weakTopic()||"";
  Tutor.q=pickTutorQuestion(Tutor.topic);
  Tutor.awaiting=false;Tutor.transcript="";Tutor.history=[];
  Tutor.lastSpeech="";
  S.screen="study";renderStudy()
}
function tutorSay(text,mood="idle",speaker=true){
  Tutor.lastSpeech=text;
  Tutor.history.push({who:"nova",text});
  if(Tutor.history.length>10)Tutor.history=Tutor.history.slice(-10);
  const log=$("#tutorLog");if(log)log.innerHTML=tutorLogHTML();
  mentor(text,mood,speaker)
}
function tutorLogHTML(){
  return Tutor.history.map(m=>`<div class="chat-msg ${m.who==="user"?"user":"nova"}"><b>${m.who==="user"?esc(first()):"NOVA"}</b><span>${esc(m.text)}</span></div>`).join("")
}
function tutorCoreIdea(q){
  const answer=q?.options?.[q.correct]||"";
  return `En ${q.subtopic}, quédate con esta idea: ${answer}. Esta formulación viene del banco de estudio y te sirve como ancla para reconocer el concepto en el examen.`
}
function tutorHint(q){
  const ks=(q.keywords||[]).slice(0,2);
  return ks.length?`Pista: busca una respuesta relacionada con “${ks.join("” y “")}”. No necesitas repetirla palabra por palabra.`:`Pista: concéntrate en la idea central de ${q.subtopic}.`
}
function tutorStudyExample(q){
  const answer=q?.options?.[q.correct]||"";
  return `Ejercicio mental: tapa las alternativas y trata de recordar primero la idea “${answer}”. Luego vuelve a leer la pregunta y explica por qué esa idea encaja.`
}
function renderStudy(){
  setScene("debate");
  if(!Tutor.q)Tutor.q=pickTutorQuestion(Tutor.topic);
  const topics=[...new Set(Q.map(q=>q.topic))].sort();
  const q=Tutor.q;
  layout(`${backBar("Volver al entrenamiento","train")}
  <section class="tutor-grid">
    <div class="card pad-lg tutor-console">
      <div class="spread row">
        <div><span class="pill live">NOVA STUDY LAB</span><h1 style="margin-top:12px">Aula de estudio <span class="gradient">conversacional</span></h1></div>
        <span class="pill">${Q.length} preguntas en el cerebro local</span>
      </div>
      <p class="muted">Habla con NOVA o usa los accesos rápidos. Todo el contenido sale de tu banco local; no necesita login ni Supabase.</p>

      <div class="grid grid2 tutor-selects">
        <div class="field"><label>Materia</label><select id="tutorTopic" onchange="tutorSetTopic(this.value)">
          <option value="">Mezcla inteligente</option>
          ${topics.map(t=>`<option value="${esc(t)}" ${Tutor.topic===t?"selected":""}>${esc(t)}</option>`).join("")}
        </select></div>
        <div class="field"><label>Concepto actual</label><div class="study-concept">${esc(q.subtopic)}</div></div>
      </div>

      <div class="study-question">
        <span class="tiny muted">FOCO ACTUAL</span>
        <h2>${esc(q.question)}</h2>
      </div>

      <div id="tutorLog" class="chat-log">${tutorLogHTML() || `<div class="chat-msg nova"><b>NOVA</b><span>Estoy lista. Puedes decir “explícame”, “hazme una pregunta”, “dame una pista” o simplemente responderme.</span></div>`}</div>

      <div class="voice-box tutor-voice">
        <div class="voice-top">
          <button id="tutorMic" class="mic-orb" onclick="listenTutor()">🎙️</button>
          <div id="tutorTranscript" class="transcript">${SpeechRecognition?"Toca el micrófono y háblame.":"Tu navegador usará el campo de texto como alternativa."}</div>
        </div>
        <div class="field" style="margin-top:12px;margin-bottom:9px"><textarea id="tutorTyped" rows="2" placeholder="Ej. Explícame esto de otra manera / Hazme una pregunta / Mi respuesta es..."></textarea></div>
        <div class="spread row"><label class="pill"><input type="checkbox" ${Tutor.handsFree?"checked":""} onchange="toggleHandsFree(this.checked)"> 🎧 Manos libres</label><button class="btn primary" onclick="tutorSend()">Enviar a NOVA →</button></div>
      </div>

      <div class="quick-grid">
        <button class="btn ghost" onclick="tutorAction('explain')">🧠 Explícame</button>
        <button class="btn ghost" onclick="tutorAction('ask')">🎯 Pregúntame</button>
        <button class="btn ghost" onclick="tutorAction('hint')">💡 Dame pista</button>
        <button class="btn ghost" onclick="tutorAction('example')">🧩 Cómo recordarlo</button>
        <button class="btn ghost" onclick="tutorAction('repeat')">🔊 Repítelo</button>
        <button class="btn cyan" onclick="tutorAction('next')">→ Siguiente concepto</button>
      </div>
    </div>
    <aside class="card tutor-mentor">${coachHTML()}</aside>
  </section>`);
  setTimeout(()=>mentor(`${first()}, bienvenida al Aula NOVA. Hoy podemos estudiar ${Tutor.topic||"una mezcla de materias"}. Dime qué necesitas.`,"idle",true),160)
}
window.tutorSetTopic=value=>{
  Tutor.topic=value;Tutor.q=pickTutorQuestion(value,Tutor.q?.id);Tutor.awaiting=false;Tutor.history=[];
  renderStudy()
}
window.tutorAction=action=>{
  const q=Tutor.q;if(!q)return;
  if(action==="explain")return tutorSay(tutorCoreIdea(q),"thinking",true);
  if(action==="hint")return tutorSay(tutorHint(q),"thinking",true);
  if(action==="example")return tutorSay(tutorStudyExample(q),"thinking",true);
  if(action==="repeat")return tutorSay(Tutor.lastSpeech||tutorCoreIdea(q),"idle",true);
  if(action==="ask"){
    Tutor.awaiting=true;
    return tutorSay(`Ahora tú. ${q.question} Respóndeme con tus palabras; no hace falta recitar la alternativa exacta.`,"listening",true)
  }
  if(action==="next"){
    Tutor.q=pickTutorQuestion(Tutor.topic,q.id);Tutor.awaiting=false;Tutor.transcript="";
    renderStudy();
    setTimeout(()=>tutorSay(`Nuevo concepto: ${Tutor.q.subtopic}. ${tutorCoreIdea(Tutor.q)}`,"idle",true),260);
  }
}
window.toggleHandsFree=checked=>{
  Tutor.handsFree=checked;toast(checked?"Manos libres activado":"Manos libres desactivado")
}
function tutorRecord(q,ok){
  const d=profileData();d.total++;d.daily.count++;if(ok)d.correct++;
  d.xp+=ok?120:20;d.coins+=ok?2:0;
  d.mastery[q.topic]||={attempts:0,correct:0};d.mastery[q.topic].attempts++;if(ok)d.mastery[q.topic].correct++;
  const box=d.spaced[q.id]?.box||0,nextBox=ok?Math.min(5,box+1):0,days=[0,1,3,7,14,30];
  d.spaced[q.id]={box:nextBox,due:Date.now()+days[nextBox]*86400000,last:Date.now(),lastOk:ok};
  d.history.unshift({qid:q.id,topic:q.topic,ok,mode:"tutor",date:nowDay(),ts:Date.now()});d.history=d.history.slice(0,700);
  user.data=d;saveUser()
}
function tutorEvaluate(text){
  const q=Tutor.q,score=keywordScore(text,q.keywords||[]);
  const answer=normalize(q.options[q.correct]||"");
  const tokens=answer.split(/\s+/).filter(x=>x.length>4).slice(0,6);
  const semanticHits=tokens.filter(x=>normalize(text).includes(x)).length;
  const ok=score>=.34 || semanticHits>=2;
  tutorRecord(q,ok);Tutor.awaiting=false;
  if(ok){
    beep("ok");haptic([20,40,20]);confetti();
    tutorSay(`Sí. Captaste la idea. ${q.explanation} Te sumé 120 XP.`,"success",true)
  }else{
    beep("bad");haptic(60);
    tutorSay(`Aún falta la idea central. ${tutorCoreIdea(q)} Te la volveré a traer antes en el repaso.`,"error",true)
  }
  if(Tutor.handsFree){
    setTimeout(()=>{
      Tutor.q=pickTutorQuestion(Tutor.topic,q.id);
      renderStudy();
      setTimeout(()=>{tutorAction("ask");setTimeout(()=>listenTutor(),900)},500)
    },2200)
  }
}
window.listenTutor=()=>{
  if(!SpeechRecognition)return toast("Escribe tu mensaje para NOVA");
  if(recognition)try{recognition.stop()}catch{}
  recognition=new SpeechRecognition();recognition.lang="es-PE";recognition.interimResults=true;recognition.continuous=false;
  recognition.onstart=()=>{$("#tutorMic")?.classList.add("active");mentor("Te escucho.","listening",false)};
  recognition.onresult=e=>{
    let t="";for(let i=e.resultIndex;i<e.results.length;i++)t+=e.results[i][0].transcript+" ";
    Tutor.transcript=t.trim();if($("#tutorTranscript"))$("#tutorTranscript").textContent=Tutor.transcript;if($("#tutorTyped"))$("#tutorTyped").value=Tutor.transcript
  };
  recognition.onerror=e=>{ $("#tutorMic")?.classList.remove("active"); mentor(e.error==="not-allowed"?"No tengo permiso para usar el micrófono. Escríbeme aquí.":"No pude entender el audio. Intenta otra vez.","error",true) };
  recognition.onend=()=>{ $("#tutorMic")?.classList.remove("active"); if(Tutor.handsFree&&Tutor.transcript)tutorSend(); else mentor("Te escuché. Pulsa enviar cuando quieras.","thinking",false) };
  recognition.start()
}
window.tutorSend=()=>{
  const text=($("#tutorTyped")?.value||Tutor.transcript||"").trim();if(!text)return toast("Dime o escribe algo");
  Tutor.history.push({who:"user",text});Tutor.transcript="";
  const n=normalize(text);
  if(n.includes("no entiendo")||n.includes("explicame")||n.includes("explica"))return tutorAction("explain");
  if(n.includes("pista")||n.includes("ayuda"))return tutorAction("hint");
  if(n.includes("repite")||n.includes("otra vez"))return tutorAction("repeat");
  if(n.includes("siguiente")||n.includes("otro concepto"))return tutorAction("next");
  if(n.includes("preguntame")||n.includes("hazme una pregunta")||n==="pregunta")return tutorAction("ask");
  if(n.includes("ejemplo")||n.includes("recordar"))return tutorAction("example");
  if(Tutor.awaiting)return tutorEvaluate(text);
  tutorSay(`Te entendí. Para trabajar este tema contigo, puedo explicarlo, darte una pista o preguntarte. ${tutorCoreIdea(Tutor.q)}`,"thinking",true)
}

window.startMode=async mode=>{
  let pool=[...Q];const weak=weakTopic();
  if(mode==="weak"&&weak){pool=pool.filter(q=>q.topic===weak);mode="smart"}
  if(mode==="boss")pool=pool.filter(q=>(q.difficulty||1)>=2);
  if(mode==="recovery"){const due=dueQuestions();const wrongIds=new Set(profileData().history.filter(h=>!h.ok).slice(0,40).map(h=>h.qid));pool=Q.filter(q=>due.some(d=>d.id===q.id)||wrongIds.has(q.id));if(!pool.length)pool=[...Q]}
  if(mode==="smart"){const due=dueQuestions();if(due.length>=5)pool=due}
  pool.sort(()=>Math.random()-.5);
  const n=mode==="exam"?Math.min(20,pool.length):Math.min(10,pool.length);
  S.mode=mode;S.queue=pool.slice(0,n);S.index=0;S.current=S.queue[0];S.answered=false;S.correctSession=0;S.wrongSession=0;S.combo=0;S.maxCombo=0;S.wrongStreak=0;S.interrupted=0;S.sessionStarted=Date.now();
  persistResume();await requestWakeLock();go("quiz");
}
window.resumeSession=()=>{const r=resumeState();if(!r)return;Object.assign(S,r,{screen:"quiz",answered:false,timer:null});S.current=S.queue[S.index];go("quiz")}
function persistResume(){
  if(!user||S.screen==="progress")return;
  if(S.queue?.length && S.current)Store.set("resume",{mode:S.mode,queue:S.queue,index:S.index,current:S.current,correctSession:S.correctSession,wrongSession:S.wrongSession,combo:S.combo,maxCombo:S.maxCombo,wrongStreak:S.wrongStreak,interrupted:S.interrupted,sessionStarted:S.sessionStarted});
}
function clearResume(){Store.remove("resume")}

function challenge(q){
  if(S.mode==="refute"){const wrong=q.options.find((_,i)=>i!==q.correct);return `Refútame: “${wrong}”. ¿Qué está mal y cuál es la idea correcta?`}
  if(["explain","audio"].includes(S.mode))return `Explícalo con tus palabras: ${q.question}`;
  return q.question
}
function voiceMode(){return ["refute","explain","audio"].includes(S.mode)}
function renderQuiz(){
  const q=S.current;if(!q)return finishSession();
  const recoveryActive=prefs().recovery&&S.wrongStreak>=2;
  setScene(recoveryActive?"recovery":sceneForMode(S.mode));
  const pct=Math.round(S.index/S.queue.length*100),exam=S.mode==="exam";
  layout(`<div class="focus-strip"></div><section class="quiz-grid" style="margin-top:12px">
    <div class="card quiz-main">
      <div class="meta-line">
        <div class="row"><span class="pill">${esc(q.topic)}</span><span class="topic-badge">${esc(q.subtopic)}</span>${recoveryActive?`<span class="pill">🌿 Recovery activo</span>`:""}</div>
        <div class="row"><button class="btn ghost back-small" onclick="pauseSession()">← Salir</button><span class="pill">🔥 Combo ${S.combo}</span><span class="pill">${S.index+1}/${S.queue.length}</span><span id="timer" class="pill timer"></span></div>
      </div>
      <div class="progress" style="margin-top:12px"><i style="width:${pct}%"></i></div>
      <h2 class="question">${esc(challenge(q))}</h2>
      ${voiceMode()?voiceHTML():optionHTML(q)}
      <div id="result"></div>
      ${exam?`<div class="notice" style="margin-top:14px">🛡️ Modo simulacro: no se muestran pistas durante la respuesta. Si cambias de pestaña, la sesión registra la interrupción.</div>`:""}
    </div>
    <aside class="card">${coachHTML()}<div class="pad" style="padding-top:0"><div class="row" style="justify-content:center"><button class="btn ghost" onclick="repeatQ()">🔊 Repetir</button><button class="btn ghost" onclick="pauseSession()">⏸ Pausar</button></div></div></aside>
  </section>`);
  S.answered=false;S.transcript="";S.sec=S.mode==="rapid"?12:(S.mode==="boss"?20:0);
  if(S.sec)startTimer();
  setTimeout(()=>mentor(recoveryActive?`${first()}, bajamos el ritmo un momento. No buscamos velocidad: buscamos que este concepto quede fijo.`:`${first()}, ${challenge(q)}`,"idle",true),150);
}
function optionHTML(q){return `<div class="option-list">${q.options.map((o,i)=>`<button id="op${i}" class="option" onclick="answerMCQ(${i})"><span class="option-key">${String.fromCharCode(65+i)}</span><span>${esc(o)}</span></button>`).join("")}</div>`}
function voiceHTML(){return `<div class="voice-box">
  <div class="voice-top"><button id="micBtn" class="mic-orb" onclick="listen()">🎙️</button><div id="transcript" class="transcript">${SpeechRecognition?"Toca el micrófono. Puedes responder de forma natural; no necesitas repetir exactamente el texto.":"Este navegador no ofrece reconocimiento de voz. Escribe tu explicación abajo."}</div></div>
  <div class="field" style="margin-top:13px;margin-bottom:9px"><textarea id="typed" rows="3" placeholder="Tu respuesta también puede escribirse aquí..."></textarea></div>
  <div class="spread row"><span class="small muted">Se evalúan conceptos clave, no una frase exacta.</span><button class="btn primary" onclick="evaluateVoice()">Analizar respuesta →</button></div>
</div>`}
window.repeatQ=()=>mentor(`${first()}, ${challenge(S.current)}`,"idle",true)
window.pauseSession=()=>{persistResume();stopTimer();releaseWakeLock();go("home");toast("Sesión guardada")}
function startTimer(){
  const el=$("#timer");if(el)el.textContent=`⏱ ${S.sec}s`;
  stopTimer();S.timer=setInterval(()=>{S.sec--;const e=$("#timer");if(e){e.textContent=`⏱ ${S.sec}s`;e.classList.toggle("hot",S.sec<=4)}if(S.sec<=4&&S.sec>0)beep("tick");if(S.sec<=0){stopTimer();if(!S.answered){S.answered=true;record(S.current,false,0);showResult(false,"Se acabó el tiempo. "+S.current.explanation,0)}}},1000)
}
function stopTimer(){if(S.timer){clearInterval(S.timer);S.timer=null}}
window.answerMCQ=i=>{
  if(S.answered)return;S.answered=true;stopTimer();const q=S.current,ok=i===q.correct;
  $(`#op${q.correct}`)?.classList.add("correct");if(!ok)$(`#op${i}`)?.classList.add("wrong");
  record(q,ok,ok?100:0);showResult(ok,q.explanation,ok?xpForMode():0)
}
function normalize(s){return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\w\s]/g," ")}
function keywordScore(t,keys=[]){
  const s=normalize(t);if(!keys.length)return 0;let sum=0;
  for(const k of keys){const w=normalize(k).split(/\s+/).filter(Boolean);if(!w.length)continue;sum+=w.filter(x=>s.includes(x)).length/w.length}
  return sum/keys.length
}
window.listen=()=>{
  if(!SpeechRecognition)return toast("Usa la respuesta escrita en este navegador");
  if(recognition)try{recognition.stop()}catch{}
  recognition=new SpeechRecognition();recognition.lang="es-PE";recognition.interimResults=true;recognition.continuous=false;
  recognition.onstart=()=>{S.listening=true;$("#micBtn")?.classList.add("active");mentor("Te escucho. Habla como si me lo explicaras a mí.","listening",false)}
  recognition.onresult=e=>{let t="";for(let i=e.resultIndex;i<e.results.length;i++)t+=e.results[i][0].transcript+" ";S.transcript=t.trim();if($("#transcript"))$("#transcript").textContent=S.transcript;if($("#typed"))$("#typed").value=S.transcript}
  recognition.onerror=e=>{S.listening=false;$("#micBtn")?.classList.remove("active");mentor(e.error==="not-allowed"?"No tengo permiso de micrófono. Puedes responder escribiendo.":"No pude captar bien el audio. Intenta otra vez o escribe la respuesta.","error",true)}
  recognition.onend=()=>{S.listening=false;$("#micBtn")?.classList.remove("active");mentor("Respuesta capturada. Cuando quieras, la analizo.","thinking",false)}
  recognition.start()
}
window.evaluateVoice=()=>{
  if(S.answered)return;const q=S.current,t=($("#typed")?.value||S.transcript||"").trim();if(!t)return toast("Primero responde por voz o por texto");
  S.answered=true;const score=keywordScore(t,q.keywords),threshold=S.mode==="refute"?.30:.42;let ok=score>=threshold;
  const answerTokens=normalize(q.options[q.correct]).split(/\s+/).filter(x=>x.length>4).slice(0,4);if(answerTokens.filter(x=>normalize(t).includes(x)).length>=2)ok=true;
  record(q,ok,0);showResult(ok,(ok?coachTone().ok+" ":coachTone().bad+" ")+q.explanation,ok?xpForMode():25,Math.round(score*100))
}
function xpForMode(){return S.mode==="boss"?220:["refute","explain","audio"].includes(S.mode)?160:S.mode==="rapid"?130:100}
function record(q,ok){
  const d=profileData();d.total++;d.daily.count++;if(ok)d.correct++;
  const xp=ok?xpForMode():(voiceMode()?25:0);d.xp+=xp;d.coins+=(ok?Math.max(1,Math.floor(xp/45)):0);
  d.mastery[q.topic] ||= {attempts:0,correct:0};d.mastery[q.topic].attempts++;if(ok)d.mastery[q.topic].correct++;
  const box=d.spaced[q.id]?.box||0, nextBox=ok?Math.min(5,box+1):0, intervals=[0,1,3,7,14,30];
  d.spaced[q.id]={box:nextBox,due:Date.now()+intervals[nextBox]*86400000,last:Date.now(),lastOk:ok};
  d.history.unshift({qid:q.id,topic:q.topic,ok,mode:S.mode,date:nowDay(),ts:Date.now()});d.history=d.history.slice(0,700);
  if(ok){S.correctSession++;S.combo++;S.maxCombo=Math.max(S.maxCombo,S.combo);S.wrongStreak=0}else{S.wrongSession++;S.combo=0;S.wrongStreak++}
  d.bestCombo=Math.max(d.bestCombo||0,S.maxCombo); user.data=d;unlockAchievements();saveUser();persistResume();
}
function unlockAchievements(){
  const d=profileData(),a=new Set(d.achievements||[]);
  if(d.total>=1)a.add("first");if(d.correct>=10)a.add("ten");if(S.maxCombo>=5)a.add("combo5");if((d.streak||0)>=3)a.add("streak3");if(d.total>=50)a.add("fifty");
  d.achievements=[...a];user.data=d
}
function showResult(ok,text,xp,score=null){
  if(ok){beep("ok");haptic([20,40,20]);if(S.combo>=3)confetti()}else{beep("bad");haptic(80)}
  const r=$("#result");if(!r)return;
  r.innerHTML=`<div class="result-box"><div class="spread row"><div><h3 style="margin-bottom:6px">${ok?"✅ Respuesta sólida":"🧠 Concepto para reforzar"}</h3><p class="muted" style="margin-bottom:0">${esc(text)}</p></div>${score!==null?`<div class="score-ring" style="--pct:${Math.min(100,score)}%"><span>${score}%</span></div>`:""}</div><div class="row" style="margin-top:13px"><span class="pill">+${xp} XP</span>${S.combo>=3?`<span class="pill">🔥 COMBO x${S.combo}</span>`:""}<button class="btn primary" onclick="nextQ()">Siguiente →</button></div></div>`;
  mentor(ok?`${coachTone().ok} ${text}`:`${coachTone().bad} ${text}`,ok?"success":"error",true)
}
window.nextQ=()=>{S.index++;S.current=S.queue[S.index];S.answered=false;S.transcript="";if(!S.current)return finishSession();persistResume();renderQuiz()}
async function finishSession(){
  stopTimer();releaseWakeLock();clearResume();setScene("victory");const d=profileData();d.sessions=(d.sessions||0)+1;const mins=Math.max(1,Math.round((Date.now()-S.sessionStarted)/60000));d.totalMinutes=(d.totalMinutes||0)+mins;d.lastSession={date:nowDay(),correct:S.correctSession,wrong:S.wrongSession,mode:S.mode,minutes:mins};user.data=d;saveUser();
  const n=S.queue.length,rate=n?Math.round(S.correctSession/n*100):0;
  layout(`<section class="card pad-lg" style="max-width:820px;margin:5vh auto;text-align:center">
    <div class="combo">MISIÓN COMPLETA</div><p class="muted">Sesión HyperLearning finalizada</p>
    <h1 style="font-size:clamp(2rem,5vw,4rem)">${esc(first())}, cerraste con ${rate}%.</h1>
    <p class="lead" style="margin-inline:auto">${S.wrongSession?`Detecté ${S.wrongSession} respuestas que volverán a aparecer con repaso espaciado. No se pierden: se convierten en tu siguiente entrenamiento.`:"Sesión limpia. El sistema aumentará progresivamente el desafío para que no te estanques."}</p>
    <div class="grid grid4" style="margin-top:20px;text-align:left"><div class="stat"><span class="k">Correctas</span><strong>${S.correctSession}</strong></div><div class="stat"><span class="k">Errores</span><strong>${S.wrongSession}</strong></div><div class="stat"><span class="k">Mejor combo</span><strong>🔥 ${S.maxCombo}</strong></div><div class="stat"><span class="k">Tiempo</span><strong>${mins}m</strong></div></div>
    <div class="row" style="justify-content:center;margin-top:22px"><button class="btn primary big" onclick="go('home')">Volver al centro</button><button class="btn ghost big" onclick="startMode('recovery')">🌿 Reforzar errores</button><button class="btn ghost big" onclick="shareResult(${rate})">Compartir</button></div>
  </section>`);
  confetti();speech(`${first()}, misión completada. Tu resultado fue ${rate} por ciento.`)
}
window.shareResult=async rate=>{
  const text=`Reto Fiscal AI Pro · terminé una sesión con ${rate}% de precisión y combo máximo x${S.maxCombo}.`;
  if(navigator.share)try{await navigator.share({title:"Reto Fiscal AI Pro",text})}catch{}else{await navigator.clipboard?.writeText(text);toast("Resultado copiado")}
}

function renderProgress(){
  setScene("focus");const d=profileData(),topics=Object.entries(d.mastery),ach=achievementList();
  layout(`${backBar("Volver al inicio","home")}<div class="section-title"><div><h1>Tu mapa de dominio</h1><p class="muted">No mostramos solo notas: medimos qué recuerdas y cuándo conviene volver a preguntarlo.</p></div><span class="pill">🧬 ${dueQuestions().length} repasos pendientes</span></div>
  <div class="grid grid4"><div class="card stat"><span class="k">Nivel</span><strong>${level(d.xp)}</strong></div><div class="card stat"><span class="k">XP</span><strong>${d.xp}</strong></div><div class="card stat"><span class="k">Precisión</span><strong>${d.total?Math.round(d.correct/d.total*100):0}%</strong></div><div class="card stat"><span class="k">Sesiones</span><strong>${d.sessions||0}</strong></div></div>
  <div class="grid grid2" style="margin-top:15px">
    <div class="card pad"><h2>Dominio por materia</h2>${topics.length?topics.map(([k,v])=>{const p=Math.round(v.correct/v.attempts*100);return `<div class="chart-row"><div class="chart-head"><strong>${esc(k)}</strong><span>${p}% · ${v.attempts}</span></div><div class="progress"><i style="width:${p}%"></i></div></div>`}).join(""):`<p class="muted">Completa una sesión y aquí aparecerá tu mapa.</p>`}</div>
    <div class="card pad"><h2>Logros</h2><div class="grid">${ach.map(a=>`<div class="achievement" style="opacity:${a.unlocked?1:.42}"><span class="medal">${a.icon}</span><div><strong>${a.title}</strong><br><span class="small muted">${a.desc}</span></div></div>`).join("")}</div></div>
  </div>
  <div class="card pad" style="margin-top:15px"><div class="spread row"><div><h2>Memoria espaciada</h2><p class="muted">Las preguntas que fallas vuelven antes; las que dominas se separan progresivamente.</p></div><button class="btn primary" onclick="startMode('recovery')">Repasar ${dueQuestions().length}</button></div></div>`)
}
function achievementList(){const set=new Set(profileData().achievements||[]);return [
  ["first","🚀","Primer contacto","Completa tu primera respuesta."],["ten","🎯","Diez limpias","Consigue 10 respuestas correctas."],["combo5","🔥","En llamas","Alcanza combo x5."],["streak3","🗓️","Constancia","Estudia 3 días consecutivos."],["fifty","🧠","Neural 50","Completa 50 respuestas."]
].map(([id,icon,title,desc])=>({id,icon,title,desc,unlocked:set.has(id)}))}

function renderBank(){
  setScene("aurora");
  const topics=[...new Set(Q.map(q=>q.topic))].sort();
  const query=normalize(BankUI.query);
  let rows=Q.filter(q=>{
    const topicOk=BankUI.topic==="all"||q.topic===BankUI.topic;
    const searchOk=!query||normalize(`${q.question} ${q.topic} ${q.subtopic} ${q.source||""}`).includes(query);
    return topicOk&&searchOk
  });
  const pages=Math.max(1,Math.ceil(rows.length/BankUI.size));
  BankUI.page=Math.min(BankUI.page,pages-1);
  const start=BankUI.page*BankUI.size,shown=rows.slice(start,start+BankUI.size);
  layout(`${backBar("Volver al inicio","home")}
  <div class="section-title"><div><h1>Banco de conocimiento</h1><p class="muted">Ahora el banco grande se puede buscar y filtrar sin cargar cientos de tarjetas a la vez.</p></div><div class="row"><span class="pill">${Q.length} activas</span><span class="pill">${topics.length} materias</span></div></div>
  <div class="card pad bank-toolbar">
    <div class="field"><label>Buscar pregunta o concepto</label><input id="bankSearch" value="${esc(BankUI.query)}" placeholder="Ej. hábeas corpus, carpeta fiscal, prueba..." oninput="bankSearch(this.value)"></div>
    <div class="field"><label>Materia</label><select onchange="bankTopic(this.value)"><option value="all">Todas</option>${topics.map(t=>`<option value="${esc(t)}" ${BankUI.topic===t?"selected":""}>${esc(t)}</option>`).join("")}</select></div>
    <div class="bank-count"><b>${rows.length}</b><span class="small muted"> resultados</span></div>
  </div>
  <div class="notice warn" style="margin-top:12px">🛡️ Las preguntas importadas del balotario usan la alternativa visualmente marcada en la fuente. Las claves antiguas de los primeros documentos conservan su estado provisional.</div>
  <div class="grid" style="margin-top:14px">${shown.map(q=>`<div class="card pad bank-item"><div class="spread row"><strong>${esc(q.question)}</strong><span class="topic-badge">${esc(q.topic)}</span></div><div class="row" style="margin-top:9px"><span class="small muted">${esc(q.subtopic)}</span><span class="small muted">Dificultad ${q.difficulty||1}/3</span><span class="small muted">Clave ${String.fromCharCode(65+q.correct)}</span>${q.sourcePage?`<span class="small muted">p. ${q.sourcePage}</span>`:""}<span class="small muted">${esc(q.keyStatus||"provisional")}</span></div></div>`).join("")||`<div class="card pad"><p class="muted">No encontré preguntas con ese filtro.</p></div>`}</div>
  <div class="pagination"><button class="btn ghost" onclick="bankPage(-1)" ${BankUI.page===0?"disabled":""}>← Anterior</button><span class="pill">Página ${BankUI.page+1} / ${pages}</span><button class="btn ghost" onclick="bankPage(1)" ${BankUI.page>=pages-1?"disabled":""}>Siguiente →</button></div>`)
}
window.bankSearch=v=>{BankUI.query=v;BankUI.page=0;renderBank();setTimeout(()=>{$("#bankSearch")?.focus();const x=$("#bankSearch");if(x)x.setSelectionRange(x.value.length,x.value.length)},0)}
window.bankTopic=v=>{BankUI.topic=v;BankUI.page=0;renderBank()}
window.bankPage=d=>{BankUI.page+=d;renderBank();window.scrollTo({top:0,behavior:"smooth"})}

function renderProfile(){
  setScene("aurora");const d=profileData(),p=prefs();
  layout(`${backBar("Volver al inicio","home")}<div class="section-title"><div><h1>Perfil de ${esc(first())}</h1><p class="muted">No es una cuenta: es tu configuración personal guardada en este celular.</p></div><span class="pill">🔒 LOCAL ONLY</span></div>
  <div class="grid grid2">
    <div class="card pad"><h2>Identidad de estudio</h2>
      <div class="field"><label>Nombre</label><input id="pName" value="${esc(user.name)}"></div>
      <div class="field"><label>Cómo debe llamarte el mentor</label><input id="pCall" value="${esc(user.callMe||first())}"></div>
      <div class="grid grid2"><div class="field"><label>Meta diaria</label><input id="pGoal" type="number" value="${user.goal||10}"></div><div class="field"><label>Fecha objetivo</label><input id="pExam" type="date" value="${esc(user.examDate||"")}"></div></div>
      <div class="field"><label>Personalidad del mentor</label><select id="pStyle"><option value="balanced" ${p.coachStyle==="balanced"?"selected":""}>Equilibrado</option><option value="competitive" ${p.coachStyle==="competitive"?"selected":""}>Competitivo</option><option value="strict" ${p.coachStyle==="strict"?"selected":""}>Exigente</option><option value="calm" ${p.coachStyle==="calm"?"selected":""}>Tranquilo</option></select></div>
      <button class="btn primary" onclick="saveProfileSettings()">Guardar cambios</button>
    </div>
    <div class="card pad"><h2>Experiencia</h2>${toggleRow("Voz del mentor","voice",p.voice)}${toggleRow("Sonidos de juego","sfx",p.sfx)}${toggleRow("Haptics / vibración","haptics",p.haptics)}${toggleRow("Animaciones avanzadas","motion",p.motion)}${toggleRow("Recovery automático","recovery",p.recovery)}</div>
    <div class="card pad"><h2>Respaldo local</h2><p class="muted">Como no usamos nube, esta es la protección importante. Guarda una copia si vas a cambiar de celular o limpiar el navegador.</p><div class="row"><button class="btn cyan" onclick="exportData()">💾 Descargar respaldo</button><label class="btn ghost">📥 Restaurar respaldo<input type="file" accept=".json" style="display:none" onchange="importData(event)"></label></div><p class="tiny muted" style="margin-top:12px">Último respaldo: ${d.lastBackup?new Date(d.lastBackup).toLocaleString("es-PE"):"Aún no realizado"}</p></div>
    <div class="card pad"><h2>Instalación</h2><p class="muted">Instálala como PWA. Las actualizaciones desde Cloudflare no deberían borrar tu progreso local.</p><div class="row"><button class="btn cyan" onclick="installApp()">📲 Instalar aplicación</button><button class="btn ghost" onclick="refreshApp()">🔄 Buscar actualización</button></div></div>
    <div class="card pad"><h2>Zona de seguridad</h2><p class="muted">Solo úsalo si realmente quieres comenzar desde cero.</p><button class="btn danger" onclick="resetAll()">Borrar todo mi progreso</button></div>
  </div>`)
}
function toggleRow(label,key,on){return `<div class="switch"><span>${label}</span><button class="toggle ${on?"on":""}" onclick="togglePref('${key}',this)" aria-label="${label}"></button></div>`}
window.togglePref=(k,el)=>{user.prefs={...prefs(),[k]:!prefs()[k]};saveUser();el.classList.toggle("on",user.prefs[k]);if(k==="motion")document.body.classList.toggle("reduced-motion",!user.prefs[k])}
window.saveProfileSettings=()=>{user.name=$("#pName").value.trim()||user.name;user.callMe=$("#pCall").value.trim()||user.name.split(/\s+/)[0];user.goal=+$("#pGoal").value||10;user.examDate=$("#pExam").value||"";user.prefs={...prefs(),coachStyle:$("#pStyle").value};saveUser();toast("Perfil actualizado");renderProfile()}
window.exportData=()=>{const d=profileData();d.lastBackup=Date.now();user.data=d;saveUser();const payload={app:"Reto Fiscal AI Pro",version:"2.1-solo",exportedAt:new Date().toISOString(),user};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`reto-fiscal-respaldo-${first().toLowerCase()}-${nowDay()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast("Respaldo descargado")}
window.importData=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const p=JSON.parse(r.result),u=p.user||p;if(!u.name||!u.data)throw 0;user={...u,callMe:u.callMe||(u.name||"").split(/\s+/)[0],prefs:{...defaultPrefs,...(u.prefs||{})},data:{...freshData(),...(u.data||{})},storageMode:"local-only"};saveUser();toast("Respaldo restaurado");go("home")}catch{toast("Ese archivo no es un respaldo válido")}};r.readAsText(f)}
window.resetAll=()=>{if(!confirm("Esto borrará todo el progreso guardado en este dispositivo. ¿Continuar?"))return;Store.remove("user");Store.remove("resume");user=null;S.screen="onboarding";render()}
window.refreshApp=async()=>{try{const regs=await navigator.serviceWorker?.getRegistrations?.();if(regs)for(const r of regs)await r.update();toast("Actualización revisada. Recarga si acabas de publicar cambios.")}catch{toast("No fue necesario actualizar")}}

window.openQuick=()=>{portal.innerHTML=`<div class="modal-wrap" onclick="if(event.target===this)closeModal()"><div class="card pad modal"><div class="spread row"><div><h2>Control rápido</h2><p class="muted">Estado del dispositivo y accesos.</p></div><button class="btn icon ghost" onclick="closeModal()">✕</button></div>
<div class="grid grid2"><div class="stat"><span class="k">Micrófono</span><strong>${SpeechRecognition?"Disponible":"Fallback texto"}</strong></div><div class="stat"><span class="k">Red</span><strong>${navigator.onLine?"Online":"Offline"}</strong></div></div>
<div class="row" style="margin-top:15px"><button class="btn ghost" onclick="installApp()">📲 Instalar</button><button class="btn ghost" onclick="go('profile');closeModal()">⚙️ Preferencias</button></div></div></div>`}
window.closeModal=()=>portal.innerHTML=""
window.installApp=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null}else toast("Usa 'Añadir a pantalla de inicio' en el menú del navegador")}

async function requestWakeLock(){try{if("wakeLock"in navigator)wakeLock=await navigator.wakeLock.request("screen")}catch{}}
async function releaseWakeLock(){try{await wakeLock?.release()}catch{}wakeLock=null}
document.addEventListener("visibilitychange",()=>{if(document.hidden&&S.screen==="quiz"){S.interrupted++;persistResume();if(S.mode!=="exam")stopTimer()}else if(!document.hidden&&S.screen==="quiz"&&S.sec>0&&!S.answered)startTimer()})
window.addEventListener("beforeunload",()=>{if(S.screen==="quiz")persistResume()})
window.addEventListener("online",()=>toast("Conexión recuperada"))
window.addEventListener("offline",()=>toast("Sin conexión · seguimos con datos locales"))
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e})
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}))


function semver(v){return String(v||"0.0.0").split(".").map(x=>parseInt(x)||0)}
function newer(a,b){
  const x=semver(a),y=semver(b);
  for(let i=0;i<3;i++){if((x[i]||0)>(y[i]||0))return true;if((x[i]||0)<(y[i]||0))return false}
  return false
}
async function checkForUpdates(manual=true){
  if(UpdateState.checking)return;
  UpdateState.checking=true;
  try{
    const res=await fetch(`./version.json?t=${Date.now()}`,{cache:"no-store"});
    if(!res.ok)throw new Error("version");
    const r=await res.json();UpdateState.remote=r;
    UpdateState.available=newer(r.latest,APP_VERSION);
    if(manual)toast(UpdateState.available?`Nueva versión ${r.latest} disponible`:`Estás al día · v${APP_VERSION}`);
    if(S.screen==="home")renderHome()
  }catch{
    if(manual)toast("No pude comprobar actualizaciones ahora")
  }finally{UpdateState.checking=false}
}
window.checkForUpdates=checkForUpdates;

async function makeInternalBackup(){
  try{
    const snapshot={version:APP_VERSION,ts:Date.now(),user:JSON.parse(JSON.stringify(user||null)),resume:resumeState()};
    localStorage.setItem("rfsolo_auto_backup",JSON.stringify(snapshot));
    return true
  }catch{return false}
}
async function applyAppUpdate(){
  await makeInternalBackup();
  UpdateState.progress=8;renderUpdateProgress();
  try{
    if("serviceWorker" in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      UpdateState.progress=30;renderUpdateProgress();
      for(const reg of regs)await reg.update();
    }
    UpdateState.progress=62;renderUpdateProgress();
    const keys=await caches.keys();
    for(const k of keys)if(!k.includes("v23"))await caches.delete(k);
    UpdateState.progress=86;renderUpdateProgress();
    setTimeout(()=>{UpdateState.progress=100;renderUpdateProgress();setTimeout(()=>location.reload(),650)},350)
  }catch{
    toast("No pude completar la actualización. Tu progreso sigue seguro.")
  }
}
window.applyAppUpdate=applyAppUpdate;

function renderUpdateProgress(){
  const p=Math.max(0,Math.min(100,UpdateState.progress||0));
  portal.innerHTML=`<div class="modal-wrap"><div class="card pad modal"><div style="text-align:center"><div style="font-size:3rem">✨</div><h2>Actualizando NOVA</h2><p class="muted">Tu progreso ya tiene respaldo automático.</p><div class="app-update-progress"><i style="width:${p}%"></i></div><strong style="display:block;margin-top:10px">${p}%</strong><p class="small muted">${p<40?"Buscando archivos nuevos…":p<80?"Preparando la nueva versión…":p<100?"Activando mejoras…":"Lista."}</p></div></div></div>`
}
async function loadChangelog(){
  try{const r=await fetch(`./changelog.json?t=${Date.now()}`,{cache:"no-store"});return await r.json()}catch{return {versions:[]}}
}
async function renderUpdates(){
  setScene("aurora");
  const data=await loadChangelog(),remote=UpdateState.remote||versionFallback();
  layout(`${backBar("Volver al inicio","home")}
  <div class="section-title"><div><h1>Centro de actualizaciones</h1><p class="muted">Mantén NOVA al día sin perder tu progreso.</p></div><span class="pill">Instalada · v${APP_VERSION}</span></div>
  <div class="update-center-grid">
    <div class="card pad">
      <span class="pill ${UpdateState.available?"":"live"}">${UpdateState.available?"✨ ACTUALIZACIÓN DISPONIBLE":"✅ ACTUALIZADA"}</span>
      <h2 style="margin-top:12px">${esc(remote.title||"NOVA ULTRA")} ${UpdateState.available?`· v${esc(remote.latest)}`:`· v${APP_VERSION}`}</h2>
      <p class="muted">${esc(remote.subtitle||"Tu experiencia está al día.")}</p>
      <div class="whats-new-list">${(remote.changes||[]).map(x=>`<div class="whats-new-item"><i>✦</i><span>${esc(x)}</span></div>`).join("")}</div>
      <div class="row">
        ${UpdateState.available?`<button class="btn primary big" onclick="applyAppUpdate()">⬇ Actualizar ahora</button>`:`<button class="btn primary" onclick="checkForUpdates(true)">🔄 Buscar actualizaciones</button>`}
        <button class="btn ghost" onclick="exportData()">💾 Respaldar progreso</button>
      </div>
      <div class="notice" style="margin-top:15px">🛡️ Antes de una actualización se crea automáticamente una copia local de seguridad. Actualizar la PWA no debe borrar XP, racha, memoria ni respuestas.</div>
    </div>
    <div class="card pad"><h2>Historial</h2><div class="grid">${data.versions.map((v,i)=>`<div class="version-card ${i===0?"current":""}"><div class="spread row"><strong>v${esc(v.version)} · ${esc(v.name)}</strong>${i===0?`<span class="pill">ACTUAL</span>`:""}</div><div class="small muted" style="margin-top:7px">${(v.items||[]).slice(0,4).map(x=>`• ${esc(x)}`).join("<br>")}</div></div>`).join("")}</div></div>
  </div>`)
}
function versionFallback(){return {latest:APP_VERSION,title:"NOVA ULTRA",subtitle:"Tu experiencia está actualizada.",changes:["Marca renovada","NOVA más interactiva","Update Center seguro"]}}
window.renderUpdates=renderUpdates;

window.openWhatsNew=async()=>{
  const data=await loadChangelog(),v=data.versions?.[0]||versionFallback();
  portal.innerHTML=`<div class="modal-wrap" onclick="if(event.target===this)closeModal()"><div class="card pad modal"><div class="spread row"><div><span class="pill">✨ QUÉ HAY DE NUEVO</span><h2 style="margin-top:10px">${esc(v.name||"NOVA ULTRA")} · v${esc(v.version||APP_VERSION)}</h2></div><button class="btn icon ghost" onclick="closeModal()">✕</button></div><div class="whats-new-list">${(v.items||[]).map(x=>`<div class="whats-new-item"><i>✦</i><span>${esc(x)}</span></div>`).join("")}</div><button class="btn primary full" onclick="closeModal()">Comenzar</button></div></div>`
}

// Ambient canvas
const ambient={
  c:$("#ambientCanvas"),ctx:null,pts:[],scene:"aurora",w:0,h:0,
  init(){this.ctx=this.c.getContext("2d");this.resize();for(let i=0;i<55;i++)this.pts.push({x:Math.random()*this.w,y:Math.random()*this.h,r:.7+Math.random()*1.9,vx:(Math.random()-.5)*.14,vy:(Math.random()-.5)*.14,a:.12+Math.random()*.28});addEventListener("resize",()=>this.resize());this.loop()},
  resize(){this.w=this.c.width=innerWidth*devicePixelRatio;this.h=this.c.height=innerHeight*devicePixelRatio},
  color(){return this.scene==="boss"?"255,86,106":this.scene==="recovery"?"71,220,154":this.scene==="arena"?"177,93,255":this.scene==="debate"?"70,210,235":"116,159,255"},
  loop(){const x=this.ctx;x.clearRect(0,0,this.w,this.h);const col=this.color();for(const p of this.pts){p.x+=p.vx*devicePixelRatio;p.y+=p.vy*devicePixelRatio;if(p.x<0)p.x=this.w;if(p.x>this.w)p.x=0;if(p.y<0)p.y=this.h;if(p.y>this.h)p.y=0;x.beginPath();x.fillStyle=`rgba(${col},${p.a})`;x.arc(p.x,p.y,p.r*devicePixelRatio,0,Math.PI*2);x.fill()}requestAnimationFrame(()=>this.loop())}
};
ambient.init();
document.body.dataset.ultra="true";
try{
  render();
}catch(e){
  console.error("RETO FISCAL BOOT ERROR",e);
  showBootRecovery(e);
}
setTimeout(()=>checkForUpdates(false),900);
setTimeout(()=>maybeShowWhatsNew(),1200);


function maybeShowWhatsNew(){
  if(!user)return;
  const seen=localStorage.getItem("rfsolo_seen_version");
  if(seen!==APP_VERSION){
    localStorage.setItem("rfsolo_seen_version",APP_VERSION);
    setTimeout(()=>openWhatsNew(),900)
  }
}
