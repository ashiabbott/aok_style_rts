import { BUILDING_DEFS, UNIT_DEFS } from "./config";
import type { Game, GameSnapshot } from "./game";
import type { BuildingKind, Resources, UnitKind } from "./types";

const RES_META: { key: keyof Resources; label: string; color: string }[] = [
  { key: "food", label: "Food", color: "#d96a6a" },
  { key: "wood", label: "Wood", color: "#9c7b46" },
  { key: "gold", label: "Gold", color: "#d8a93a" },
  { key: "stone", label: "Stone", color: "#9aa3ad" },
];

export class Hud {
  private game: Game;
  private resEls = new Map<keyof Resources, HTMLElement>();
  private popEl!: HTMLElement;
  private timeEl!: HTMLElement;
  private selTitle!: HTMLElement;
  private selBody!: HTMLElement;
  private actions!: HTMLElement;
  private toast!: HTMLElement;

  constructor(root: HTMLElement, game: Game) {
    this.game = game;
    this.build(root);
  }

  private build(root: HTMLElement): void {
    const top = el("div", "hud-top");
    for (const m of RES_META) {
      const chip = el("div", "res-chip");
      const dot = el("span", "res-dot");
      dot.style.background = m.color;
      const val = el("span", "res-val");
      val.textContent = "0";
      chip.append(dot, document.createTextNode(m.label + " "), val);
      chip.title = m.label;
      this.resEls.set(m.key, val);
      top.append(chip);
    }
    this.popEl = el("div", "res-chip pop");
    this.timeEl = el("div", "res-chip time");
    top.append(this.popEl, this.timeEl);

    const panel = el("div", "hud-panel");
    const sel = el("div", "hud-selection");
    this.selTitle = el("div", "sel-title");
    this.selTitle.textContent = "Nothing selected";
    this.selBody = el("div", "sel-body");
    sel.append(this.selTitle, this.selBody);
    this.actions = el("div", "hud-actions");
    panel.append(sel, this.actions);

    const help = el("div", "hud-help");
    help.innerHTML =
      "<b>Left-drag</b> select · <b>Right-click</b> move / gather / attack · <b>Wheel</b> zoom · <b>WASD</b> pan · <b>Esc</b> cancel";

    this.toast = el("div", "hud-toast");

    root.append(top, this.toast, panel, help);
    this.bindActions();
  }

  private actionDefs: { id: string; label: string; run: () => void; show: (s: GameSnapshot) => boolean }[] = [];

  private bindActions(): void {
    this.actionDefs = [
      action("Train Villager", () => this.game.trainFromSelected("villager"), (s) =>
        s.selected.some((e) => e.kind === "town_center" && e.owner === "player" && (e.buildProgress ?? 0) >= 1), "villager"),
      action("Train Soldier", () => this.game.trainFromSelected("soldier"), (s) =>
        s.selected.some((e) => e.kind === "barracks" && e.owner === "player" && (e.buildProgress ?? 0) >= 1), "soldier"),
      buildAction("Build House", "house", this.game),
      buildAction("Build Barracks", "barracks", this.game),
    ];
  }

  render(s: GameSnapshot): void {
    for (const m of RES_META) this.resEls.get(m.key)!.textContent = String(Math.floor(s.resources[m.key]));
    this.popEl.textContent = `Pop ${s.pop}/${s.popCap}`;
    this.popEl.classList.toggle("warn", s.pop >= s.popCap);
    this.timeEl.textContent = clock(s.time);

    // selection summary
    if (s.placement) {
      this.selTitle.textContent = `Placing ${BUILDING_DEFS[s.placement].name}`;
      this.selBody.textContent = "Click the map to place · Esc to cancel";
    } else if (s.selected.length === 0) {
      this.selTitle.textContent = "Nothing selected";
      this.selBody.textContent = "Select your blue units and buildings to give orders.";
    } else if (s.selected.length === 1) {
      const e = s.selected[0];
      const name = e.category === "building" ? BUILDING_DEFS[e.kind as BuildingKind].name : UNIT_DEFS[e.kind as UnitKind].name;
      this.selTitle.textContent = `${name}${e.owner === "enemy" ? " (enemy)" : ""}`;
      const bits = [`HP ${Math.ceil(e.hp)}/${e.maxHp}`];
      if (e.task) bits.push(`task: ${e.task.type}`);
      if ((e.buildProgress ?? 1) < 1) bits.push(`building ${Math.round((e.buildProgress ?? 0) * 100)}%`);
      if (e.trainQueue && e.trainQueue.length > 0) bits.push(`training ${e.trainQueue.length} (${Math.ceil(e.trainQueue[0].remaining)}s)`);
      if (e.carrying) bits.push(`carrying ${Math.round(e.carrying.amount)} ${e.carrying.kind}`);
      this.selBody.textContent = bits.join(" · ");
    } else {
      const villagers = s.selected.filter((e) => e.kind === "villager").length;
      const soldiers = s.selected.filter((e) => e.kind === "soldier").length;
      this.selTitle.textContent = `${s.selected.length} selected`;
      this.selBody.textContent = `${villagers} villagers · ${soldiers} soldiers`;
    }

    // contextual actions
    this.actions.replaceChildren();
    for (const a of this.actionDefs) {
      if (!a.show(s)) continue;
      const btn = el("button", "action-btn") as HTMLButtonElement;
      btn.type = "button";
      btn.textContent = a.label;
      btn.addEventListener("click", a.run);
      this.actions.append(btn);
    }

    // toast
    if (s.message) {
      this.toast.textContent = s.message;
      this.toast.classList.add("show");
    } else {
      this.toast.classList.remove("show");
    }
  }
}

function el(tag: string, cls?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function clock(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function costLabel(kind: UnitKind | BuildingKind): string {
  const cost = kind === "villager" || kind === "soldier" ? UNIT_DEFS[kind].cost : BUILDING_DEFS[kind].cost;
  return (Object.entries(cost) as [string, number][]).map(([k, v]) => `${v}${k[0].toUpperCase()}`).join(" ");
}

function action(
  label: string,
  run: () => void,
  show: (s: GameSnapshot) => boolean,
  costKind: UnitKind | BuildingKind,
) {
  return { id: label, label: `${label} (${costLabel(costKind)})`, run, show };
}

function buildAction(label: string, kind: BuildingKind, game: Game) {
  return {
    id: label,
    label: `${label} (${costLabel(kind)})`,
    run: () => game.enterPlacement(kind),
    show: (s: GameSnapshot) => s.selected.some((e) => e.kind === "villager" && e.owner === "player"),
  };
}
