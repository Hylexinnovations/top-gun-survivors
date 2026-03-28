// ============================================================
// §1  CONSTANTS & PALETTE
// ============================================================
const W = 480, H = 360;

const PAL = {
  BLACK:     '#0d0d0d',
  DARK_GRAY: '#2a2a2a',
  GRAY:      '#555555',
  LT_GRAY:   '#aaaaaa',
  WHITE:     '#f0f0f0',
  RED:       '#e03c2d',
  ORANGE:    '#f5a623',
  YELLOW:    '#f0e040',
  GREEN:     '#3dbc3d',
  DK_GREEN:  '#1a6b1a',
  CYAN:      '#3dcbcb',
  BLUE:      '#2d5de0',
  DK_BLUE:   '#1a1a6b',
  PURPLE:    '#7b2d8b',
  PINK:      '#e840a0',
  BROWN:     '#7a4a1e',
};

// ============================================================
// §2  CANVAS SETUP
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width  = W;
canvas.height = H;
ctx.imageSmoothingEnabled = false;
canvas.style.imageRendering = 'pixelated';

function resizeCanvas() {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width  = Math.floor(W * scale) + 'px';
  canvas.style.height = Math.floor(H * scale) + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ============================================================
// §3  INPUT MANAGER
// ============================================================
const Input = {
  keys: {},
  mouse: { x: W / 2, y: H / 2, down: false },
  clickThisFrame: false,
  enterThisFrame: false,

  init() {
    window.addEventListener('keydown', e => {
      if (!this.keys[e.key]) {
        if (e.key === 'Enter') this.enterThisFrame = true;
        if (e.key === 'Escape') handleEscape();
      }
      this.keys[e.key] = true;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))
        e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.key] = false; });

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - rect.left) * (W / rect.width);
      this.mouse.y = (e.clientY - rect.top)  * (H / rect.height);
    });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouse.down = true; this.clickThisFrame = true; }
    });
    canvas.addEventListener('mouseup',   e => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },

  flush() { this.clickThisFrame = false; this.enterThisFrame = false; }
};

// ============================================================
// §4  STATE MACHINE
// ============================================================
const States = {
  LOADING:        'loading',
  MENU:           'menu',
  PLAYING:        'playing',
  PAUSED:         'paused',
  LEVEL_COMPLETE: 'level_complete',
  GAME_OVER:      'game_over',
};

const SM = {
  current: States.LOADING,
  timer: 0,
  transition(next) { this.current = next; this.timer = 0; }
};

// ============================================================
// §5  ENTITY BASE CLASS
// ============================================================
class Entity {
  constructor(x, y, w, h) {
    this.x = x; this.y = y;
    this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.alive = true;
  }
  get cx() { return this.x + this.w * 0.5; }
  get cy() { return this.y + this.h * 0.5; }
}

// ============================================================
// §6  PLAYER
// ============================================================
let player = null;

function createPlayer() {
  const p    = new Entity(W / 2 - 16, H / 2 - 24, 32, 48);
  p.hp       = 100;
  p.maxHp    = 100;
  p.speed    = 130;
  p.ammo     = 30;
  p.maxAmmo  = 30;
  p.fireRate = 0.18;
  p.fireCd   = 0;
  p.flashTimer = 0;
  p.iframes  = 0;
  p.aimAngle = 0;
  p.animState = 'idle';
  p.animFrame = 0;
  p.animTimer = 0;
  p.bobTimer  = 0;
  p.reloadTimer = 0;
  p.reloading   = false;
  p.facing = 'down';
  return p;
}

const PLAY_BOUNDS_Y = H - 24; // HUD at bottom

function updatePlayer(dt) {
  let dx = 0, dy = 0;
  if (Input.keys['ArrowLeft']  || Input.keys['a']) dx -= 1;
  if (Input.keys['ArrowRight'] || Input.keys['d']) dx += 1;
  if (Input.keys['ArrowUp']    || Input.keys['w']) dy -= 1;
  if (Input.keys['ArrowDown']  || Input.keys['s']) dy += 1;
  if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }

  player.x = clamp(player.x + dx * player.speed * dt, 0, W - player.w);
  player.y = clamp(player.y + dy * player.speed * dt, 0, PLAY_BOUNDS_Y - player.h);

  // Facing / anim state
  if (dx || dy) {
    player.animState = 'walk';
    if (Math.abs(dx) >= Math.abs(dy)) player.facing = dx > 0 ? 'right' : 'left';
    else                               player.facing = dy > 0 ? 'down'  : 'up';
  } else {
    player.animState = 'idle';
  }

  player.aimAngle = Math.atan2(Input.mouse.y - player.cy, Input.mouse.x - player.cx);
  player.bobTimer += dt;

  // Reload logic
  if (player.reloading) {
    player.reloadTimer += dt;
    if (player.reloadTimer >= 2.0) {
      player.ammo = player.maxAmmo;
      player.reloading = false;
      player.reloadTimer = 0;
    }
  } else if (player.ammo === 0) {
    player.reloading = true;
    player.reloadTimer = 0;
  }

  // Shooting
  player.fireCd    -= dt;
  player.flashTimer -= dt;
  if (Input.mouse.down && player.fireCd <= 0 && player.ammo > 0 && !player.reloading) {
    const muzzleX = player.cx + Math.cos(player.aimAngle) * 13;
    const muzzleY = player.cy + Math.sin(player.aimAngle) * 13;
    spawnBullet(muzzleX, muzzleY, player.aimAngle, 'player', 25);
    spawnMuzzleFlash(muzzleX, muzzleY);
    player.fireCd    = player.fireRate;
    player.flashTimer = 0.09;
    player.ammo--;
    player.animState = 'shoot';
  }

  // Animation frames
  player.animTimer += dt;
  const frameDur = player.animState === 'walk' ? 0.11 : 0.35;
  const numFrames = player.animState === 'walk' ? 4 : 2;
  if (player.animTimer >= frameDur) {
    player.animTimer = 0;
    player.animFrame = (player.animFrame + 1) % numFrames;
  }

  player.iframes = Math.max(0, player.iframes - dt);
}

// ============================================================
// §7  BULLETS
// ============================================================
let bullets = [];

function spawnBullet(x, y, angle, owner, damage) {
  const b  = new Entity(x - 2, y - 2, 4, 4);
  const spd = owner === 'player' ? 320 : 150;
  b.vx     = Math.cos(angle) * spd;
  b.vy     = Math.sin(angle) * spd;
  b.owner  = owner;
  b.damage = damage;
  b.ttl    = 2.2;
  bullets.push(b);
}

function updateBullets(dt) {
  for (const b of bullets) {
    b.x   += b.vx * dt;
    b.y   += b.vy * dt;
    b.ttl -= dt;
    if (b.ttl <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20)
      b.alive = false;
  }
  bullets = bullets.filter(b => b.alive);
}

// ============================================================
// §8  ENEMIES
// ============================================================
let enemies = [];
const DEATH_DUR = 0.45;

class BaseEnemy extends Entity {
  constructor(x, y, w, h, cfg) {
    super(x, y, w, h);
    this.type          = cfg.type;
    this.hp            = cfg.hp;
    this.maxHp         = cfg.hp;
    this.speed         = cfg.speed;
    this.contactDmg    = cfg.contactDmg || 12;
    this.scoreVal      = cfg.scoreVal;
    this.primaryColor  = cfg.primaryColor;
    this.animFrame     = 0;
    this.animTimer     = 0;
    this.dying         = false;
    this.deathTimer    = 0;
  }

  moveToward(tx, ty, dt) {
    const angle = Math.atan2(ty - this.cy, tx - this.cx);
    this.x += Math.cos(angle) * this.speed * dt;
    this.y += Math.sin(angle) * this.speed * dt;
  }

  tickAnim(dt, dur, frames) {
    this.animTimer += dt;
    if (this.animTimer >= dur) { this.animTimer = 0; this.animFrame = (this.animFrame + 1) % frames; }
  }

  onDeath() { this.dying = true; this.deathTimer = 0; }
}

// ---- Grunt ----
class Grunt extends BaseEnemy {
  constructor(x, y, diff) {
    super(x, y, 14, 14, {
      type: 'grunt', hp: 50 * diff, speed: 58 * diff,
      contactDmg: 12, scoreVal: 10, primaryColor: PAL.RED
    });
  }
  update(dt) {
    if (this.dying) { this.deathTimer += dt; if (this.deathTimer >= DEATH_DUR) this.alive = false; return; }
    this.moveToward(player.cx, player.cy, dt);
    this.tickAnim(dt, 0.12, 4);
  }
}

// ---- Charger ----
class Charger extends BaseEnemy {
  constructor(x, y, diff) {
    super(x, y, 12, 18, {
      type: 'charger', hp: 35 * diff, speed: 145 * diff,
      contactDmg: 22, scoreVal: 20, primaryColor: PAL.ORANGE
    });
    this.phase      = 'wind'; // wind → charge → cool
    this.phaseTimer = 1.4;
    this.cvx = 0; this.cvy = 0;
  }
  update(dt) {
    if (this.dying) { this.deathTimer += dt; if (this.deathTimer >= DEATH_DUR) this.alive = false; return; }
    this.phaseTimer -= dt;
    if (this.phase === 'wind') {
      this.moveToward(player.cx, player.cy, dt * 0.18);
      if (this.phaseTimer <= 0) {
        const a = Math.atan2(player.cy - this.cy, player.cx - this.cx);
        this.cvx = Math.cos(a) * this.speed;
        this.cvy = Math.sin(a) * this.speed;
        this.phase = 'charge'; this.phaseTimer = 0.75;
      }
    } else if (this.phase === 'charge') {
      this.x += this.cvx * dt;
      this.y += this.cvy * dt;
      if (this.phaseTimer <= 0) { this.phase = 'cool'; this.phaseTimer = 0.5; }
    } else {
      if (this.phaseTimer <= 0) { this.phase = 'wind'; this.phaseTimer = 1.4; }
    }
    this.tickAnim(dt, 0.1, 4);
  }
}

// ---- Sniper ----
class Sniper extends BaseEnemy {
  constructor(x, y, diff) {
    super(x, y, 16, 16, {
      type: 'sniper', hp: 80 * diff, speed: 28 * diff,
      contactDmg: 8, scoreVal: 30, primaryColor: PAL.PURPLE
    });
    this.shotTimer = 2.2 / diff;
    this.shotRate  = 2.2 / diff;
    this.glowing   = false;
  }
  update(dt) {
    if (this.dying) { this.deathTimer += dt; if (this.deathTimer >= DEATH_DUR) this.alive = false; return; }
    this.moveToward(player.cx, player.cy, dt);
    this.shotTimer -= dt;
    this.glowing = this.shotTimer < 0.5;
    if (this.shotTimer <= 0) {
      const a = Math.atan2(player.cy - this.cy, player.cx - this.cx);
      spawnBullet(this.cx, this.cy, a, 'enemy', 20);
      this.shotTimer = this.shotRate;
    }
    this.tickAnim(dt, 0.14, 4);
  }
}

function spawnEnemy(type, x, y) {
  const d = diffMult();
  if      (type === 'grunt')   enemies.push(new Grunt(x, y, d));
  else if (type === 'charger') enemies.push(new Charger(x, y, d));
  else if (type === 'sniper')  enemies.push(new Sniper(x, y, d));
}

function diffMult() { return 1 + (currentLevel - 1) * 0.08; }

function updateEnemies(dt) {
  for (const e of enemies) e.update(dt);
  enemies = enemies.filter(e => e.alive);
}

// ============================================================
// §9  PARTICLE SYSTEM
// ============================================================
let particles = [];

function spawnDeathParticles(cx, cy, color) {
  const dirs = [
    {x:-1,y:-1},{x:1,y:-1},{x:-1,y:1},{x:1,y:1},
    {x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}
  ];
  for (const d of dirs) {
    const spd = 35 + Math.random() * 50;
    particles.push({
      x: cx, y: cy,
      vx: d.x * spd + (Math.random()-.5) * 20,
      vy: d.y * spd + (Math.random()-.5) * 20,
      ttl: 0.4 + Math.random() * 0.25, maxTtl: 0.65,
      color, size: 2 + Math.random() * 2
    });
  }
}

function spawnHitSpark(cx, cy) {
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 50 + Math.random() * 70;
    particles.push({
      x: cx, y: cy, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
      ttl: 0.18, maxTtl: 0.18, color: PAL.YELLOW, size: 2
    });
  }
}

function spawnMuzzleFlash(x, y) {
  particles.push({ x, y, vx:0, vy:0, ttl:0.07, maxTtl:0.07, color: PAL.YELLOW, size: 6, flash: true });
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.ttl -= dt;
    p.vx *= 0.92; p.vy *= 0.92;
  }
  particles = particles.filter(p => p.ttl > 0);
}

// ============================================================
// §10  SPRITE DRAW FUNCTIONS
// ============================================================

function drawBackground() {
  ctx.fillStyle = PAL.BLACK;
  ctx.fillRect(0, 0, W, H - 22);
  ctx.strokeStyle = PAL.DARK_GRAY;
  ctx.lineWidth = 1;
  const G = 24;
  for (let x = 0; x < W; x += G) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - 22); ctx.stroke(); }
  for (let y = 0; y < H - 22; y += G) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

function drawPlayer(p) {
  if (p.iframes > 0 && Math.floor(p.iframes * 12) % 2 === 0) return;

  const px   = Math.round(p.cx);
  const py   = Math.round(p.cy);
  const bob  = Math.round(Math.sin(p.bobTimer * 4.5) * 1.0);
  const sway = p.animState === 'walk' ? Math.round(Math.sin(p.bobTimer * 8) * 1) : 0;

  ctx.save();
  ctx.translate(px + sway, py + bob);

  // hs() draws horizontal strips to build a rounded blob shape.
  // strips = array of [yOffset, width] pairs (each strip is 2px tall).
  const hs = (strips, color) => {
    ctx.fillStyle = color;
    for (const [dy, w] of strips) ctx.fillRect(-(w >> 1), dy, w, 2);
  };

  // ── HAIR: 6 nested rounded layers, dark-outside → bright-centre ──
  //
  //  Each inner layer is progressively narrower → creates rounded look.
  //  Reference: sticker art has very large, wide, circular hair mass
  //  with warm orange highlights on top and deep shadow underneath.

  hs([ // LAYER 1 — outer shadow, forms the silhouette
    [-22, 10], [-20, 18], [-18, 26], [-16, 32], [-14, 34],
    [-12, 34], [-10, 32], [-8, 28],  [-6, 24],  [-4, 20],
    [-2, 16],  [0, 12],   [2, 8],    [4, 6],    [6, 4]
  ], '#1e0506');

  hs([ // LAYER 2 — dark red-brown base
    [-20, 14], [-18, 22], [-16, 28], [-14, 30],
    [-12, 30], [-10, 28], [-8, 24],  [-6, 20],
    [-4, 16],  [-2, 12],  [0, 8],    [2, 4]
  ], '#7a1208');

  hs([ // LAYER 3 — main red-orange
    [-20, 10], [-18, 18], [-16, 24], [-14, 26],
    [-12, 26], [-10, 24], [-8, 20],  [-6, 16],
    [-4, 12],  [-2, 8],   [0, 4]
  ], '#c42c10');

  hs([ // LAYER 4 — brighter, front-facing
    [-18, 14], [-16, 20], [-14, 22],
    [-12, 22], [-10, 20], [-8, 16],
    [-6, 12],  [-4, 8]
  ], '#e84020');

  hs([ // LAYER 5 — warm orange highlight (lit from above)
    [-20, 6],  [-18, 10], [-16, 14], [-14, 16],
    [-12, 14], [-10, 10], [-8, 6]
  ], '#f05828');

  hs([ // LAYER 6 — brightest warm tips
    [-22, 4], [-20, 8], [-18, 8], [-16, 8], [-14, 6]
  ], '#f87840');

  hs([ // LAYER 7 — hottest highlight specks at very top
    [-22, 2], [-20, 4], [-18, 4]
  ], '#faa050');

  // ── DARK BERET TUFTS (peeking above hair at top) ─────────────────
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-7, -22, 3, 5);
  ctx.fillRect(4,  -22, 3, 5);
  // tiny red star detail on left tuft
  ctx.fillStyle = '#cc1818';
  ctx.fillRect(-6, -21, 1, 1);
  ctx.fillRect(-7, -20, 3, 1);
  ctx.fillRect(-6, -19, 1, 1);

  // ── BODY (tiny, mostly hidden under hair blob) ────────────────────
  ctx.fillStyle = '#141414';
  ctx.fillRect(-7, -2, 14, 14);

  // ── WHITE COLLAR ─────────────────────────────────────────────────
  ctx.fillStyle = '#dcdcdc';
  ctx.fillRect(-5, -3, 10, 4);
  ctx.fillStyle = '#cc1818';   // red neckerchief
  ctx.fillRect(-2, -3,  4, 6);
  ctx.fillStyle = '#aa1010';
  ctx.fillRect(-1,  2,  2, 2);

  // ── CHIBI ARMS ───────────────────────────────────────────────────
  ctx.fillStyle = '#141414';
  ctx.fillRect(-12, 2, 5, 8);
  ctx.fillRect(7,   2, 5, 8);
  ctx.fillStyle = '#fce4c8';   // pale hands
  ctx.fillRect(-11, 8, 4, 4);
  ctx.fillRect(7,   8, 4, 4);

  // ── DARK SKIRT HINT ──────────────────────────────────────────────
  ctx.fillStyle = '#1a1a28';
  ctx.fillRect(-7, 11, 14, 6);

  // ── FACE (small, cute, nested in hair) ───────────────────────────
  ctx.fillStyle = '#fce4c8';
  ctx.fillRect(-6, -13, 12, 12);
  ctx.fillStyle = '#f0c0a0';   // soft cheek blush
  ctx.fillRect(-6,  -6,  3,  2);
  ctx.fillRect(3,   -6,  3,  2);

  // ── HAIR FRINGE (hangs in front of face sides) ───────────────────
  ctx.fillStyle = '#e84020';
  ctx.fillRect(-8, -13, 2, 10);  // left strand
  ctx.fillRect(6,  -13, 2, 10);  // right strand
  ctx.fillStyle = '#c42c10';
  ctx.fillRect(-9, -13, 2,  8);  // left shadow strand
  ctx.fillRect(7,  -13, 2,  8);  // right shadow strand
  ctx.fillStyle = '#1e0506';
  ctx.fillRect(-9, -13, 1,  5);  // left dark root
  ctx.fillRect(8,  -13, 1,  5);  // right dark root

  // ── EYES (large chibi — amber-golden, matching pixel art ref) ────
  ctx.fillStyle = '#0d0900';     // heavy top lash
  ctx.fillRect(-5, -10, 4, 1);
  ctx.fillRect(1,  -10, 4, 1);
  ctx.fillStyle = '#b87810';     // amber-gold iris outer
  ctx.fillRect(-5,  -9, 4, 3);
  ctx.fillRect(1,   -9, 4, 3);
  ctx.fillStyle = '#e09820';     // bright inner iris
  ctx.fillRect(-4,  -9, 2, 2);
  ctx.fillRect(2,   -9, 2, 2);
  ctx.fillStyle = '#0d0900';     // pupil
  ctx.fillRect(-4,  -9, 1, 2);
  ctx.fillRect(2,   -9, 1, 2);
  ctx.fillStyle = '#ffffff';     // catch-light
  ctx.fillRect(-5,  -9, 1, 1);
  ctx.fillRect(1,   -9, 1, 1);
  ctx.fillStyle = '#c09050';     // lower lid / lash line
  ctx.fillRect(-5,  -6, 4, 1);
  ctx.fillRect(1,   -6, 4, 1);

  // ── NOSE (single pixel row, chibi) ──────────────────────────────
  ctx.fillStyle = '#e8a080';
  ctx.fillRect(-1, -5, 2, 1);

  // ── STOIC MOUTH (flat straight line) ────────────────────────────
  ctx.fillStyle = '#b08068';
  ctx.fillRect(-2, -3, 5, 1);

  // ── CHAIN MACHINE GUN (rotates toward mouse, chibi scale) ────────
  ctx.save();
  ctx.translate(7, 3);
  ctx.rotate(p.aimAngle);

  // Stock
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(-6, -3,  6, 6);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(-5, -2,  2, 4);

  // Receiver
  ctx.fillStyle = '#181818';
  ctx.fillRect(0,  -4, 16, 8);
  ctx.fillStyle = '#8b1010';     // dark red accent
  ctx.fillRect(2,  -3, 12, 2);
  ctx.fillRect(2,   1, 12, 2);
  ctx.fillStyle = '#2e2e2e';     // top rail
  ctx.fillRect(0,  -5, 12, 1);

  // Barrel
  ctx.fillStyle = '#222222';
  ctx.fillRect(14, -2, 20, 4);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(14, -2,  1, 4);

  // Muzzle brake
  ctx.fillStyle = '#181818';
  ctx.fillRect(32, -3,  5, 6);
  ctx.fillStyle = '#484848';
  ctx.fillRect(33, -2,  1, 2);
  ctx.fillRect(35, -2,  1, 2);
  ctx.fillRect(33,  0,  1, 2);
  ctx.fillRect(35,  0,  1, 2);

  // Grip
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(4,  4,  4, 6);
  ctx.fillStyle = '#2e2e2e';
  ctx.fillRect(5,  5,  2, 5);

  // Chain feed
  ctx.fillStyle = '#909090';
  ctx.fillRect(6,  8, 2, 2);
  ctx.fillRect(9, 10, 2, 2);
  ctx.fillRect(12, 8, 2, 2);
  ctx.fillRect(15,10, 2, 2);
  ctx.fillRect(18, 8, 2, 2);
  ctx.fillStyle = '#606060';
  ctx.fillRect(7, 10, 2, 2);
  ctx.fillRect(10,12, 2, 2);
  ctx.fillRect(13,10, 2, 2);

  // Ammo box
  ctx.fillStyle = '#181818';
  ctx.fillRect(5, 13, 12, 7);
  ctx.fillStyle = '#8b1010';
  ctx.fillRect(5, 13,  2, 7);
  ctx.fillStyle = '#2e2e2e';
  ctx.fillRect(6, 14, 10, 2);

  // Muzzle flash
  if (p.flashTimer > 0) {
    ctx.fillStyle = '#ffee00';
    ctx.fillRect(35, -4, 8, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(37, -2, 4, 4);
    ctx.fillStyle = '#ffaa00';
    ctx.fillRect(39, -6, 4, 12);
  }

  ctx.restore();  // gun
  ctx.restore();  // sprite
}

function drawGrunt(e) {
  if (e.dying) { drawDeathEffect(e, PAL.RED); return; }
  const px = Math.round(e.cx), py = Math.round(e.cy);
  ctx.save();
  ctx.translate(px, py);

  // Legs
  ctx.fillStyle = PAL.DARK_GRAY;
  const lo = e.animFrame % 2 === 0 ? 2 : -2;
  ctx.fillRect(-6,  4 + lo, 4, 4);
  ctx.fillRect( 2,  4 - lo, 4, 4);

  // Body
  ctx.fillStyle = PAL.RED;
  ctx.fillRect(-7, -4, 14, 9);
  ctx.fillRect(-5, -10, 10, 7);

  // Eyes
  ctx.fillStyle = PAL.YELLOW;
  ctx.fillRect(-4, -8, 3, 3);
  ctx.fillRect( 1, -8, 3, 3);

  // Frown
  ctx.fillStyle = PAL.DARK_GRAY;
  ctx.fillRect(-3, -3, 2, 1);
  ctx.fillRect( 1, -3, 2, 1);
  ctx.fillRect(-1, -2, 2, 1);

  ctx.restore();
}

function drawCharger(e) {
  if (e.dying) { drawDeathEffect(e, PAL.ORANGE); return; }
  const px = Math.round(e.cx), py = Math.round(e.cy);
  ctx.save();
  ctx.translate(px, py);

  const charging = e.phase === 'charge';
  const bodyCol  = charging ? PAL.YELLOW : PAL.ORANGE;
  const windPct  = e.phase === 'wind' ? Math.max(0, 1 - e.phaseTimer / 1.4) : 0;

  // Wind-up glow
  if (windPct > 0) {
    ctx.globalAlpha = windPct * 0.4;
    ctx.fillStyle = PAL.YELLOW;
    ctx.fillRect(-8, -16, 16, 22);
    ctx.globalAlpha = 1;
  }

  // Legs
  ctx.fillStyle = PAL.BROWN;
  const lo = e.animFrame % 2 === 0 ? 3 : -3;
  ctx.fillRect(-5,  6 + lo, 3, 5);
  ctx.fillRect( 2,  6 - lo, 3, 5);

  // Body — narrow
  ctx.fillStyle = bodyCol;
  ctx.fillRect(-4, -5, 8, 12);
  ctx.fillRect(-3, -12, 6, 8);
  ctx.fillRect(-1, -14, 2, 3); // pointed tip

  // Eye slit
  ctx.fillStyle = PAL.RED;
  ctx.fillRect(-3, -10, 6, 2);

  ctx.restore();
}

function drawSniper(e) {
  if (e.dying) { drawDeathEffect(e, PAL.PURPLE); return; }
  const px = Math.round(e.cx), py = Math.round(e.cy);
  const bob = Math.round(Math.sin(e.animTimer * 6) * 1);
  ctx.save();
  ctx.translate(px, py + bob);

  // Robe body
  ctx.fillStyle = PAL.PURPLE;
  ctx.fillRect(-7,  0, 14, 9);
  ctx.fillRect(-5, -7, 10, 8);
  // Hood
  ctx.fillRect(-4, -13, 8, 7);

  // Eyes
  ctx.fillStyle = PAL.GREEN;
  ctx.fillRect(-3, -11, 2, 2);
  ctx.fillRect( 1, -11, 2, 2);

  // Staff/barrel
  ctx.fillStyle = PAL.LT_GRAY;
  const angle = Math.atan2(player.cy - e.cy, player.cx - e.cx);
  ctx.save();
  ctx.rotate(angle);
  ctx.fillRect(4, -1, 12, 2);
  if (e.glowing) {
    ctx.globalAlpha = 1 - e.shotTimer / 0.5;
    ctx.fillStyle = PAL.YELLOW;
    ctx.fillRect(15, -3, 5, 5);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  ctx.restore();
}

function drawDeathEffect(e, color) {
  const t = e.deathTimer / DEATH_DUR;
  const px = Math.round(e.cx), py = Math.round(e.cy);
  ctx.save();
  ctx.translate(px, py);
  ctx.globalAlpha = 1 - t;
  const dirs = [{x:-1,y:-1},{x:1,y:-1},{x:-1,y:1},{x:1,y:1}];
  for (const d of dirs) {
    const dist = t * 18;
    ctx.fillStyle = color;
    ctx.fillRect(d.x * dist - 3, d.y * dist - 3, 6, 6);
  }
  if (t < 0.35) {
    const f = (1 - t / 0.35) * 9;
    ctx.fillStyle = PAL.WHITE;
    ctx.fillRect(-f/2, -f/2, f, f);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawBullets() {
  for (const b of bullets) {
    if (b.owner === 'player') {
      ctx.fillStyle = PAL.YELLOW;
      ctx.fillRect(Math.round(b.x), Math.round(b.y), 4, 4);
    } else {
      // Enemy bullet — magenta, slightly larger
      ctx.fillStyle = PAL.PINK;
      ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 5, 5);
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    const alpha = p.ttl / p.maxTtl;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    const s = p.size;
    ctx.fillRect(Math.round(p.x - s * 0.5), Math.round(p.y - s * 0.5), Math.ceil(s), Math.ceil(s));
  }
  ctx.globalAlpha = 1;
}

// ============================================================
// §11  LEVEL / WAVE CONFIG
// ============================================================
const LEVEL_DEFS = [
  { waves: [
    { delay: 0,  spawn: [{type:'grunt', n:3}] },
    { delay: 7,  spawn: [{type:'grunt', n:5}] },
  ]},
  { waves: [
    { delay: 0,  spawn: [{type:'grunt', n:4}, {type:'charger', n:2}] },
    { delay: 10, spawn: [{type:'grunt', n:3}, {type:'charger', n:3}] },
  ]},
  { waves: [
    { delay: 0,  spawn: [{type:'grunt', n:5}, {type:'sniper', n:2}] },
    { delay: 12, spawn: [{type:'charger', n:4}, {type:'sniper', n:2}] },
    { delay: 26, spawn: [{type:'grunt', n:6}, {type:'charger', n:2}, {type:'sniper', n:2}] },
  ]},
];

function getLevelDef(n) {
  if (n <= LEVEL_DEFS.length) return LEVEL_DEFS[n - 1];
  // Procedural
  const x = n - LEVEL_DEFS.length;
  const waveCount = 2 + Math.floor(x / 2);
  const gTotal = 5 + x * 3;
  const cTotal = Math.max(0, (n - 2) * 2);
  const sTotal = Math.max(0, (n - 3));
  const delay  = Math.max(5, 10 - Math.min(n, 7));
  const waves  = [];
  for (let w = 0; w < waveCount; w++) {
    const frac = 1 / waveCount;
    const spawn = [];
    const g = Math.round(gTotal * frac); if (g > 0) spawn.push({type:'grunt',   n:g});
    const c = Math.round(cTotal * frac); if (c > 0) spawn.push({type:'charger', n:c});
    const s = Math.round(sTotal * frac); if (s > 0) spawn.push({type:'sniper',  n:s});
    if (spawn.length) waves.push({ delay: w * delay, spawn });
  }
  return { waves };
}

// ============================================================
// §12  WAVE SYSTEM
// ============================================================
const WaveSystem = {
  waveIdx: 0,
  timer: 0,
  done: false,

  reset() { this.waveIdx = 0; this.timer = 0; this.done = false; },

  update(dt) {
    const def = getLevelDef(currentLevel);
    if (this.waveIdx >= def.waves.length) { this.done = true; return; }
    this.timer += dt;
    if (this.timer >= def.waves[this.waveIdx].delay) {
      for (const entry of def.waves[this.waveIdx].spawn) {
        for (let i = 0; i < entry.n; i++) {
          const pos = randomEdgePos();
          spawnEnemy(entry.type, pos.x - 8, pos.y - 8);
        }
      }
      this.waveIdx++;
    }
  }
};

function randomEdgePos() {
  const edge = Math.floor(Math.random() * 4);
  switch (edge) {
    case 0: return { x: Math.random() * W, y: -18 };
    case 1: return { x: W + 18,            y: Math.random() * (H - 24) };
    case 2: return { x: Math.random() * W, y: H - 24 + 18 };
    default:return { x: -18,               y: Math.random() * (H - 24) };
  }
}

// ============================================================
// §13  COLLISION
// ============================================================
function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

function processCollisions() {
  // Player bullets → enemies
  for (const b of bullets) {
    if (!b.alive || b.owner !== 'player') continue;
    for (const e of enemies) {
      if (!e.alive || e.dying) continue;
      if (overlaps(b, e)) {
        e.hp -= b.damage;
        b.alive = false;
        spawnHitSpark(b.cx, b.cy);
        if (e.hp <= 0) { e.onDeath(); score += e.scoreVal; spawnDeathParticles(e.cx, e.cy, e.primaryColor); }
        break;
      }
    }
  }

  if (player.iframes > 0) return;

  // Enemy bullets → player
  for (const b of bullets) {
    if (!b.alive || b.owner !== 'enemy') continue;
    if (overlaps(b, player)) {
      b.alive = false;
      damagePlayer(b.damage, 0.8);
      return;
    }
  }

  // Enemy bodies → player
  for (const e of enemies) {
    if (!e.alive || e.dying) continue;
    if (overlaps(e, player)) {
      damagePlayer(e.contactDmg, 0.35);
      return;
    }
  }
}

function damagePlayer(dmg, iTime) {
  player.hp -= dmg;
  player.iframes = iTime;
  if (player.hp <= 0) {
    player.hp = 0;
    if (score > highScore) {
      highScore = score;
      try { localStorage.setItem('tds_hi', String(highScore)); } catch(_) {}
    }
    SM.transition(States.GAME_OVER);
  }
}

function checkLevelClear() {
  if (WaveSystem.done && enemies.filter(e => e.alive && !e.dying).length === 0) {
    score += 100 * currentLevel;
    SM.transition(States.LEVEL_COMPLETE);
  }
}

// ============================================================
// §14  HUD
// ============================================================
function drawHUD() {
  const by = H - 20;

  // Background strip
  ctx.fillStyle = '#111';
  ctx.fillRect(0, H - 22, W, 22);
  ctx.strokeStyle = PAL.DARK_GRAY;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H - 22); ctx.lineTo(W, H - 22); ctx.stroke();

  // HP bar (80 × 8)
  ctx.fillStyle = PAL.DARK_GRAY;
  ctx.fillRect(4, by, 80, 8);
  const hpFrac = Math.max(0, player.hp) / player.maxHp;
  ctx.fillStyle = hpFrac > 0.3 ? PAL.GREEN : PAL.RED;
  ctx.fillRect(4, by, Math.round(80 * hpFrac), 8);
  ctx.strokeStyle = PAL.LT_GRAY;
  ctx.lineWidth = 1;
  ctx.strokeRect(4, by, 80, 8);

  // HP label
  ctx.fillStyle = PAL.WHITE;
  ctx.font = '5px "Press Start 2P"';
  ctx.textAlign = 'left';
  ctx.fillText('HP', 4, by - 2);

  // Ammo pips
  if (player.reloading) {
    const progress = player.reloadTimer / 2.0;
    ctx.fillStyle = PAL.DARK_GRAY;
    ctx.fillRect(90, by + 1, 90, 6);
    ctx.fillStyle = PAL.ORANGE;
    ctx.fillRect(90, by + 1, Math.round(90 * progress), 6);
    ctx.strokeStyle = PAL.LT_GRAY;
    ctx.strokeRect(90, by + 1, 90, 6);
    ctx.fillStyle = PAL.ORANGE;
    ctx.font = '5px "Press Start 2P"';
    ctx.fillText('RELOAD', 90, by - 2);
  } else {
    const pipW = 3;
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '5px "Press Start 2P"';
    ctx.fillText('AMMO', 90, by - 2);
    for (let i = 0; i < player.maxAmmo; i++) {
      ctx.fillStyle = i < player.ammo ? PAL.YELLOW : PAL.DARK_GRAY;
      ctx.fillRect(90 + i * (pipW + 1), by + 1, pipW, 6);
    }
  }

  // Score + level (right)
  ctx.fillStyle = PAL.WHITE;
  ctx.font = '5px "Press Start 2P"';
  ctx.textAlign = 'right';
  ctx.fillText('LVL ' + currentLevel, W - 4, by);
  ctx.fillText('SCORE ' + String(score).padStart(6, '0'), W - 4, by + 10);
  ctx.textAlign = 'left';
}

// ============================================================
// §15  SCREEN RENDERERS
// ============================================================
function renderMenu() {
  ctx.fillStyle = '#060010';
  ctx.fillRect(0, 0, W, H);

  // Scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);

  // Stars (pseudo-random, stable)
  ctx.fillStyle = PAL.WHITE;
  for (let i = 0; i < 60; i++) {
    const sx = ((i * 137 + 53) % W);
    const sy = ((i * 211 + 17) % (H - 30));
    ctx.fillRect(sx, sy, 1, 1);
  }

  // Title
  ctx.textAlign = 'center';
  // Shadow
  ctx.fillStyle = '#400010';
  ctx.font = '14px "Press Start 2P"';
  ctx.fillText('TOP GUN', W/2 + 2, H/2 - 68 + 2);
  ctx.font = '10px "Press Start 2P"';
  ctx.fillText('SURVIVORS', W/2 + 2, H/2 - 50 + 2);
  // Text
  ctx.fillStyle = PAL.YELLOW;
  ctx.font = '14px "Press Start 2P"';
  ctx.fillText('TOP GUN', W/2, H/2 - 68);
  ctx.fillStyle = PAL.WHITE;
  ctx.font = '10px "Press Start 2P"';
  ctx.fillText('SURVIVORS', W/2, H/2 - 50);

  // Controls
  ctx.fillStyle = PAL.CYAN;
  ctx.font = '5px "Press Start 2P"';
  ctx.fillText('WASD / ARROWS  MOVE', W/2, H/2 - 14);
  ctx.fillText('MOUSE         AIM', W/2, H/2 - 2);
  ctx.fillText('CLICK         SHOOT', W/2, H/2 + 10);
  ctx.fillText('R / AUTO-RELOAD', W/2, H/2 + 22);

  // Blink PRESS ENTER
  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '7px "Press Start 2P"';
    ctx.fillText('PRESS ENTER  OR  CLICK', W/2, H/2 + 48);
  }

  // High score
  ctx.fillStyle = PAL.ORANGE;
  ctx.font = '6px "Press Start 2P"';
  ctx.fillText('BEST: ' + String(highScore).padStart(6, '0'), W/2, H - 14);

  ctx.textAlign = 'left';
}

function renderGame() {
  drawBackground();
  for (const e of enemies) {
    if      (e.type === 'grunt')   drawGrunt(e);
    else if (e.type === 'charger') drawCharger(e);
    else if (e.type === 'sniper')  drawSniper(e);
  }
  drawBullets();
  drawParticles();
  if (player) drawPlayer(player);
  drawHUD();
}

function renderLevelComplete() {
  renderGame();

  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = PAL.YELLOW;
  ctx.font = '9px "Press Start 2P"';
  ctx.fillText('LEVEL ' + currentLevel, W/2, H/2 - 24);
  ctx.fillStyle = PAL.WHITE;
  ctx.font = '7px "Press Start 2P"';
  ctx.fillText('COMPLETE!', W/2, H/2 - 8);

  ctx.fillStyle = PAL.GREEN;
  ctx.font = '6px "Press Start 2P"';
  ctx.fillText('SCORE  ' + String(score).padStart(6, '0'), W/2, H/2 + 12);

  const rem = Math.max(0, 2.5 - SM.timer);
  ctx.fillStyle = PAL.CYAN;
  ctx.font = '5px "Press Start 2P"';
  ctx.fillText('NEXT IN  ' + Math.ceil(rem) + '...', W/2, H/2 + 30);
  ctx.textAlign = 'left';
}

function renderGameOver() {
  ctx.fillStyle = '#180000';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#500';
  ctx.font = '20px "Press Start 2P"';
  ctx.fillText('GAME', W/2+2, H/2-52+2);
  ctx.fillText('OVER', W/2+2, H/2-28+2);
  ctx.fillStyle = PAL.RED;
  ctx.fillText('GAME', W/2, H/2-52);
  ctx.fillStyle = PAL.WHITE;
  ctx.fillText('OVER', W/2, H/2-28);

  ctx.fillStyle = PAL.ORANGE;
  ctx.font = '6px "Press Start 2P"';
  ctx.fillText('SCORE  ' + String(score).padStart(6, '0'), W/2, H/2 + 2);

  if (score >= highScore && score > 0) {
    ctx.fillStyle = PAL.YELLOW;
    ctx.fillText('NEW BEST!', W/2, H/2 + 18);
  } else {
    ctx.fillStyle = PAL.LT_GRAY;
    ctx.fillText('BEST   ' + String(highScore).padStart(6, '0'), W/2, H/2 + 18);
  }

  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '7px "Press Start 2P"';
    ctx.fillText('PRESS ENTER  OR  CLICK', W/2, H/2 + 50);
  }

  ctx.textAlign = 'left';
}

function renderPauseOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = PAL.WHITE;
  ctx.font = '10px "Press Start 2P"';
  ctx.fillText('PAUSED', W/2, H/2 - 10);
  ctx.fillStyle = PAL.CYAN;
  ctx.font = '6px "Press Start 2P"';
  ctx.fillText('ESC TO RESUME', W/2, H/2 + 10);
  ctx.textAlign = 'left';
}

// ============================================================
// §16  MAIN GAME LOOP
// ============================================================
let currentLevel = 1;
let score        = 0;
let highScore    = 0;
try { highScore = parseInt(localStorage.getItem('tds_hi') || '0') || 0; } catch(_) {}

function resetGame() {
  currentLevel = 1;
  score        = 0;
  player       = createPlayer();
  enemies      = [];
  bullets      = [];
  particles    = [];
  WaveSystem.reset();
}

function advanceLevel() {
  currentLevel++;
  enemies   = [];
  bullets   = [];
  particles = [];
  WaveSystem.reset();
  player.hp     = Math.min(player.maxHp, player.hp + 30);
  player.ammo   = player.maxAmmo;
  player.fireCd = 0;
  player.reloading = false;
}

function handleEscape() {
  if      (SM.current === States.PLAYING) SM.transition(States.PAUSED);
  else if (SM.current === States.PAUSED)  SM.transition(States.PLAYING);
}

function handleMenuInput() {
  if (Input.enterThisFrame || Input.clickThisFrame) {
    resetGame();
    SM.transition(States.PLAYING);
  }
}

function handleGameOverInput() {
  if (Input.enterThisFrame || Input.clickThisFrame) {
    SM.transition(States.MENU);
  }
}

function update(dt) {
  switch (SM.current) {
    case States.MENU:
      handleMenuInput();
      Input.flush();
      break;
    case States.PLAYING:
      updatePlayer(dt);
      updateBullets(dt);
      updateEnemies(dt);
      updateParticles(dt);
      processCollisions();
      WaveSystem.update(dt);
      checkLevelClear();
      Input.flush();
      break;
    case States.LEVEL_COMPLETE:
      SM.timer += dt;
      updateParticles(dt);
      if (SM.timer >= 2.5) advanceLevel(), SM.transition(States.PLAYING);
      break;
    case States.GAME_OVER:
      SM.timer += dt;
      handleGameOverInput();
      Input.flush();
      break;
  }
}

function render() {
  ctx.imageSmoothingEnabled = false;
  switch (SM.current) {
    case States.MENU:           renderMenu();          break;
    case States.PLAYING:        renderGame();          break;
    case States.LEVEL_COMPLETE: renderLevelComplete(); break;
    case States.GAME_OVER:      renderGameOver();      break;
    case States.PAUSED:         renderGame(); renderPauseOverlay(); break;
    default:
      ctx.fillStyle = PAL.BLACK;
      ctx.fillRect(0, 0, W, H);
  }
}

const FIXED_DT   = 1 / 60;
let accumulator  = 0;
let lastTime     = 0;

function loop(ts) {
  requestAnimationFrame(loop);
  const raw = Math.min((ts - lastTime) / 1000, 0.1);
  lastTime  = ts;

  if (SM.current === States.PLAYING || SM.current === States.LEVEL_COMPLETE) {
    accumulator += raw;
    while (accumulator >= FIXED_DT) { update(FIXED_DT); accumulator -= FIXED_DT; }
  } else {
    update(raw);
    accumulator = 0;
  }

  render();
}

// ============================================================
// §17  HELPERS + BOOTSTRAP
// ============================================================
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

Input.init();

document.fonts.load('10px "Press Start 2P"')
  .catch(() => {})
  .finally(() => {
    SM.transition(States.MENU);
    requestAnimationFrame(loop);
  });
