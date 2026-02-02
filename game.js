(() => {
  "use strict";

  // ======= Utilities =======
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function nowMs() { return performance.now(); }

  // ======= DOM =======
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");

  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");
  const btnResume = document.getElementById("btnResume");
  const btnOverlayRestart = document.getElementById("btnOverlayRestart");

  const speedRange = document.getElementById("speed");
  const speedVal = document.getElementById("speedVal");
  const difficultySel = document.getElementById("difficulty");
  const skinSel = document.getElementById("skin");
  const toggleObstacles = document.getElementById("toggleObstacles");
  const togglePowerups = document.getElementById("togglePowerups");

  // Touch controls
  const touchControls = document.getElementById("touchControls");
  const tcPause = document.getElementById("tcPause");
  const tcUp = document.getElementById("tcUp");
  const tcDown = document.getElementById("tcDown");
  const tcLeft = document.getElementById("tcLeft");
  const tcRight = document.getElementById("tcRight");

  // ======= Settings / Storage =======
  const STORAGE_BEST_KEY = "advanced_snake_best_v1";
  const STORAGE_SKIN_KEY = "advanced_snake_skin_v1";

  let bestScore = Number(localStorage.getItem(STORAGE_BEST_KEY) || 0);
  bestEl.textContent = String(bestScore);

  const SKINS = {
    neon: {
      name: "Neon",
      body: ["#7cf4c5", "#7aa8ff"],
      glow: "rgba(124,244,197,0.30)",
      particle: "rgba(122,168,255,0.22)",
      head: "#e8eefc",
      eye: "rgba(0,0,0,0.55)"
    },
    toxic: {
      name: "Toxic",
      body: ["#7CFF6B", "#00D18C"],
      glow: "rgba(124,255,107,0.26)",
      particle: "rgba(0,209,140,0.20)",
      head: "#EFFFF2",
      eye: "rgba(0,0,0,0.55)"
    },
    fire: {
      name: "Fire",
      body: ["#FFB86B", "#FF3D6E"],
      glow: "rgba(255,77,66,0.22)",
      particle: "rgba(255,184,107,0.20)",
      head: "#FFF1E6",
      eye: "rgba(0,0,0,0.55)"
    },
    ice: {
      name: "Ice",
      body: ["#8CEBFF", "#4E7CFF"],
      glow: "rgba(140,235,255,0.22)",
      particle: "rgba(78,124,255,0.18)",
      head: "#F3FBFF",
      eye: "rgba(0,0,0,0.55)"
    },
    gold: {
      name: "Gold",
      body: ["#FFE08A", "#FFB703"],
      glow: "rgba(255,183,3,0.22)",
      particle: "rgba(255,224,138,0.18)",
      head: "#FFF7DB",
      eye: "rgba(0,0,0,0.55)"
    },
    carbon: {
      name: "Carbon",
      body: ["#C9D6FF", "#3E4A61"],
      glow: "rgba(201,214,255,0.16)",
      particle: "rgba(62,74,97,0.18)",
      head: "#EAEFFC",
      eye: "rgba(0,0,0,0.55)"
    }
  };

  // ======= Board =======
  const BOARD = {
    cols: 30,
    rows: 20,
  };

  const COLORS = {
    bgA: "#0b1020",
    bgB: "#0a0d18",
    grid: "rgba(255,255,255,0.05)",
    apple: "#ff5d6c",
    appleGlow: "rgba(255,93,108,0.35)",
    obstacle: "rgba(255,255,255,0.13)",
    text: "rgba(232,238,252,0.88)"
  };

  // Powerups types
  const POWERUP_TYPES = [
    { id: "shield", label: "Щит", duration: 6500 },
    { id: "slow", label: "Замедление", duration: 6500 },
    { id: "magnet", label: "Магнит", duration: 6500 },
  ];

  // ======= Audio (procedural) =======
  let audioCtx = null;
  function beep(type = "sine", freq = 440, dur = 0.07, gain = 0.06) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(t0);
      o.stop(t0 + dur);
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    } catch { /* ignore */ }
  }

  // ======= State =======
  const state = {
    running: true,
    paused: false,
    gameOver: false,

    lastTs: 0,
    accumulator: 0,

    stepsPerSecond: 10,
    baseStepsPerSecond: 10,

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

    effects: {
      shield: 0,
      slow: 0,
      magnet: 0
    }
  };

  // ======= Mobile game mode =======
  function isMobileLike() {
    return window.matchMedia("(max-width: 980px)").matches || ("ontouchstart" in window);
  }

  function enterGameMode() {
    if (!isMobileLike()) return;
    document.body.classList.add("gameMode");
    touchControls?.classList.remove("hidden");
    resizeCanvasToDisplaySize();
    state.renderPts = state.segments.map(s => cellToPx(s));
  }

  function exitGameMode() {
    document.body.classList.remove("gameMode");
    touchControls?.classList.add("hidden");
    resizeCanvasToDisplaySize();
    state.renderPts = state.segments.map(s => cellToPx(s));
  }

  // ======= Layout / Resizing =======
  function resizeCanvasToDisplaySize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const inGameMode = document.body.classList.contains("gameMode");

    if (inGameMode) {
      const w = Math.round(window.innerWidth * dpr);
      const h = Math.round(window.innerHeight * dpr);
      canvas.width = w;
      canvas.height = h;
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round((rect.width * (2 / 3)) * dpr);
    canvas.width = w;
    canvas.height = h;
  }

  function cellSize() {
    return {
      cw: canvas.width / BOARD.cols,
      ch: canvas.height / BOARD.rows
    };
  }

  function cellToPx(c) {
    const { cw, ch } = cellSize();
    return {
      x: (c.x + 0.5) * cw,
      y: (c.y + 0.5) * ch
    };
  }

  function inBounds(c) {
    return c.x >= 0 && c.x < BOARD.cols && c.y >= 0 && c.y < BOARD.rows;
  }

  function sameCell(a, b) {
    return a && b && a.x === b.x && a.y === b.y;
  }

  function cellKey(c) { return `${c.x},${c.y}`; }

  // ======= Spawning =======
  function occupiedSet() {
    const occ = new Set();
    for (const s of state.segments) occ.add(cellKey(s));
    for (const o of state.obstacles) occ.add(cellKey(o));
    for (const p of state.powerups) occ.add(cellKey(p.cell));
    return occ;
  }

  function randomFreeCell(tries = 400) {
    const occ = occupiedSet();
    for (let i = 0; i < tries; i++) {
      const c = { x: (Math.random() * BOARD.cols) | 0, y: (Math.random() * BOARD.rows) | 0 };
      if (!occ.has(cellKey(c))) return c;
    }
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
    const count =
      diff === "easy" ? 10 :
      diff === "hard" ? 22 : 16;

    const occ = new Set(state.segments.map(cellKey));

    for (let i = 0; i < count; i++) {
      const c = randomFreeCell();
      const head = state.segments[0];
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
    const chance =
      diff === "easy" ? 0.030 :
      diff === "hard" ? 0.017 : 0.022;

    if (Math.random() < chance) {
      const type = pick(POWERUP_TYPES);
      const cell = randomFreeCell();
      state.powerups.push({
        type: type.id,
        cell,
        ttl: 9000,
        pulse: 0
      });
    }
  }

  // ======= Particles =======
  function emitBurst(px, count, color, strength = 1) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(60, 260) * strength;
      state.particles.push({
        x: px.x,
        y: px.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.25, 0.75),
        size: rand(1.5, 3.5) * strength,
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

  // ======= Overlay =======
  function showOverlay(title, text) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlay.classList.remove("hidden");
  }
  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function setPaused(p) {
    state.paused = p;
    if (state.paused) {
      // когда пауза — показываем меню и возвращаем блоки
      exitGameMode();
      showOverlay("Пауза", "Нажми Space или кнопку “Пауза”, чтобы продолжить.");
      btnPause.textContent = "Продолжить";
    } else {
      hideOverlay();
      btnPause.textContent = "Пауза";
      state.lastTs = nowMs();
    }
  }

  // ======= Game Init =======
  function resetGame() {
    state.running = true;
    state.paused = false;
    state.gameOver = false;

    state.score = 0;
    scoreEl.textContent = "0";

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

    spawnApple();
    spawnObstacles();
    state.powerups = [];
  }

  function gameOver(reason) {
    state.gameOver = true;
    state.paused = true;

    if (state.score > bestScore) {
      bestScore = state.score;
      localStorage.setItem(STORAGE_BEST_KEY, String(bestScore));
      bestEl.textContent = String(bestScore);
    }

    // вернём меню, чтобы можно было рестартнуть
    exitGameMode();
    showOverlay("Game Over", reason + " Нажми R или “Начать заново”.");
    btnPause.textContent = "Пауза";
    beep("square", 140, 0.10, 0.06);
    beep("sine", 90, 0.12, 0.05);
  }

  // ======= Input =======
  function canTurnTo(nx, ny) {
    const dx = state.dir.x, dy = state.dir.y;
    if (state.segments.length > 1 && nx === -dx && ny === -dy) return false;
    return true;
  }

  function setNextDir(nx, ny) {
    if (!canTurnTo(nx, ny)) return;
    state.nextDir = { x: nx, y: ny };
  }

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === " " || k === "spacebar") {
      e.preventDefault();
      if (!state.gameOver) setPaused(!state.paused);
      return;
    }
    if (k === "r") {
      resetGame();
      // после рестарта оставим меню, чтобы нажали "Продолжить"
      setPaused(true);
      overlayTitle.textContent = "Готов?";
      overlayText.textContent = "Нажми “Продолжить” и игра станет на весь экран.";
      return;
    }
    if (k === "arrowup" || k === "w") setNextDir(0, -1);
    if (k === "arrowdown" || k === "s") setNextDir(0, 1);
    if (k === "arrowleft" || k === "a") setNextDir(-1, 0);
    if (k === "arrowright" || k === "d") setNextDir(1, 0);
  });

  // Swipe (optional)
  let touchStart = null;
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches && e.touches.length) {
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }
  }, { passive: true });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchend", (e) => {
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

  // Buttons
  btnPause.addEventListener("click", () => {
    if (state.gameOver) return;
    setPaused(!state.paused);
    beep("triangle", 520, 0.05, 0.04);
  });

  btnRestart.addEventListener("click", () => {
    resetGame();
    setPaused(true);
    overlayTitle.textContent = "Готов?";
    overlayText.textContent = "Нажми “Продолжить” и игра станет на весь экран.";
    beep("triangle", 660, 0.05, 0.04);
  });

  btnResume.addEventListener("click", () => {
    if (!state.gameOver) {
      enterGameMode();
      setPaused(false);
    }
    beep("triangle", 640, 0.05, 0.04);
  });

  btnOverlayRestart.addEventListener("click", () => {
    resetGame();
    enterGameMode();
    setPaused(false);
    beep("triangle", 660, 0.05, 0.04);
  });

  // Touch control buttons
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
    if (state.gameOver) return;
    setPaused(!state.paused);
    beep("triangle", 520, 0.05, 0.04);
  });

  // ======= Settings controls =======
  function applySettingsFromUI() {
    state.baseStepsPerSecond = Number(speedRange.value);
    state.stepsPerSecond = state.baseStepsPerSecond;
    speedVal.textContent = String(state.baseStepsPerSecond);

    state.difficulty = difficultySel.value;
    state.obstaclesOn = !!toggleObstacles.checked;
    state.powerupsOn = !!togglePowerups.checked;

    if (skinSel) {
      state.skinId = skinSel.value;
      localStorage.setItem(STORAGE_SKIN_KEY, state.skinId);
    }
  }

  speedRange.addEventListener("input", () => applySettingsFromUI());
  difficultySel.addEventListener("change", () => { applySettingsFromUI(); spawnObstacles(); });
  toggleObstacles.addEventListener("change", () => { applySettingsFromUI(); spawnObstacles(); });
  togglePowerups.addEventListener("change", () => {
    applySettingsFromUI();
    if (!state.powerupsOn) state.powerups = [];
  });

  skinSel?.addEventListener("change", () => {
    applySettingsFromUI();
    beep("triangle", 740, 0.05, 0.04);
  });

  // ======= Mechanics =======
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
    scoreEl.textContent = String(state.score);
    if (state.score > bestScore) {
      bestScore = state.score;
      bestEl.textContent = String(bestScore);
    }
  }

  function startEffect(typeId) {
    const def = POWERUP_TYPES.find(p => p.id === typeId);
    if (!def) return;
    state.effects[typeId] = def.duration;

    const headPx = cellToPx(state.segments[0]);
    emitBurst(headPx, 26, "rgba(124,244,197,0.75)", 1);
    beep("sine", 740, 0.06, 0.05);
    beep("triangle", 980, 0.04, 0.035);
  }

  function updateEffects(dtMs) {
    for (const k of Object.keys(state.effects)) {
      state.effects[k] = Math.max(0, state.effects[k] - dtMs);
    }

    const slowOn = state.effects.slow > 0;
    if (slowOn) state.stepsPerSecond = Math.max(5, state.baseStepsPerSecond - 4);
    else state.stepsPerSecond = state.baseStepsPerSecond;
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

    // wall
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
        return gameOver("Ты врезался в стену.");
      }
    } else {
      // obstacles
      if (isObstacle(next)) {
        if (state.effects.shield > 0) {
          state.effects.shield = Math.max(0, state.effects.shield - 2200);
          state.shake = Math.max(state.shake, 10);
          beep("square", 220, 0.05, 0.05);
          const headPx = cellToPx(head);
          emitBurst(headPx, 14, "rgba(232,238,252,0.55)", 0.9);
          return;
        }
        return gameOver("Ты врезался в препятствие.");
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
          return gameOver("Ты врезался в свой хвост.");
        }
      }

      state.segments.unshift(next);
    }

    // eat apple
    if (state.apple && sameCell(state.segments[0], state.apple)) {
      state.grow += 2;
      addScore(10);

      const px = cellToPx(state.apple);
      emitBurst(px, 34, COLORS.appleGlow, 1.2);
      beep("sine", 880, 0.05, 0.05);
      beep("triangle", 660, 0.04, 0.04);

      spawnApple();

      if (state.obstaclesOn && state.score % 50 === 0) {
        const add = (state.difficulty === "hard") ? 2 : 1;
        for (let i = 0; i < add; i++) state.obstacles.push(randomFreeCell());
      }
    }

    // powerup pickup
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

  // ======= Smooth render points =======
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

  // ======= Drawing =======
  function drawBackground() {
    const w = canvas.width, h = canvas.height;

    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, COLORS.bgA);
    g.addColorStop(1, COLORS.bgB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const { cw, ch } = cellSize();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = 1; x < BOARD.cols; x++) {
      const px = x * cw;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
    }
    for (let y = 1; y < BOARD.rows; y++) {
      const py = y * ch;
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    }
    ctx.stroke();

    const vg = ctx.createRadialGradient(w*0.5, h*0.5, Math.min(w,h)*0.25, w*0.5, h*0.5, Math.max(w,h)*0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
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
    const x = cell.x * cw;
    const y = cell.y * ch;
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
      ctx.font = `${Math.max(12, base * 1.1)}px ui-sans-serif, system-ui`;
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

    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, skin.body[0]);
    grad.addColorStop(1, skin.body[1]);

    ctx.save();

    // glow behind snake
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = skin.glow;
    ctx.lineWidth = baseR * 1.9;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    // main tube
    ctx.globalAlpha = 1;
    ctx.strokeStyle = grad;
    ctx.lineWidth = baseR * 1.35;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    // inner highlight
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = baseR * 0.50;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    // head
    const head = pts[0];
    const hx = head.x, hy = head.y;
    const headR = baseR * 0.92;

    if (state.effects.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.18 * Math.sin(nowMs() * 0.006);
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

    // eyes
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
    ctx.font = `${Math.round(canvas.height * 0.032)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 14;
    ctx.fillText("ЭФФЕКТЫ: " + effects.join(" • "), 16, 14);
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

    drawBackground();

    for (const o of state.obstacles) drawObstacle(o);

    drawApple();
    drawPowerups(dt);

    drawSnake();
    drawParticles();
    drawStatusText();

    ctx.restore();
  }

  // ======= Main Loop =======
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

      if (state.obstaclesOn && state.difficulty === "hard" && Math.random() < 0.002) {
        state.obstacles.push(randomFreeCell());
      }

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

  // ======= Boot =======
  function applyAdaptiveBoardOnce() {
    const aspect = canvas.width / canvas.height;
    if (aspect > 1.6) { BOARD.cols = 34; BOARD.rows = 20; }
    else if (aspect < 1.2) { BOARD.cols = 26; BOARD.rows = 22; }
    else { BOARD.cols = 30; BOARD.rows = 20; }
  }

  function boot() {
    resizeCanvasToDisplaySize();

    // load saved skin
    const savedSkin = localStorage.getItem(STORAGE_SKIN_KEY);
    if (savedSkin && SKINS[savedSkin]) {
      state.skinId = savedSkin;
      if (skinSel) skinSel.value = savedSkin;
    }

    applyAdaptiveBoardOnce();
    applySettingsFromUI();

    resetGame();

    // start in menu/pause
    setPaused(true);
    overlayTitle.textContent = "Готов?";
    overlayText.textContent = "Нажми “Продолжить” и на телефоне игра станет на весь экран.";

    requestAnimationFrame(update);
  }

  window.addEventListener("resize", () => {
    resizeCanvasToDisplaySize();
    state.renderPts = state.segments.map(s => cellToPx(s));
  });

  window.addEventListener("pointerdown", () => {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  }, { once: true });

  boot();
})();
