# aok_style_rts

An **Age-of-Kings-style browser RTS starter** — a real, running base to build a real-time
strategy game on. No game-engine dependency; just TypeScript + an HTML5 canvas.

## What's in the box
- **Canvas tile map** (56×44) with grass, forests (wood), gold & stone deposits, and a river
- **Four-resource economy** — food / wood / gold / stone, population & pop-cap
- **Units:** Villager (gather / build / fight) and Soldier (attack-move, auto-acquire)
- **Buildings:** Town Center (trains villagers, resource drop-off), House (pop cap), Barracks (trains soldiers)
- **Controls:** drag-select, right-click contextual orders (move / gather / attack), building placement, rally points
- **Systems:** grid **A\*** pathfinding, gathering FSM, construction, training queues, basic combat, camera pan/zoom, **minimap**
- **Fixed-timestep simulation loop** decoupled from rendering

## Run
Requires **Node ≥ 20.19** (Vite 8).
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc (strict) + vite build — the live verify command
npm run preview    # serve the production build
```

## Controls
| Action | Input |
| --- | --- |
| Select | left-click / left-drag box |
| Move · Gather · Attack | right-click (contextual) |
| Build | select a villager → Build House / Barracks → click map |
| Pan | WASD / arrows / screen edge |
| Zoom | mouse wheel |
| Jump | click the minimap |
| Cycle idle villager | `.` next / `,` previous |
| Cancel | Esc |

`window.__aok` exposes live game state for verification, including deterministic session metrics for
selected entities, unit tasks, training queues, incomplete buildings, and remaining map resources. See
`AGENTS.md` for the full induction record.
