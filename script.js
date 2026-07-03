// ===== Mafia Game =====

const ROLES = {
  mafia:   { name: "المافيا", img: "images/mafia.jpeg",  cls: "mafia",   icon: "💀" },
  nurse:   { name: "الممرضة", img: "images/nurse.jpeg",  cls: "nurse",   icon: "💉" },
  sheikh:  { name: "الشيخ",   img: "images/shekh.jpeg",  cls: "sheikh",  icon: "📖" },
  citizen: { name: "المواطن", img: "images/people.jpeg", cls: "citizen", icon: "👤" },
};

const state = {
  phase: "setup",         // setup | assign | night | day
  players: [],            // {id, name, role, alive}
  mafiaCount: 1,
  reveal: {},             // {playerId: bool}
  round: 1,
  nightStep: "mafia",     // mafia | nurse | sheikh
  mafiaTarget: null,
  nurseTarget: null,
  sheikhTarget: null,
  nightLog: [],
  dayLog: [],
  winner: null,
};

const uid = () => Math.random().toString(36).slice(2, 10);
const $app = document.getElementById("app");
const $phaseLabel = document.getElementById("phaseLabel");
document.getElementById("resetBtn").onclick = resetAll;

function resetAll() {
  if (state.players.length && !confirm("إعادة تعيين اللعبة بالكامل؟")) return;
  Object.assign(state, {
    phase: "setup", players: [], mafiaCount: 1, reveal: {},
    round: 1, nightStep: "mafia",
    mafiaTarget: null, nurseTarget: null, sheikhTarget: null,
    nightLog: [], dayLog: [], winner: null,
  });
  render();
}

function checkWinner() {
  const alive = state.players.filter(p => p.alive);
  const mafia = alive.filter(p => p.role === "mafia").length;
  const others = alive.length - mafia;
  if (mafia === 0) state.winner = "المواطنون";
  else if (mafia >= others) state.winner = "المافيا";
  else state.winner = null;
}

function render() {
  const labels = {
    setup: "تسجيل اللاعبين",
    assign: "توزيع الأدوار",
    night: `الليلة ${state.round}`,
    day: `النهار ${state.round}`,
  };
  $phaseLabel.textContent = labels[state.phase];

  $app.innerHTML = "";
  if (state.phase === "setup") renderSetup();
  else if (state.phase === "assign") renderAssign();
  else if (state.phase === "night") renderNight();
  else if (state.phase === "day") renderDay();

  if (state.winner) renderWinner();
}

// ---------- SETUP ----------
function renderSetup() {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h2 class="section-title">👥 اللاعبون (${state.players.length})</h2>
    <div class="row">
      <input id="nameInput" class="input" placeholder="اسم اللاعب" />
      <button class="btn btn-primary" id="addBtn">إضافة</button>
    </div>
    <div class="players-grid" id="playersGrid"></div>
    <div class="divider">
      <label>عدد المافيا: <strong style="color:var(--primary)">${state.mafiaCount}</strong></label>
      <div class="mafia-count">
        ${[1,2,3].map(n => `<button class="count-btn ${state.mafiaCount===n?'active':''}" data-n="${n}">${n}</button>`).join("")}
      </div>
      <button class="btn btn-gradient btn-lg" id="assignBtn" ${state.players.length<4?'disabled':''}>
        🎲 توزيع الأدوار
      </button>
      ${state.players.length<4?'<p class="hint">تحتاج على الأقل 4 لاعبين</p>':''}
    </div>
  `;
  $app.appendChild(card);

  const grid = card.querySelector("#playersGrid");
  state.players.forEach((p, i) => {
    const el = document.createElement("div");
    el.className = "player-chip";
    el.innerHTML = `<span><span class="idx">${i+1}.</span>${p.name}</span><button class="remove-btn">🗑</button>`;
    el.querySelector(".remove-btn").onclick = () => {
      state.players = state.players.filter(x => x.id !== p.id);
      render();
    };
    grid.appendChild(el);
  });

  const input = card.querySelector("#nameInput");
  const add = () => {
    const name = input.value.trim();
    if (!name) return;
    state.players.push({ id: uid(), name, role: null, alive: true });
    input.value = "";
    render();
    document.getElementById("nameInput")?.focus();
  };
  card.querySelector("#addBtn").onclick = add;
  input.onkeydown = e => { if (e.key === "Enter") add(); };
  input.focus();

  card.querySelectorAll(".count-btn").forEach(b => {
    b.onclick = () => { state.mafiaCount = +b.dataset.n; render(); };
  });

  card.querySelector("#assignBtn").onclick = assignRoles;
}

function assignRoles() {
  const n = state.players.length;
  if (n < 4) return alert("تحتاج على الأقل 4 لاعبين");
  const roles = [];
  const m = Math.min(state.mafiaCount, Math.max(1, Math.floor(n / 3)));
  for (let i = 0; i < m; i++) roles.push("mafia");
  roles.push("nurse", "sheikh");
  while (roles.length < n) roles.push("citizen");
  // shuffle
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  state.players = state.players.map((p, i) => ({ ...p, role: roles[i], alive: true }));
  state.reveal = {};
  state.phase = "assign";
  render();
}

// ---------- ASSIGN ----------
function renderAssign() {
  const info = document.createElement("div");
  info.className = "card";
  info.innerHTML = `<p style="text-align:center;color:var(--muted);font-size:0.9rem">اضغط على 👁 لكشف الدور لكل لاعب. يمكن للهوست تغيير الدور يدوياً.</p>`;
  $app.appendChild(info);

  const grid = document.createElement("div");
  grid.className = "cards-grid";
  state.players.forEach(p => {
    const revealed = state.reveal[p.id];
    const meta = ROLES[p.role];
    const card = document.createElement("div");
    card.className = "role-card";
    card.innerHTML = `
      <div class="role-card-header">
        <span>${p.name}</span>
        <button class="eye-btn">${revealed?"🙈":"👁"}</button>
      </div>
      ${revealed
        ? `<div class="role-image-wrap">
            <img src="${meta.img}" alt="${meta.name}" />
            <div class="overlay"></div>
            <div class="role-name ${meta.cls}">${meta.name}</div>
          </div>`
        : `<div class="role-placeholder">💀</div>`}
      <div class="role-picker">
        ${Object.keys(ROLES).map(r => `
          <button data-role="${r}" class="${p.role===r?'active':''}">${ROLES[r].name}</button>
        `).join("")}
      </div>
    `;
    card.querySelector(".eye-btn").onclick = () => {
      state.reveal[p.id] = !state.reveal[p.id];
      render();
    };
    card.querySelectorAll(".role-picker button").forEach(b => {
      b.onclick = () => {
        p.role = b.dataset.role;
        render();
      };
    });
    grid.appendChild(card);
  });
  $app.appendChild(grid);

  const actions = document.createElement("div");
  actions.className = "actions-row";
  actions.innerHTML = `
    <button class="btn btn-outline" id="reshuffleBtn">🎲 إعادة التوزيع</button>
    <button class="btn btn-primary btn-lg" id="startBtn" style="width:auto;flex:1">▶ بدء اللعبة</button>
  `;
  actions.querySelector("#reshuffleBtn").onclick = assignRoles;
  actions.querySelector("#startBtn").onclick = () => {
    state.phase = "night";
    state.nightStep = "mafia";
    state.round = 1;
    state.nightLog = [];
    state.dayLog = [];
    state.mafiaTarget = state.nurseTarget = state.sheikhTarget = null;
    render();
  };
  $app.appendChild(actions);
}

// ---------- NIGHT ----------
function renderNight() {
  const alive = state.players.filter(p => p.alive);
  const steps = [
    { key: "mafia",  role: "mafia",  label: "دور المافيا", desc: "اختر الشخص الذي ستقتله المافيا", target: "mafiaTarget" },
    { key: "nurse",  role: "nurse",  label: "دور الممرضة", desc: "اختر الشخص الذي ستعالجه الممرضة", target: "nurseTarget" },
    { key: "sheikh", role: "sheikh", label: "دور الشيخ",   desc: "اختر الشخص الذي يريد الشيخ معرفة دوره", target: "sheikhTarget" },
  ];
  const idx = steps.findIndex(s => s.key === state.nightStep);
  const cur = steps[idx];
  const meta = ROLES[cur.role];
  const currentTarget = state[cur.target];

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem">
      <span>🌙</span>
      <span style="color:var(--muted);font-size:0.9rem">مرحلة الليل</span>
      <div class="progress-bar">
        ${steps.map((_, i) => `<div class="seg ${i<=idx?'active':''}"></div>`).join("")}
      </div>
    </div>
    <div class="role-banner">
      <img src="${meta.img}" alt="${meta.name}" />
      <div>
        <div class="role-title" style="color:var(--${meta.cls==='mafia'?'primary':meta.cls==='sheikh'?'gold':meta.cls==='nurse'?'sky':'muted'})">
          ${meta.icon} ${cur.label}
        </div>
        <div class="role-desc">${cur.desc}</div>
      </div>
    </div>
    <div class="target-grid" id="targetGrid"></div>
    <div class="actions-row">
      <button class="btn btn-outline" id="clearBtn" ${!currentTarget?'disabled':''}>إلغاء الاختيار</button>
      <button class="btn ${idx===steps.length-1?'btn-gradient btn-lg':'btn-primary'}" id="nextBtn" style="flex:1;width:auto">
        ${idx===steps.length-1 ? '☀ انتهاء الليل وبدء النهار' : `التالي: ${steps[idx+1].label}`}
      </button>
    </div>
  `;
  $app.appendChild(card);

  const grid = card.querySelector("#targetGrid");
  alive.forEach(p => {
    const b = document.createElement("button");
    b.className = "target-btn" + (currentTarget === p.id ? " selected" : "");
    b.textContent = p.name;
    b.onclick = () => { state[cur.target] = p.id; render(); };
    grid.appendChild(b);
  });

  card.querySelector("#clearBtn").onclick = () => { state[cur.target] = null; render(); };
  card.querySelector("#nextBtn").onclick = () => {
    if (idx < steps.length - 1) {
      state.nightStep = steps[idx + 1].key;
      render();
    } else {
      resolveNight();
    }
  };
}

function resolveNight() {
  const logs = [];
  if (state.mafiaTarget) {
    const victim = state.players.find(p => p.id === state.mafiaTarget);
    if (state.nurseTarget === state.mafiaTarget) {
      logs.push(`🛡 استهدفت المافيا ${victim.name} لكن الممرضة عالجته وبقي على قيد الحياة`);
    } else {
      victim.alive = false;
      logs.push(`💀 قُتل ${victim.name} على يد المافيا`);
    }
  } else {
    logs.push("🌙 لم تختر المافيا هدفاً هذه الليلة");
  }
  if (state.sheikhTarget) {
    const t = state.players.find(p => p.id === state.sheikhTarget);
    logs.push(`📖 سأل الشيخ عن ${t.name} — دوره: ${ROLES[t.role].name}`);
  }
  state.nightLog = logs;
  state.phase = "day";
  checkWinner();
  render();
}

// ---------- DAY ----------
function renderDay() {
  const alive = state.players.filter(p => p.alive);
  const dead = state.players.filter(p => !p.alive);

  const nightCard = document.createElement("div");
  nightCard.className = "card";
  nightCard.innerHTML = `
    <h2 class="section-title">☀ أحداث الليلة</h2>
    ${state.nightLog.length ? state.nightLog.map(l => `<div class="log-item">${l}</div>`).join("") : '<p style="color:var(--muted);font-size:0.9rem">لا شيء</p>'}
  `;
  $app.appendChild(nightCard);

  if (!state.winner) {
    const voteCard = document.createElement("div");
    voteCard.className = "card";
    voteCard.innerHTML = `
      <h2 class="section-title">⚖ تصويت الشعب — من يخرج؟</h2>
      <div class="vote-grid" id="voteGrid"></div>
      ${state.dayLog.length ? `<div class="divider">${state.dayLog.map(l => `<div class="log-item">${l}</div>`).join("")}</div>` : ""}
    `;
    $app.appendChild(voteCard);
    const vg = voteCard.querySelector("#voteGrid");
    alive.forEach(p => {
      const b = document.createElement("button");
      b.className = "btn btn-outline";
      b.style.justifyContent = "space-between";
      b.innerHTML = `<span>${p.name}</span><span style="color:var(--primary)">🗑</span>`;
      b.onclick = () => {
        p.alive = false;
        state.dayLog.unshift(`⚖ صوّت الشعب على إخراج ${p.name} (${ROLES[p.role].name})`);
        checkWinner();
        render();
      };
      vg.appendChild(b);
    });
  }

  if (dead.length) {
    const deadCard = document.createElement("div");
    deadCard.className = "card";
    deadCard.innerHTML = `
      <h2 class="section-title" style="color:var(--muted);font-size:0.9rem">الخارجون من اللعبة</h2>
      <div class="dead-list">
        ${dead.map(p => `<span class="dead-badge">${p.name} — ${ROLES[p.role].name}</span>`).join("")}
      </div>
    `;
    $app.appendChild(deadCard);
  }

  if (!state.winner) {
    const nextBtn = document.createElement("button");
    nextBtn.className = "btn btn-primary btn-lg";
    nextBtn.innerHTML = "🌙 ابدأ الليلة التالية";
    nextBtn.onclick = () => {
      state.round++;
      state.mafiaTarget = state.nurseTarget = state.sheikhTarget = null;
      state.nightStep = "mafia";
      state.phase = "night";
      render();
    };
    $app.appendChild(nextBtn);
  }
}

function renderWinner() {
  const c = document.createElement("div");
  c.className = "card winner-card";
  c.innerHTML = `
    <div class="winner-crown">👑</div>
    <div class="winner-title">فاز ${state.winner}!</div>
    <button class="btn btn-primary" id="newGameBtn">لعبة جديدة</button>
  `;
  c.querySelector("#newGameBtn").onclick = resetAll;
  $app.appendChild(c);
}

render();
