import type { OfflineReport } from "../game/offline";
import { fmt } from "./format";

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function showWelcomeBack(report: OfflineReport): void {
  const overlay = document.createElement("div");
  overlay.className = "wb-overlay";
  const capped = report.cappedSec < report.elapsedSec;
  overlay.innerHTML = `
    <div class="wb-box">
      <h3>Welcome back!</h3>
      <p>
        While you were away (${fmtDuration(report.elapsedSec)}${capped ? `, capped at ${fmtDuration(report.cappedSec)}` : ""}),
        your ducks mined <b>${fmt(report.goldGained)} gold</b>
        at ${Math.round(report.rate * 100)}% efficiency
        and earned <b>${fmt(report.xpGained)} XP</b>${report.levelsGained > 0 ? ` — <b>${report.levelsGained} level${report.levelsGained === 1 ? "" : "s"} gained!</b>` : "."}
      </p>
      <button class="wb-close">Quack on</button>
    </div>
  `;
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector(".wb-close")!.addEventListener("click", close);
  document.body.appendChild(overlay);
}
