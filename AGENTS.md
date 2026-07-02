# aok_style_rts — Codex Company OS project

Status: **INDUCTED** (real, buildable, live-verified). Replaces the prior concept-only stub.
Inducted per `docs/CODEX_PROJECT_INDUCTION.md` (7-stage doctrine).

## Identity & secrets (Stage 1)
- **Identity:** `ashiashiofu@gmail.com` — global org Google SSO default. No project-specific override.
- **Vault binding:** Azure Key Vault `Ashiuche` via the Secret Access Broker. This is a **client-only**
  browser game with **no** server, no network calls, and no secrets — nothing is hardcoded because nothing is needed.

## What it is
An Age-of-Kings-style browser RTS **starter**: a canvas-rendered tile map, a four-resource economy
(food/wood/gold/stone), villagers + soldiers, town center / house / barracks buildings, drag-selection,
right-click contextual commands (move / gather / build / attack), grid A* pathfinding, a minimap, and a
fixed-timestep simulation loop.

## Stack (latest stable)
- **Vite 8** · **TypeScript 6** (strict: `erasableSyntaxOnly`, `verbatimModuleSyntax`, `noUnusedLocals`)
- HTML5 **Canvas 2D** rendering (no game-engine dependency — pure TS)
- **Build/runtime requires Node ≥ 20.19** (Vite 8 / rolldown native binding). Built & verified on Node 24.15.0.

## Architecture / knowledge (Stage 3 — from real code)
- **Scenes/views:** 1 (single full-screen canvas game scene) — `routes = 1`
- **API:** none (client-only) — `api = 0`
- **Data models:** `Entity`, `ResourceNode`, `TrainOrder`, `UnitTask`, `Resources`, `Vec2`, terrain/owner/kind unions (`src/game/types.ts`)
- **Systems (the "jobs"/sim loop):** fixed-step `Game.update` driving movement, gathering FSM, construction, unit training queues, and combat/auto-attack; plus camera, input, renderer, A* pathfinding, HUD.
- Languages: typescript · UI: yes (canvas + DOM HUD) · Figma source-of-truth: `none-yet`
- Files: `src/game/{config,types,grid,camera,pathfinding,entities,game,renderer,input,hud}.ts` + `src/main.ts`.

## Verification spine (Stage 4)
- **Live verify command:** `npm run build` (`tsc` strict + `vite build`) — must pass.
- **Scene smoke (live):** `npm run preview`, load the page; `window.__aok.state()` shows the loop advancing
  (time increases), the world populated (player units + enemy units + buildings), deterministic session metrics
  for unit tasks / queues / resource nodes, and issuing a gather order raises the wood count
  (villager walk → harvest → deposit). Zero console errors.
- **Definition of Done:** `npm run build` passes under Node ≥ 20.19; the scene boots; the loop advances; selection
  + a right-click order still produce the expected unit task; no console errors.

## Run
```bash
nvm use 22   # or any Node >= 20.19
npm install
npm run dev      # http://localhost:5173
npm run build && npm run preview
```

## Controls
Left-drag = box select · Left-click = select · Right-click = move / gather / attack (contextual) ·
Wheel = zoom · WASD / arrows / screen-edge = pan · minimap = jump · Esc = cancel placement / clear selection.

## Fleet
Canonical home: **win-main** `C:\Users\abbot\aok_style_rts`. Mirrored to mac-main, win-worker, ec2-control
via `scripts/sync-project-fleet.ps1` (origin git clone where auth exists, else zip mirror).
