import type { TutorialStageId } from "@gamedesign/shared";
import type { TutorialStep } from "./types";
import { useConnectionStore } from "../state/connectionStore";

// Lazy baseline set by gate on first call when game is available.
// Reset to null by onEnter so tutorial restarts work correctly.
let harvestedBaseline: number | null = null;

export const TUTORIAL_STEPS: Record<TutorialStageId, TutorialStep[]> = {
  1: [
    {
      // Step 0 — welcome; "Weiter" button advances and enables field interaction
      text: "Willkommen auf deinem Hof! Hier lernst du, wie du Weizen anbauen und ernten kannst.",
      reveals: ["goldHud", "exitButton"],
    },
    {
      // Step 1 — sow; gate auto-advances as soon as any field starts sowing
      text: "Klicke auf eines deiner Felder (das + Symbol), um Weizen zu säen.",
      highlight: { kind: "field", owner: "player", index: 0 },
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        return (
          game.players[pid]?.fields.some((f) => f.stage !== "empty") ?? false
        );
      },
    },
    {
      // Step 2 — wait for growth; gate auto-advances when a field turns ready
      text: "Gut! Dein Weizen wächst. Wenn er reif ist, kannst du ihn ernten.",
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        return (
          game.players[pid]?.fields.some((f) => f.stage === "ready") ?? false
        );
      },
    },
    {
      // Step 3 — harvest; gate lazily sets a baseline on first call, then
      // auto-advances the moment fieldsHarvested increases. onEnter resets
      // the baseline so a tutorial restart reinitializes correctly.
      text: "Reif! Klicke auf das gold-umrandete Feld, um zu ernten und Gold zu verdienen.",
      onEnter: () => {
        harvestedBaseline = null;
      },
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        const count = game.players[pid]?.stats.fieldsHarvested ?? 0;
        if (harvestedBaseline === null) {
          harvestedBaseline = count;
          return false;
        }
        return count > harvestedBaseline;
      },
    },
    {
      // Step 4 — upgrade task; gate auto-advances when tools ≥ 3 AND fertilizer ≥ 2
      text: "Sehr gut! Jetzt upgrade dein Werkzeug auf Stufe 3 und deinen Dünger auf Stufe 3.",
      reveals: ["toolsCard", "fertilizerCard"],
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        const tools = game.players[pid]?.tools ?? [];
        const toolsLevel = tools.find((t) => t.id === "tools")?.level ?? 1;
        const fertLevel = tools.find((t) => t.id === "fertilizer")?.level ?? 1;
        return toolsLevel >= 3 && fertLevel >= 3;
      },
    },
    {
      // Step 5 — completion; "Fertig" button finishes the tutorial
      text: "Perfekt! Du kennst jetzt die Grundlagen. Du kannst mit dem nächsten Level fortfahren.",
    },
  ],
  2: [],
  3: [],
};
