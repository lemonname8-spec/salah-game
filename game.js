(() => {
  "use strict";

  // ===== Utils =====
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const nowMs = () => performance.now();

  // ===== DOM =====
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  const overlay = document.getElementById("overlay");
  const panelTitle = document.getElementById("panelTitle");
  const panelHint = document.getElementById("panelHint");
  const footerHint = document.getElementById("footerHint");

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");

  const hudMini = document.getElementById("hudMini");
  const scoreMini = document.getElementById("scoreMini");
  const bestMini = document.getElementById("bestMini");

  const btnPlay = document.getElementById("btnPlay");
  const btnRestart = document.getElementById("btnRestart");

  const speedRange = document.getElementById("speed");
  const speedVal = document.getElementById("speedVal");
  const difficultySel = document.getElementById("difficulty");
  const skinSel = document.getElementById("skin");
  const toggleObstacles = document.getElementById("toggleObstacles");
  const togglePowerups = document.getElementById("togglePowerups");

  const touchControls = document.getElementById("touchControls");
  const tcPause = document.getElementById("tcPause");
  const tcUp = document.getElementById("tcUp");
  const tcDown = document.getElementById("tcDown");
  const tcLeft = document.getElementById("tcLeft");
  const tcRight = document.getElementById("tcRight");

  // ===== Storage =====
  const STORAGE_BEST_KEY = "advanced_snake_best_v2";
  const STORAGE_SKIN_KEY = "advanced_snake_skin_v2";

  let bestScore = Number(localStorage.getItem(STORAGE_BEST_KEY) || 0);
  bestEl.textContent = String(bestScore);
  bestMini.textContent = String(bestScore);

  // ===== Skins =====
  const SKINS = {
    neon:   { body:["#7cf4c5","#7aa8ff"], glow:"rgba(124,244,197,0.28)", particle:"rgba(122,168,255,0.22)", head:"#e8eefc", eye:"rgba(0,0,0,0.55)" },
    toxic:  { body:["#7CFF6B","#00D18C"], glow:"rgba(124,255,107,0.24)", particle:"rgba(0,209,140,0.18)", head:"#EFFFF2", eye:"rgba(0,0,0,0.55)" },
    fire:   { body:["#FFB86B","#FF3D6E"], glow:"rgba(255,77,66,0.20)",  particle:"rgba(255,184,107,0.18)", head:"#FFF1E6", eye:"rgba(0,0,0,0.55)" },
    ice:    { body:["#8CEBFF","#4E7CFF"], glow:"rgba(140,235,255,0.20)", particle:"rgba(78,124,255,0.16)", head:"#F3FBFF", eye:"rgba(0,0,0,0.55)" },
    gold:   { body:["#FFE08A","#FFB703"], glow:"rgba(255,183,3,0.20)",  particle:"rgba(255,224,138,0.16)", head:"#FFF7DB", eye:"rgba(0,0,0,0.55)" },
    carbon: { body:["#C9D6FF","#3E4A61"], glow:"rgba(201,214,255,0.14)", particle:"rgba(62,74,97,0.18)", head:"#EAEFFC", eye:"rgba(0,0,0,0.55)" },
  };

  // ===== Board =====
  // We render full-screen, but keep game grid stable.
  const BOARD = { cols: 34, rows: 19 }; // ~16:9 feel (34x19)

  const COLORS = {
    bgA: "#0b1020",
    bgB: "#070912",
    grid: "rgba(255,255,255,0.05)",
    apple: "#ff5d6c",
    appleGlow: "rgba(255,93,108,0.35)",
    obstacle: "rgba(255,255,255,0.13)",
    text: "rgba(232,238,252,0.90)",
  };

  // ===== Powerups =====
  const POWERUP_TYPES = [
    { id: "shield", duration: 6500 },
    { id: "slow", duration: 6500 },
    { id: "magnet", duration: 6500 },
  ];

  // ===== Audio (tiny beeps) =====
  let audioCtx = null;
  function beep(type="sine", freq=440, dur=0.06, gain=0.055) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + dur);
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    } catch {}
  }

  // ===== State =====
  const state = {
    running: true,
    paused: true,     // we start in menu
    gameOver: false,

    lastTs: 0,
    accumulator: 0,

    baseStepsPerSecond: 10,
    stepsPerSecond: 10,

    difficulty: "normal",
    obstaclesOn: true,
    powerupsOn: true,

    skinId: "neon",

    score: 0,

    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    segments: [],
    renderPts: [],
    grow: 0,

    apple: null,
    obstacles: [],
    powerups: [],

    particles: [],
    shake: 0,

    effects: { shield: 0, slow: 0, magnet: 0 },

    playingUI: false, // toggles HUD/controls visibility
  };

  // ===== Sizing: keep 16:9 logical surface inside any screen =====
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const sw = window.innerWidth;
    const sh = window.innerHeight;

    // target aspect 16:9
    const target = 16/9;
    let w = sw, h = sh;
    const aspect = sw / sh;

    if (aspect > target) {
      // screen is wider -> fit height
      h = sh;
      w = h * target;
    } else {
      // screen is taller -> fit width
      w = sw;
      h = w / target;
    }

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    // Center canvas with CSS by using stage flex? We keep it absolute full.
    // So we draw with letterbox ourselves: we will clear full screen by drawing background on stage? Not possible.
    // Easiest: we scale canvas to full via CSS already; so we instead set internal resolution to full screen.
    // BUT we want 16:9 game area: we render with internal viewport inside canvas.
    // Therefore: set canvas internal to full screen, and compute viewport separately.
    canvas.width = Math.round(sw * dpr);
    canvas.height = Math.round(sh * dpr);

    viewport = computeViewport(sw * dpr, sh * dpr);
  }

  let viewport = { x: 0, y: 0, w: 0, h: 0 };
  function computeViewport(W, H) {
    const target = 16/9;
    const aspect = W / H;
    let vw = W, vh = H, vx = 0, vy = 0;

    if (aspect > target) {
      vh = H;
      vw = Math.round(vh * target);
      vx = Math.round((W - vw) / 2);
      vy = 0;
    } else {
      vw = W;
      vh = Math.round(vw / target);
      vx = 0;
      vy = Math.round((H - vh) / 2);
    }

    return { x: vx, y: vy, w: vw, h: vh };
  }

  function cellSize() {
    return {
      cw: viewport.w / BOARD.cols,
      ch: viewport.h / BOARD.rows
    };
  }

  function cellToPx(c) {
    const { cw, ch } = cellSize();
    return {
      x: viewport.x + (c.x + 0.5) * cw,
      y: viewport.y + (c.y + 0.5) * ch
    };
  }

  function inBounds(c) {
    return c.x >= 0 && c.x < BOARD.cols && c.y >= 0 && c.y < BOARD.rows;
  }
  function sameCell(a, b) {
    return a && b && a.x === b.x && a.y === b.y;
  }
  function cellKey(c) { return `${c.x},${c.y}`; }

  // ===== Orientation / Fullscreen =====
  async function requestLandscape() {
    // Only works reliably in fullscreen and only on some browsers.
    try {
      if (document.fullscreenElement == null) {
        // fullscreen the stage (better than canvas alone)
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      }
    } catch {}

    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock("landscape");
      }
    } catch {}
  }

  function showMenu(text = null) {
    state.paused = true;
    state.playingUI = false;
    overlay.classList.remove("hidden");
    hudMini.classList.add("hidden");
    touchControls.classList.add("hidden");

    panelTitle.textContent = state.gameOver ? "Game Over" : "Advanced Snake";
    if (text) panelHint.textContent = text;
  }

  function showPlayUI() {
    state.paused = false;
    state.playingUI = true;
    overlay.classList.add("hidden");
    hudMini.classList.remove("hidden");
    touchControls.classList.remove("hidden");
  }

  // ===== Spawning =====
  function occupiedSet() {
    const occ = new Set();
    for (const s of state.segments) occ.add(cellKey(s));
    for (const o of state.obstacles) occ.add(cellKey(o));
    for (const p of state.powerups) occ.add(cellKey(p.cell));
    return occ;
  }

  function randomFreeCell(tries = 600) {
    const occ = occupiedSet();
    for (let i = 0; i < tries; i++) {
      const c = { x: (Math.random() * BOARD.cols) | 0, y: (Math.random() * BOARD.rows) | 0 };
      if (!occ.has(cellKey(c))) return c;
    }
    // fallback scan
    for (let y = 0; y < BOARD.rows; y++) {
      for (let x = 0; x < BOARD.cols; x++) {
        const c = { x, y };
        if (!occ.has(cellKey(c))) return c;
      }
    }
    return { x: 1, y: 1 };
  }

  function spawnApple() {
    state.apple = randomFreeCell();
  }

  function spawnObstacles() {
    state.obstacles = [];
    if (!state.obstaclesOn) return;

    const diff = state.difficulty;
    const count = diff === "easy" ? 10 : diff === "hard" ? 22 : 16;

    const head = state.segments[0];
    const occ = new Set(state.segments.map(cellKey));

    for (let i = 0; i < count; i++) {
      const c = randomFreeCell();
      const dist = Math.abs(c.x - head.x) + Math.abs(c.y - head.y);
      if (dist < 6) continue;
      if (occ.has(cellKey(c))) continue;
      state.obstacles.push(c);
      occ.add(cellKey(c));
    }
  }

  function maybeSpawnPowerup() {
    if (!state.powerupsOn) return;
    if (state.powerups.length >= 2) return;

    const diff = state.difficulty;
    const chance = diff === "easy" ? 0.030 : diff === "hard" ? 0.017 : 0.022;

    if (Math.random() < chance) {
      const type = pick(POWERUP_TYPES);
      const cell = randomFreeCell();
      state.powerups.push({ type: type.id, cell, ttl: 9000, pulse: 0 });
    }
  }

  // ===== Particles =====
  function emitBurst(px, count, color, strength = 1) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(60, 260) * strength;
      state.particles.push({
        x: px.x, y: px.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.25, 0.75),
        size: rand(1.4, 3.4) * strength,
        color
      });
    }
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.06, dt);
      p.vy *= Math.pow(0.06, dt);
    }
    state.particles = state.particles.filter(p => p.life > 0);
  }

  function drawParticles() {
    ctx.save();
    for (const p of state.particles) {
      ctx.globalAlpha = clamp(p.life * 1.8, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ===== Game Init =====
  function resetGame() {
    state.gameOver = false;
    state.score = 0;
    scoreEl.textContent = "0";
    scoreMini.textContent = "0";

    state.dir = { x: 1, y: 0 };
    state.nextDir = { x: 1, y: 0 };
    state.grow = 0;

    state.particles = [];
    state.shake = 0;

    state.effects.shield = 0;
    state.effects.slow = 0;
    state.effects.magnet = 0;

    const sx = (BOARD.cols / 2) | 0;
    const sy = (BOARD.rows / 2) | 0;

    state.segments = [
      { x: sx, y: sy },
      { x: sx - 1, y: sy },
      { x: sx - 2, y: sy },
      { x: sx - 3, y: sy },
    ];

    state.renderPts = state.segments.map(s => cellToPx(s));
    state.powerups = [];

    spawnApple();
    spawnObstacles();

    syncStats();
  }

  function syncStats() {
    scoreEl.textContent = String(state.score);
    scoreMini.textContent = String(state.score);
    bestEl.textContent = String(bestScore);
    bestMini.textContent = String(bestScore);
  }

  function gameOver(reason) {
    state.gameOver = true;
    state.paused = true;

    if (state.score > bestScore) {
      bestScore = state.score;
      localStorage.setItem(STORAGE_BEST_KEY, String(bestScore));
    }
    syncStats();

    beep("square", 140, 0.10, 0.06);
    beep("sine", 90, 0.12, 0.05);

    showMenu(reason + " • Нажми “Заново” или “Играть”.");
  }

  // ===== Input =====
  function canTurnTo(nx, ny) {
    const dx = state.dir.x, dy = state.dir.y;
    if (state.segments.length > 1 && nx === -dx && ny === -dy) return false;
    return true;
  }
  function setNextDir(nx, ny) {
    if (!canTurnTo(nx, ny)) return;
    state.nextDir = { x: nx, y: ny };
  }

  function bindDirBtn(el, nx, ny) {
    if (!el) return;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      setNextDir(nx, ny);
    });
    el.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  }
  bindDirBtn(tcUp, 0, -1);
  bindDirBtn(tcDown, 0, 1);
  bindDirBtn(tcLeft, -1, 0);
  bindDirBtn(tcRight, 1, 0);

  tcPause?.addEventListener("click", () => {
    if (state.paused) return;
    state.paused = true;
    showMenu("Пауза. Нажми “Играть”, чтобы продолжить.");
    beep("triangle", 520, 0.05, 0.04);
  });

  // Swipe
  let touchStart = null;
  canvas.addEventListener("touchstart", (e) => {
    if (!state.playingUI) return;
    if (e.touches && e.touches.length) {
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }
  }, { passive: true });

  canvas.addEventListener("touchmove", (e) => {
    if (!state.playingUI) return;
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchend", (e) => {
    if (!state.playingUI) return;
    if (!touchStart) return;
    const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
    if (!t) return;

    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;

    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (Math.max(adx, ady) < 18) return;

    if (adx > ady) setNextDir(dx > 0 ? 1 : -1, 0);
    else setNextDir(0, dy > 0 ? 1 : -1);
  });

  // Keyboard (desktop)
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowup" || k === "w") setNextDir(0, -1);
    if (k === "arrowdown" || k === "s") setNextDir(0, 1);
    if (k === "arrowleft" || k === "a") setNextDir(-1, 0);
    if (k === "arrowright" || k === "d") setNextDir(1, 0);

    if (k === " " || k === "spacebar") {
      e.preventDefault();
      if (!state.paused) {
        state.paused = true;
        showMenu("Пауза. Нажми “Играть”, чтобы продолжить.");
      }
    }
    if (k === "r") {
      resetGame();
      showMenu("Заново. Нажми “Играть”.");
    }
  });

  // ===== Settings =====
  function applySettingsFromUI() {
    state.baseStepsPerSecond = Number(speedRange.value);
    state.stepsPerSecond = state.baseStepsPerSecond;
    speedVal.textContent = String(state.baseStepsPerSecond);

    state.difficulty = difficultySel.value;
    state.obstaclesOn = !!toggleObstacles.checked;
    state.powerupsOn = !!togglePowerups.checked;

    if (skinSel && SKINS[skinSel.value]) {
      state.skinId = skinSel.value;
      localStorage.setItem(STORAGE_SKIN_KEY, state.skinId);
    }
  }

  speedRange.addEventListener("input", () => applySettingsFromUI());
  difficultySel.addEventListener("change", () => { applySettingsFromUI(); spawnObstacles(); });
  toggleObstacles.addEventListener("change", () => { applySettingsFromUI(); spawnObstacles(); });
  togglePowerups.addEventListener("change", () => { applySettingsFromUI(); if (!state.powerupsOn) state.powerups = []; });
  skinSel.addEventListener("change", () => { applySettingsFromUI(); beep("triangle", 740, 0.05, 0.04); });

  // ===== Mechanics =====
  function isObstacle(cell) {
    for (const o of state.obstacles) if (sameCell(o, cell)) return true;
    return false;
  }

  function isSnake(cell, skipTail = false) {
    const len = state.segments.length;
    const end = skipTail ? len - 1 : len;
    for (let i = 0; i < end; i++) if (sameCell(state.segments[i], cell)) return true;
    return false;
  }

  function addScore(pts) {
    state.score += pts;
    syncStats();
  }

  function startEffect(typeId) {
    const def = POWERUP_TYPES.find(p => p.id === typeId);
    if (!def) return;
    state.effects[typeId] = def.duration;

    const headPx = cellToPx(state.segments[0]);
    emitBurst(headPx, 24, "rgba(124,244,197,0.75)", 1);
    beep("sine", 740, 0.06, 0.05);
    beep("triangle", 980, 0.04, 0.035);
  }

  function updateEffects(dtMs) {
    for (const k of Object.keys(state.effects)) {
      state.effects[k] = Math.max(0, state.effects[k] - dtMs);
    }

    const slowOn = state.effects.slow > 0;
    state.stepsPerSecond = slowOn ? Math.max(5, state.baseStepsPerSecond - 4) : state.baseStepsPerSecond;
  }

  function magnetPull() {
    if (state.effects.magnet <= 0 || !state.apple) return;
    const head = state.segments[0];
    const a = state.apple;

    const dx = head.x - a.x;
    const dy = head.y - a.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist > 9) return;

    if (Math.random() < 0.12) {
      const step = (Math.abs(dx) > Math.abs(dy))
        ? { x: Math.sign(dx), y: 0 }
        : { x: 0, y: Math.sign(dy) };

      const next = { x: a.x + step.x, y: a.y + step.y };
      if (inBounds(next) && !isSnake(next, false) && !isObstacle(next)) {
        state.apple = next;
      }
    }
  }

  function step() {
    state.dir = state.nextDir;

    const head = state.segments[0];
    const next = { x: head.x + state.dir.x, y: head.y + state.dir.y };

    if (!inBounds(next)) {
      if (state.effects.shield > 0) {
        state.effects.shield = Math.max(0, state.effects.shield - 2200);
        state.shake = Math.max(state.shake, 10);
        beep("square", 220, 0.05, 0.05);

        const clamped = { x: clamp(next.x, 0, BOARD.cols - 1), y: clamp(next.y, 0, BOARD.rows - 1) };
        state.nextDir = { x: -state.dir.x, y: -state.dir.y };
        state.dir = state.nextDir;
        state.segments.unshift(clamped);
      } else {
        return gameOver("Врезался в стену");
      }
    } else {
      if (isObstacle(next)) {
        if (state.effects.shield > 0) {
          state.effects.shield = Math.max(0, state.effects.shield - 2200);
          state.shake = Math.max(state.shake, 10);
          beep("square", 220, 0.05, 0.05);
          emitBurst(cellToPx(head), 14, "rgba(232,238,252,0.55)", 0.9);
          return;
        }
        return gameOver("Врезался в препятствие");
      }

      const wouldGrow = (state.apple && sameCell(next, state.apple));
      const hitSelf = isSnake(next, !wouldGrow && state.grow === 0);

      if (hitSelf) {
        if (state.effects.shield > 0) {
          state.effects.shield = Math.max(0, state.effects.shield - 2500);
          state.shake = Math.max(state.shake, 12);
          beep("square", 220, 0.05, 0.05);
          if (state.segments.length > 6) state.segments.splice(-2, 2);
        } else {
          return gameOver("Укусил свой хвост");
        }
      }

      state.segments.unshift(next);
    }

    // Eat apple
    if (state.apple && sameCell(state.segments[0], state.apple)) {
      state.grow += 2;
      addScore(10);

      emitBurst(cellToPx(state.apple), 34, COLORS.appleGlow, 1.2);
      beep("sine", 880, 0.05, 0.05);
      beep("triangle", 660, 0.04, 0.04);

      spawnApple();

      if (state.obstaclesOn && state.score % 50 === 0) {
        const add = (state.difficulty === "hard") ? 2 : 1;
        for (let i = 0; i < add; i++) state.obstacles.push(randomFreeCell());
      }
    }

    // Powerup pickup
    if (state.powerups.length) {
      for (let i = state.powerups.length - 1; i >= 0; i--) {
        const p = state.powerups[i];
        if (sameCell(p.cell, state.segments[0])) {
          startEffect(p.type);
          addScore(12);
          state.powerups.splice(i, 1);
        }
      }
    }

    if (state.grow > 0) state.grow--;
    else state.segments.pop();

    maybeSpawnPowerup();
    magnetPull();
  }

  // ===== Smooth render points =====
  function updateRenderPoints(dt) {
    while (state.renderPts.length < state.segments.length) {
      state.renderPts.push(cellToPx(state.segments[state.renderPts.length]));
    }
    while (state.renderPts.length > state.segments.length) {
      state.renderPts.pop();
    }

    const follow = 18;
    for (let i = 0; i < state.segments.length; i++) {
      const target = cellToPx(state.segments[i]);
      const p = state.renderPts[i];
      const t = 1 - Math.exp(-follow * dt);
      p.x = lerp(p.x, target.x, t);
      p.y = lerp(p.y, target.y, t);
    }
  }

  // ===== Draw =====
  function drawLetterbox() {
    // Fill full screen with background, then render the 16:9 viewport on top.
    const W = canvas.width, H = canvas.height;

    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, COLORS.bgA);
    g.addColorStop(1, COLORS.bgB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // subtle vignette
    const vg = ctx.createRadialGradient(W*0.5, H*0.5, Math.min(W,H)*0.25, W*0.5, H*0.5, Math.max(W,H)*0.8);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function drawGrid() {
    const { cw, ch } = cellSize();
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = 1; x < BOARD.cols; x++) {
      const px = viewport.x + x * cw;
      ctx.moveTo(px, viewport.y);
      ctx.lineTo(px, viewport.y + viewport.h);
    }
    for (let y = 1; y < BOARD.rows; y++) {
      const py = viewport.y + y * ch;
      ctx.moveTo(viewport.x, py);
      ctx.lineTo(viewport.x + viewport.w, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function drawObstacle(cell) {
    const { cw, ch } = cellSize();
    const x = viewport.x + cell.x * cw;
    const y = viewport.y + cell.y * ch;
    const r = Math.min(cw, ch) * 0.18;

    ctx.fillStyle = COLORS.obstacle;
    ctx.beginPath();
    roundRect(ctx, x + cw*0.12, y + ch*0.12, cw*0.76, ch*0.76, r);
    ctx.fill();
  }

  function drawApple() {
    if (!state.apple) return;
    const p = cellToPx(state.apple);
    const { cw, ch } = cellSize();
    const rad = Math.min(cw, ch) * 0.28;

    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = COLORS.appleGlow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = COLORS.apple;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(p.x - rad*0.28, p.y - rad*0.28, rad*0.35, 0, Math.PI*2);
    ctx.fill();
  }

  function drawPowerups(dt) {
    const { cw, ch } = cellSize();

    for (const p of state.powerups) {
      p.ttl -= dt * 1000;
      p.pulse += dt * 6;
      if (p.ttl <= 0) continue;

      const px = cellToPx(p.cell);
      const base = Math.min(cw, ch) * 0.30;
      const pulse = 1 + Math.sin(p.pulse) * 0.08;

      let color = "rgba(124,244,197,0.90)";
      if (p.type === "slow") color = "rgba(122,168,255,0.90)";
      if (p.type === "shield") color = "rgba(232,238,252,0.85)";

      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, base * 0.18);
      ctx.beginPath();
      ctx.arc(px.x, px.y, base * 1.3 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px.x, px.y, base * 0.55 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.font = `${Math.max(12, base * 1.05)}px ui-sans-serif, system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.type === "magnet" ? "M" : p.type === "slow" ? "S" : "⛨", px.x, px.y + 0.5);
    }

    state.powerups = state.powerups.filter(p => p.ttl > 0);
  }

  function drawSnake() {
    const pts = state.renderPts;
    if (!pts.length) return;

    const skin = SKINS[state.skinId] || SKINS.neon;
    const { cw, ch } = cellSize();
    const baseR = Math.min(cw, ch) * 0.34;

    const grad = ctx.createLinearGradient(viewport.x, viewport.y, viewport.x + viewport.w, viewport.y + viewport.h);
    grad.addColorStop(0, skin.body[0]);
    grad.addColorStop(1, skin.body[1]);

    ctx.save();

    // Glow
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = skin.glow;
    ctx.lineWidth = baseR * 1.9;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    // Body
    ctx.globalAlpha = 1;
    ctx.strokeStyle = grad;
    ctx.lineWidth = baseR * 1.35;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    // Highlight
    ctx.globalAlpha = 0.26;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = baseR * 0.50;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    // Head
    const head = pts[0];
    const hx = head.x, hy = head.y;
    const headR = baseR * 0.92;

    if (state.effects.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.22 + 0.16 * Math.sin(nowMs() * 0.006);
      ctx.strokeStyle = "rgba(232,238,252,0.70)";
      ctx.lineWidth = headR * 0.35;
      ctx.beginPath();
      ctx.arc(hx, hy, headR * 1.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = skin.head;
    ctx.beginPath();
    ctx.arc(hx, hy, headR, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    const dx = state.dir.x, dy = state.dir.y;
    const exOff = headR * 0.35;
    const eyOff = headR * 0.22;
    const eyeR = headR * 0.13;

    const px = -dy, py = dx;
    const e1 = { x: hx + px * exOff + dx * eyOff, y: hy + py * exOff + dy * eyOff };
    const e2 = { x: hx - px * exOff + dx * eyOff, y: hy - py * exOff + dy * eyOff };

    ctx.fillStyle = skin.eye;
    ctx.beginPath(); ctx.arc(e1.x, e1.y, eyeR, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(e2.x, e2.y, eyeR, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = "rgba(0,0,0,0.75)";
    const pupR = eyeR * 0.45;
    const pupOff = eyeR * 0.55;
    ctx.beginPath(); ctx.arc(e1.x + dx*pupOff, e1.y + dy*pupOff, pupR, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(e2.x + dx*pupOff, e2.y + dy*pupOff, pupR, 0, Math.PI*2); ctx.fill();

    ctx.restore();
  }

  function drawStatusText() {
    const effects = [];
    if (state.effects.shield > 0) effects.push("ЩИТ");
    if (state.effects.slow > 0) effects.push("SLOW");
    if (state.effects.magnet > 0) effects.push("MAGNET");
    if (!effects.length) return;

    ctx.save();
    ctx.fillStyle = COLORS.text;
    ctx.font = `${Math.round(viewport.h * 0.040)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 14;
    ctx.fillText("ЭФФЕКТЫ: " + effects.join(" • "), viewport.x + 14, viewport.y + 12);
    ctx.restore();
  }

  function drawFrame(dt) {
    let ox = 0, oy = 0;
    if (state.shake > 0) {
      const s = state.shake;
      ox = rand(-s, s);
      oy = rand(-s, s);
      state.shake = Math.max(0, state.shake - dt * 25);
    }

    ctx.save();
    ctx.translate(ox, oy);

    drawLetterbox();
    drawGrid();

    for (const o of state.obstacles) drawObstacle(o);
    drawApple();
    drawPowerups(dt);

    drawSnake();
    drawParticles();
    drawStatusText();

    ctx.restore();
  }

  // ===== Loop =====
  function update(ts) {
    if (!state.running) return;

    const t = ts || nowMs();
    if (!state.lastTs) state.lastTs = t;
    let dtMs = t - state.lastTs;
    state.lastTs = t;
    dtMs = Math.min(dtMs, 50);

    const dt = dtMs / 1000;

    updateParticles(dt);
    updateRenderPoints(dt);

    if (!state.paused && !state.gameOver) {
      updateEffects(dtMs);

      const stepDt = 1 / Math.max(1, state.stepsPerSecond);
      state.accumulator += dt;

      while (state.accumulator >= stepDt) {
        step();
        state.accumulator -= stepDt;

        if (Math.random() < 0.20) {
          const tail = state.renderPts[state.renderPts.length - 1];
          if (tail) {
            const skin = SKINS[state.skinId] || SKINS.neon;
            emitBurst({ x: tail.x, y: tail.y }, 2, skin.particle, 0.5);
          }
        }
      }
    }

    drawFrame(dt);
    requestAnimationFrame(update);
  }

  // ===== UI Actions =====
  btnRestart.addEventListener("click", () => {
    applySettingsFromUI();
    resetGame();
    showMenu("Заново. Нажми “Играть”.");
    beep("triangle", 660, 0.05, 0.04);
  });

  btnPlay.addEventListener("click", async () => {
    applySettingsFromUI();

    // try fullscreen + landscape
    await requestLandscape();

    // resize after possible orientation/fullscreen change
    resizeCanvas();
    state.renderPts = state.segments.map(s => cellToPx(s));

    // If still portrait, show a small hint (but still allow playing)
    const portrait = window.innerHeight > window.innerWidth;
    if (portrait) {
      panelHint.textContent = "Если игра не повернулась: включи автоповорот и поверни телефон горизонтально (landscape).";
    }

    // start/resume
    state.gameOver = false;
    showPlayUI();
    beep("triangle", 640, 0.05, 0.04);
  });

  // Resume audio on first interaction
  window.addEventListener("pointerdown", () => {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  }, { once: true });

  // ===== Boot =====
  function boot() {
    // load saved skin
    const savedSkin = localStorage.getItem(STORAGE_SKIN_KEY);
    if (savedSkin && SKINS[savedSkin]) {
      state.skinId = savedSkin;
      skinSel.value = savedSkin;
    }

    resizeCanvas();
    applySettingsFromUI();
    resetGame();

    showMenu("Нажми “Играть”. На телефоне игра будет как приложение: один экран.");
    requestAnimationFrame(update);
  }

  window.addEventListener("resize", () => {
    resizeCanvas();
    state.renderPts = state.segments.map(s => cellToPx(s));
  });

  // On orientation change (some browsers)
  window.addEventListener("orientationchange", () => {
    setTimeout(() => {
      resizeCanvas();
      state.renderPts = state.segments.map(s => cellToPx(s));
    }, 250);
  });

  boot();
})();
