import "./style.css";
import { SIM_DT } from "./game/config";
import { Game } from "./game/game";
import { Hud } from "./game/hud";
import { Input } from "./game/input";
import { render } from "./game/renderer";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app root not found");

app.innerHTML = "";
const canvas = document.createElement("canvas");
canvas.className = "game-canvas";
const hudRoot = document.createElement("div");
hudRoot.className = "hud-root";
app.append(canvas, hudRoot);

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2D canvas context unavailable");

const game = new Game();
const input = new Input(canvas, game);
const hud = new Hud(hudRoot, game);

let dpr = Math.min(2, window.devicePixelRatio || 1);
function resize(): void {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const vw = app!.clientWidth;
  const vh = app!.clientHeight;
  canvas.width = Math.floor(vw * dpr);
  canvas.height = Math.floor(vh * dpr);
  canvas.style.width = `${vw}px`;
  canvas.style.height = `${vh}px`;
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.camera.setViewport(vw, vh);
}
window.addEventListener("resize", resize);
resize();

let hudDirty = true;
game.onChange = () => { hudDirty = true; };

let last = performance.now() / 1000;
let acc = 0;
let hudTimer = 0;

function frame(nowMs: number): void {
  const now = nowMs / 1000;
  let dt = now - last;
  last = now;
  if (dt > 0.25) dt = 0.25; // clamp after tab switches

  input.updateCamera(dt);

  acc += dt;
  let steps = 0;
  while (acc >= SIM_DT && steps < 6) {
    game.update(SIM_DT);
    acc -= SIM_DT;
    steps++;
  }

  render(ctx!, game, input.renderInput());

  hudTimer += dt;
  if (hudDirty || hudTimer >= 0.15) {
    hud.render(game.snapshot());
    hudDirty = false;
    hudTimer = 0;
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Verification hook: lets a headless browser inspect/advance live game state.
interface AokHook {
  game: Game;
  state: () => {
    entities: number;
    playerUnits: number;
    enemyUnits: number;
    buildings: number;
    resources: typeof game.resources;
    pop: number;
    popCap: number;
    time: number;
  };
}
const hook: AokHook = {
  game,
  state: () => {
    let playerUnits = 0;
    let enemyUnits = 0;
    let buildings = 0;
    for (const e of game.entities.values()) {
      if (e.category === "building") buildings++;
      else if (e.owner === "player") playerUnits++;
      else if (e.owner === "enemy") enemyUnits++;
    }
    return {
      entities: game.entities.size,
      playerUnits,
      enemyUnits,
      buildings,
      resources: { ...game.resources },
      pop: game.pop,
      popCap: game.popCap,
      time: game.time,
    };
  },
};
(window as unknown as { __aok: AokHook }).__aok = hook;
