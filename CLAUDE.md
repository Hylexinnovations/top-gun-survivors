# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

Open `index.html` directly in a browser — no build step, no server required. For live-reload during development:

```bash
npx serve .          # or any static file server
python3 -m http.server 8080
```

## Git Workflow

Every meaningful change must be committed with a clean message and pushed to GitHub:

```bash
git add <specific files>
git commit -m "short imperative summary

- bullet detail
- bullet detail"
git push
```

Remote: `https://github.com/Hylexinnovations/top-gun-survivors` (branch: `main`)

## Architecture

The entire game lives in two files: `index.html` (canvas + font CDN) and `game.js` (all logic).

`game.js` is organized into 17 numbered sections (marked `§1` … `§17`) in this order:

| § | Name | Key contents |
|---|------|-------------|
| 1 | Constants & Palette | `W=480`, `H=360`, `PAL` color table |
| 2 | Canvas Setup | Fixed logical resolution, CSS `pixelated` scaling, `resizeCanvas()` |
| 3 | Input Manager | `Input` object — `keys{}`, `mouse`, `clickThisFrame`, `enterThisFrame`, `flush()` |
| 4 | State Machine | `States` enum, `SM` object with `transition(next)` |
| 5 | Entity Base | `Entity` class — `x,y,w,h,vx,vy,alive`, computed `cx/cy` |
| 6 | Player | `createPlayer()`, `updatePlayer(dt)` — movement, aim, fire, reload, iframes, animation |
| 7 | Bullets | `spawnBullet()`, `updateBullets(dt)` — `owner:'player'\|'enemy'` distinguishes teams |
| 8 | Enemies | `BaseEnemy` → `Grunt`, `Charger`, `Sniper`; `spawnEnemy()`, `diffMult()` |
| 9 | Particles | `spawnDeathParticles`, `spawnHitSpark`, `spawnMuzzleFlash`, `updateParticles(dt)` |
| 10 | Sprite Draw | `drawPlayer`, `drawGrunt`, `drawCharger`, `drawSniper`, `drawDeathEffect`, `drawBullets`, `drawParticles` |
| 11 | Level Config | `LEVEL_DEFS` (3 handcrafted), `getLevelDef(n)` (procedural for n > 3) |
| 12 | Wave System | `WaveSystem` object — `reset()`, `update(dt)`, `randomEdgePos()` |
| 13 | Collision | `overlaps(a,b)` AABB, `processCollisions()`, `damagePlayer()`, `checkLevelClear()` |
| 14 | HUD | `drawHUD()` — HP bar, ammo pips / reload bar, score, level |
| 15 | Screen Renderers | `renderMenu`, `renderGame`, `renderLevelComplete`, `renderGameOver`, `renderPauseOverlay` |
| 16 | Game Loop | `resetGame()`, `advanceLevel()`, fixed-timestep accumulator, `update(dt)` / `render()` dispatch |
| 17 | Bootstrap | Font load → `SM.transition(MENU)` → `requestAnimationFrame(loop)` |

### State machine

```
LOADING → MENU → PLAYING ←→ PAUSED
                   ↓               ↓
           LEVEL_COMPLETE → PLAYING (next level)
                   ↓
               GAME_OVER → MENU
```

`SM.transition(state)` resets `SM.timer` to 0. The `LEVEL_COMPLETE` state auto-advances after 2.5 s via `SM.timer`.

### Game loop

Uses a fixed-timestep accumulator (60 Hz) when `PLAYING` or `LEVEL_COMPLETE`. All other states receive raw `dt`. `Input.flush()` is called once per logical tick to clear single-frame flags (`clickThisFrame`, `enterThisFrame`).

### Entities & mutable arrays

`player`, `enemies[]`, `bullets[]`, `particles[]` are module-level globals. Arrays are filtered each tick (`array = array.filter(e => e.alive)`). Entities signal removal by setting `alive = false`.

### Enemy types

| Class | Behavior | Phase/state fields |
|-------|----------|--------------------|
| `Grunt` | Beelines at player every tick | — |
| `Charger` | `wind → charge → cool` cycle; locks aim direction at charge time | `phase`, `phaseTimer`, `cvx/cvy` |
| `Sniper` | Drifts slowly, fires bullets on `shotTimer` | `shotTimer`, `shotRate`, `glowing` |

All enemy stats are multiplied by `diffMult()` = `1 + (currentLevel-1) * 0.08` at spawn time.

### Rendering

All sprites are drawn with Canvas 2D primitives (`fillRect`, `arc`, `save/translate/rotate/restore`) — no image assets. Always set `ctx.imageSmoothingEnabled = false` after state changes. Mouse coordinates must be transformed from CSS space to logical canvas space using `getBoundingClientRect` scale factors (already handled in `Input.init()`).

### Adding a new enemy type

1. Create a class extending `BaseEnemy` in §8.
2. Add a `drawXxx(e)` function in §10 following the same `ctx.save/translate/restore` pattern.
3. Register it in `spawnEnemy()`.
4. Reference it in `renderGame()` dispatch and in `LEVEL_DEFS` / `getLevelDef()`.
