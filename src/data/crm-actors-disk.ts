import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { actorOf, CRM_ACTORS, defaultActorsState, type CrmActorsState } from "./crm-actors";

function fileOf() {
  return join(process.cwd(), "storage", "crm-actors.json");
}

export function loadActors(): CrmActorsState {
  const base = defaultActorsState();
  try {
    if (!existsSync(fileOf())) return base;
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<CrmActorsState>;
    const name = String(raw.humanName || "").trim() || base.humanName;
    const byId = new Map((raw.actors || []).map((a) => [actorOf(a.id), a]));
    return {
      humanName: name,
      actors: CRM_ACTORS.map((a) => {
        const hit = byId.get(a.id);
        return { ...a, name: a.id === "human" ? name : String(hit?.name || a.name) };
      }),
    };
  } catch {
    return base;
  }
}

export function saveActors(next: { humanName?: string }): CrmActorsState {
  const cur = loadActors();
  const humanName = String(next.humanName || cur.humanName).trim() || cur.humanName;
  const state: CrmActorsState = {
    humanName,
    actors: CRM_ACTORS.map((a) => ({ ...a, name: a.id === "human" ? humanName : a.name })),
  };
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(state, null, 0), "utf8");
  return state;
}
