import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// ====== إعدادات Firebase الخاصة بمشروعك ======
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// تهيئة Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ====== أدوار اللعبة ======
const ROLES = {
  mafia:   { name: "المافيا", img: "images/mafia.jpeg",  cls: "mafia",   icon: "💀" },
  nurse:   { name: "الممرضة", img: "images/nurse.jpeg",  cls: "nurse",   icon: "💉" },
  sheikh:  { name: "الشيخ",   img: "images/shekh.jpeg",  cls: "sheikh",  icon: "📖" },
  citizen: { name: "المواطن", img: "images/people.jpeg", cls: "citizen", icon: "👤" },
};

// ====== حالة اللعبة المحلية (Local State) ======
let state = {
  phase: "lobby",         // lobby | setup | assign | night | day
  players: [],            // {id, name, role, alive}
  mafiaCount: 1,
  reveal: {},
  round: 1,
  nightStep: "mafia",
  mafiaTarget: null,
  nurseTarget: null,
  sheikhTarget: null,
  sheikhResultText: "",
  nightLog: [],
  dayLog: [],
  winner: null,
};

// متغيرات تعريفية للاعب الحالي
let roomId = "";
let localPlayerId = ""; 
let isHost = false;

const uid = () => Math.random().toString(36).slice(2, 10);
const $app = document.getElementById("app");
const $phaseLabel = document.getElementById("phaseLabel");
const $roomDisplay = document.getElementById("roomDisplay");
const $resetBtn = document.getElementById("resetBtn");

$resetBtn.onclick = resetAll;

// تصفير اللعبة وإرسال التحديث للسيرفر
async function resetAll() {
  if (!isHost) return;
  if (state.players.length && !confirm("إعادة تعيين اللعبة بالكامل؟")) return;
  
  const clearedState = {
    phase: "setup", players: [], mafiaCount: 1, reveal: {},
    round: 1, nightStep: "mafia",
    mafiaTarget: null, nurseTarget: null, sheikhTarget: null,
    sheikhResultText: "", nightLog: [], dayLog: [], winner: null,
  };
  await updateDoc(doc(db, "rooms", roomId), clearedState);
}

// تحديث البيانات على الـ Firebase Firestore
async function syncWithFirebase() {
  if (roomId) {
    await setDoc(doc(db, "rooms", roomId), state);
  }
}

function checkWinner() {
  const alive = state.players.filter(p => p.alive);
  const mafia = alive.filter(p => p.role === "mafia").length;
  const others = alive.length - mafia;
  if (mafia === 0) state.winner = "المواطنون";
  else if (mafia >= others) state.winner = "المافيا";
  else state.winner = null;
}

function getNextNightStep(currentStep) {
  const steps = ["mafia", "nurse", "sheikh"];
  let idx = steps.indexOf(currentStep);
  while (idx < steps.length - 1) {
    idx++;
    const nextRole = steps[idx];
    const isRoleAlive = state.players.some(p => p.role === nextRole && p.alive);
    if (isRoleAlive) return nextRole;
  }
  return null;
}

// الاستماع الفوري للتغييرات القادمة من السيرفر
function listenToRoom(id) {
  onSnapshot(doc(db, "rooms", id), (docSnap) => {
    if (docSnap.exists()) {
      state = docSnap.data();
      render();
    }
  });
}

// ====== دالة العرض الرئيسية ======
function render() {
  if (state.phase === "lobby") {
    $phaseLabel.textContent = "دخول اللعبة";
    $roomDisplay.textContent = "";
    $resetBtn.style.display = "none";
    renderLobby();
    return;
  }

  $resetBtn.style.display = isHost ? "block" : "none";
  $roomDisplay.textContent = `رقم الغرفة الموحد: ${roomId} ${isHost ? '(أنت المسؤول 👑)' : '(لاعب 👤)'}`;

  const labels = {
    setup: "تسجيل الانضمام واستعداد اللاعبين",
    assign: "استلام الأدوار السرية",
    night: `العرض ليلاً - الليلة ${state.round}`,
    day: `أحداث النهار - النهار ${state.round}`,
  };
  $phaseLabel.textContent = labels[state.phase];

  $app.innerHTML = "";
  if (state.phase === "setup") renderSetup();
  else if (state.phase === "assign") renderAssign();
  else if (state.phase === "night") renderNight();
  else if (state.phase === "day") renderDay();

  if (state.winner) renderWinner();
}

// ---------- 0. LOBBY الشاشة الابتدائية ----------
function renderLobby() {
  $app.innerHTML = `
    <div class="card">
      <h2 class="section-title">🎲 إنشاء أو دخول غرفة</h2>
      <div class="divider">
        <button class="btn btn-gradient btn-lg" id="createRoomBtn">👑 إنشاء غرفة جديدة (Host)</button>
      </div>
      <div class="divider" style="margin-top:2rem;">
        <p style="text-align:center; color:var(--muted)">أو انضم لغرفة أصدقائك:</p>
        <input id="roomCodeInput" class="input" placeholder="أدخل رمز الغرفة (مثال: ab12)" style="text-align:center; text-transform:lowercase;" />
        <input id="playerNameInput" class="input" placeholder="اسمك الشخصي في اللعبة" style="text-align:center; margin-top:0.5rem;" />
        <button class="btn btn-primary" id="joinRoomBtn" style="margin-top:0.5rem;">🔗 انضمام للغرفة</button>
      </div>
    </div>
  `;

  $app.querySelector("#createRoomBtn").onclick = async () => {
    roomId = uid().slice(0, 4); // رمز مكون من 4 خانات لسهولة النقل
    localPlayerId = "host";
    isHost = true;
    state.phase = "setup";
    await syncWithFirebase();
    listenToRoom(roomId);
  };

  $app.querySelector("#joinRoomBtn").onclick = async () => {
    const rCode = $app.querySelector("#roomCodeInput").value.trim().toLowerCase();
    const pName = $app.querySelector("#playerNameInput").value.trim();
    if (!rCode || !pName) return alert("الرجاء إدخال رمز الغرفة واسمك");

    roomId = rCode;
    localPlayerId = uid();
    isHost = false;

    // جلب البيانات الحالية من السيرفر لإضافة اللاعب الجديد إليها
    onSnapshot(doc(db, "rooms", roomId), async (docSnap) => {
      if (!docSnap.exists()) return alert("الغرفة غير موجودة!");
      const serverState = docSnap.data();
      
      // تجنب التكرار اللانهائي عند الإضافة
      const alreadyIn = serverState.players.some(p => p.name === pName);
      if (!alreadyIn && serverState.phase === "setup") {
        serverState.players.push({ id: localPlayerId, name: pName, role: null, alive: true });
        await setDoc(doc(db, "rooms", roomId), serverState);
      }
    }, { onlyOnce: true });

    listenToRoom(roomId);
  };
}

// ---------- 1. SETUP ----------
function renderSetup() {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h2 class="section-title">👥 اللاعبون المتصلون حالياً (${state.players.length})</h2>
    <div class="players-grid" id="playersGrid"></div>
    ${isHost ? `
      <div class="divider">
        <label>عدد المافيا المطلوبة: <strong style="color:var(--primary)">${state.mafiaCount}</strong></label>
        <div class="mafia-count">
          ${[1,2,3].map(n => `<button class="count-btn ${state.mafiaCount===n?'active':''}" data-n="${n}">${n}</button>`).join("")}
        </div>
        <button class="btn btn-gradient btn-lg" id="assignBtn" ${state.players.length<4?'disabled':''}>
          🎲 توزيع الأدوار عشوائياً لباقي الأجهزة
        </button>
        ${state.players.length<4?'<p class="hint">تحتاج على الأقل 4 لاعبين للبدء</p>':''}
      </div>
    ` : `<p class="hint" style="text-align:center; animation: pulse 1.5s infinite;">بانتظار قيام الـ Host بتوزيع الأدوار وبدء اللعبة...</p>`}
  `;
  $app.appendChild(card);

  const grid = card.querySelector("#playersGrid");
  state.players.forEach((p, i) => {
    const el = document.createElement("div");
    el.className = "player-chip";
    el.innerHTML = `<span><span class="idx">${i+1}.</span>${p.name} ${p.id === localPlayerId ? '(أنت)' : ''}</span>`;
    grid.appendChild(el);
  });

  if (isHost) {
    card.querySelectorAll(".count-btn").forEach(b => {
      b.onclick = async () => { state.mafiaCount = +b.dataset.n; await syncWithFirebase(); };
    });
    card.querySelector("#assignBtn").onclick = assignRoles;
  }
}

async function assignRoles() {
  const n = state.players.length;
  if (n < 4) return alert("تحتاج على الأقل 4 لاعبين");
  const roles = [];
  const m = Math.min(state.mafiaCount, Math.max(1, Math.floor(n / 3)));
  for (let i = 0; i < m; i++) roles.push("mafia");
  roles.push("nurse", "sheikh");
  while (roles.length < n) roles.push("citizen");

  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  state.players = state.players.map((p, i) => ({ ...p, role: roles[i], alive: true }));
  state.reveal = {};
  state.phase = "assign";
  await syncWithFirebase();
}

// ---------- 2. ASSIGN ----------
function renderAssign() {
  const myData = state.players.find(p => p.id === localPlayerId);
  const card = document.createElement("div");
  card.className = "card";
  
  if (isHost) {
    card.innerHTML = `
      <h2 class="section-title">🎭 شاشة الإشراف (الـ Host)</h2>
      <p style="text-align:center;color:var(--muted);font-size:0.9rem">اللاعبون يستلمون أدوارهم الآن بشكل سري على أجهزتهم الخاصة.</p>
      <button class="btn btn-primary btn-lg" id="startBtn" style="margin-top:1.5rem">▶ بدء الليلة الأولى للأجهزة</button>
    `;
    card.querySelector("#startBtn").onclick = async () => {
      state.phase = "night";
      const initialStep = state.players.some(p => p.role === "mafia" && p.alive) ? "mafia" : getNextNightStep("mafia");
      state.nightStep = initialStep || "mafia"; 
      state.round = 1;
      state.nightLog = []; state.dayLog = []; state.sheikhResultText = "";
      state.mafiaTarget = state.nurseTarget = state.sheikhTarget = null;
      await syncWithFirebase();
    };
  } else if (myData) {
    const meta = ROLES[myData.role];
    const revealed = state.reveal[localPlayerId];
    card.innerHTML = `
      <h2 class="section-title">🕵️ دورك السري الخاص</h2>
      <div style="text-align:center; margin: 2rem 0;">
        ${revealed ? `
          <img src="${meta.img}" alt="${meta.name}" style="width:120px; height:120px; border-radius:10px; border:3px solid var(--primary);" />
          <h1 class="${meta.cls}" style="margin-top:1rem;">${meta.icon} ${meta.name}</h1>
        ` : `
          <div class="role-placeholder" style="font-size:4rem; cursor:pointer;" id="revealBtn">👁️</div>
          <p style="color:var(--muted)">انقر لكشف هويتك الحقيقية (لا تدع جيرانك يرون الشاشة!)</p>
        `}
      </div>
    `;
    const btn = card.querySelector("#revealBtn");
    if(btn) btn.onclick = async () => {
      state.reveal[localPlayerId] = true;
      await syncWithFirebase();
    };
  }
  $app.appendChild(card);
}

// ---------- 3. NIGHT ----------
function renderNight() {
  const myData = state.players.find(p => p.id === localPlayerId);
  const curStepRole = state.nightStep; 
  const meta = ROLES[curStepRole];
  const card = document.createElement("div");
  card.className = "card";

  // هل اللاعب الحالي هو صاحب الصلاحية للتحرك بهذه الخطوة من الليل؟
  const isMyTurn = myData && myData.role === curStepRole && myData.alive;

  if (isHost) {
    // الـ Host يدير الخطوات فقط دون الاضطرار للتصويت بنفسه إلا لو كان لاعباً مشاركاً
    card.innerHTML = `
      <h2 class="section-title">🌙 الليل تحت الإدارة (الجولة ${state.round})</h2>
      <div class="role-banner">
         <div class="role-title">${meta.icon} الدور الحالي الآن في الغرفة: [ ${meta.name} ]</div>
         <p style="color:var(--muted)">اللاعب ذو هذا الدور يختار هدفه من جهازه الآن.</p>
      </div>
      <div class="actions-row" style="margin-top:2rem">
         <button class="btn btn-gradient" id="forceNextBtn">تخطي / تسيير الخطوة التالية لـ ${meta.name} ➡️</button>
      </div>
    `;
    card.querySelector("#forceNextBtn").onclick = nextNightStepAction;
  } else if (isMyTurn) {
    // شاشة التفاعل للبطل الحقيقي (المافيا أو الممرضة أو الشيخ)
    const currentTarget = state[curStepRole + "Target"];
    card.innerHTML = `
      <div class="role-banner">
        <img src="${meta.img}" alt="${meta.name}" />
        <div>
          <div class="role-title">${meta.icon} حان دورك السري: ${meta.name}</div>
          <div class="role-desc">اختر أحد الأهداف من القائمة بالأسفل لتنفيذ مهتك السريّة:</div>
        </div>
      </div>
      <div class="target-grid" id="targetGrid"></div>
      ${state.nightStep === 'sheikh' && state.sheikhResultText ? `<div class="log-item" style="color:var(--gold); font-weight:bold; text-align:center;">${state.sheikhResultText}</div>` : ''}
    `;
    
    const grid = card.querySelector("#targetGrid");
    state.players.filter(p => p.alive).forEach(p => {
      const b = document.createElement("button");
      b.className = "target-btn" + (currentTarget === p.id ? " selected" : "");
      b.textContent = p.name;
      b.onclick = async () => {
        state[curStepRole + "Target"] = p.id;
        if (state.nightStep === "sheikh") {
          state.sheikhResultText = `🔍 كشف سري: دور [ ${p.name} ] هو ${ROLES[p.role].name}`;
        }
        await syncWithFirebase();
      };
      grid.appendChild(b);
    });
  } else {
    // شاشة بقية اللاعبين (المواطنين أو أصحاب الأدوار الأخرى) -> شاشة نوم
    card.innerHTML = `
      <div style="text-align:center; padding: 3rem 0;">
        <div style="font-size: 5rem; animation: floating 2s infinite ease-in-out;">💤</div>
        <h2 style="color:var(--muted)">البلدة نائمة الآن...</h2>
        <p style="font-size:0.9rem; color:var(--primary)">الرجاء إغلاق عينيك وعدم التحدث حتى الصباح.</p>
      </div>
    `;
  }
  $app.appendChild(card);
}

async function nextNightStepAction() {
  const nextStep = getNextNightStep(state.nightStep);
  if (nextStep) {
    state.nightStep = nextStep;
    await syncWithFirebase();
  } else {
    resolveNight();
  }
}

async function resolveNight() {
  const logs = [];
  if (state.mafiaTarget) {
    const victim = state.players.find(p => p.id === state.mafiaTarget);
    if (state.nurseTarget === state.mafiaTarget) {
      logs.push(`🛡️ حاولت المافيا تصفية أحد السكان، ولكن تدخلت الممرضة في الوقت المناسب وأنقذت حياته!`);
    } else {
      victim.alive = false;
      logs.push(`💀 استفاق السكان على فاجعة.. عُثر على جثة [ ${victim.name} ] مقتولاً في فراشه!`);
    }
  } else {
    logs.push("🌙 مرت هذه الليلة بسلام وهدوء غير معتاد دون سقوط ضحايا.");
  }

  state.nightLog = logs;
  state.phase = "day";
  checkWinner();
  await syncWithFirebase();
}

// ---------- 4. DAY ----------
function renderDay() {
  const alive = state.players.filter(p => p.alive);
  const dead = state.players.filter(p => !p.alive);
  const myData = state.players.find(p => p.id === localPlayerId);

  const nightCard = document.createElement("div");
  nightCard.className = "card";
  nightCard.innerHTML = `
    <h2 class="section-title">☀ أحداث الليلة الماضية</h2>
    ${state.nightLog.length ? state.nightLog.map(l => `<div class="log-item">${l}</div>`).join("") : '<p style="color:var(--muted)">لا توجد أحداث</p>'}
  `;
  $app.appendChild(nightCard);

  if (!state.winner) {
    const voteCard = document.createElement("div");
    voteCard.className = "card";
    voteCard.innerHTML = `
      <h2 class="section-title">⚖ محاكمة الشعب العلنية</h2>
      <p style="color:var(--muted); font-size:0.85rem; text-align:center;">تناقشوا معاً علنياً، وعند اتفاق الأغلبية يضغط الـ Host على خيار "نفي اللاعب".</p>
      ${isHost ? `<div class="vote-grid" id="voteGrid"></div>` : `<div class="log-item" style="text-align:center; color:var(--sky)">بانتظار تصويتكم الشفهي وقرار الـ Host النهائي...</div>`}
      ${state.dayLog.length ? `<div class="divider">${state.dayLog.map(l => `<div class="log-item" style="border-color:var(--primary); color:var(--primary);">${l}</div>`).join("")}</div>` : ""}
    `;
    $app.appendChild(voteCard);

    if (isHost) {
      const vg = voteCard.querySelector("#voteGrid");
      alive.forEach(p => {
        const b = document.createElement("button");
        b.className = "btn btn-outline";
        b.style.justifyContent = "space-between";
        b.innerHTML = `<span>${p.name}</span><span style="color:var(--primary)">⚖ إخراج من القرية</span>`;
        b.onclick = async () => {
          if(confirm(`هل صوّتت الأغلبية على نفي وإقصاء ${p.name}؟`)) {
            p.alive = false;
            state.dayLog = [`⚖ قرر الشعب بالـإجماع إعدام [ ${p.name} ]، وتبيّن للعلن أن هويته: (${ROLES[p.role].name})`];
            checkWinner();
            await syncWithFirebase();
          }
        };
        vg.appendChild(b);
      });
    }
  }

  if (dead.length) {
    const deadCard = document.createElement("div");
    deadCard.className = "card";
    deadCard.innerHTML = `
      <h2 class="section-title" style="color:var(--muted);font-size:0.9rem">مقبرة القرية (الأموات والمقصيين)</h2>
      <div class="dead-list">
        ${dead.map(p => `<span class="dead-badge">${p.name} — ${ROLES[p.role].name}</span>`).join("")}
      </div>
    `;
    $app.appendChild(deadCard);
  }

  // إذا كنت لاعب ميت، تظهر لك واجهة متفرج
  if (myData && !myData.alive && !state.winner) {
     const deadNotice = document.createElement("div");
     deadNotice.className = "log-item";
     deadNotice.style = "background:#2b1a1a; color:var(--primary); text-align:center; font-weight:bold; margin-top:1rem;";
     deadNotice.textContent = "👻 لقد قُتلت! يمكنك الآن متابعة أحداث اللعبة من جهازك كشبح متفرج بصمت.";
     $app.appendChild(deadNotice);
  }

  if (isHost && !state.winner) {
    const nextBtn = document.createElement("button");
    nextBtn.className = "btn btn-primary btn-lg";
    nextBtn.style = "margin-top:1.5rem; width:100%;";
    nextBtn.innerHTML = "🌙 إعلان غياب الشمس وبدء ليلة جديدة";
    nextBtn.onclick = async () => {
      state.round++;
      state.mafiaTarget = state.nurseTarget = state.sheikhTarget = null;
      state.sheikhResultText = "";
      state.dayLog = [];
      const firstStep = state.players.some(p => p.role === "mafia" && p.alive) ? "mafia" : getNextNightStep("mafia");
      if(firstStep) {
         state.nightStep = firstStep;
         state.phase = "night";
      } else {
         resolveNight();
      }
      await syncWithFirebase();
    };
    $app.appendChild(nextBtn);
  }
}

function renderWinner() {
  const c = document.createElement("div");
  c.className = "card winner-card";
  c.innerHTML = `
    <div class="winner-crown">👑</div>
    <div class="winner-title">انتهت الجولات وفاز [ ${state.winner} ]!</div>
    ${isHost ? `<button class="btn btn-primary" id="newGameBtn">بدء دورة سحابية جديدة</button>` : `<p style="color:var(--muted); text-align:center;">بانتظار أن يضغط الـ Host على بدء دورة جديدة...</p>`}
  `;
  if(isHost) {
     c.querySelector("#newGameBtn").onclick = resetAll;
  }
  $app.appendChild(c);
}

// البدء بتشغيل شاشة الدخول أولاً
render();