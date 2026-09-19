export function injectOverviewHUD(
  ns,
  target,
  engineStatus,
  hackPercent,
  currentPad,
  batchRatio,
  maxRam,
  usedRam,
  income,
  exp,
  efficiency,
  cloudStatus,
  incomeHistoryPoints,
  expHistoryPoints,
) {
  const doc = eval("document");

  if (!doc) {
    return;
  }

  const hook0 = doc.getElementById("overview-extra-hook-0");
  const hook1 = doc.getElementById("overview-extra-hook-1");

  const hostSummary = [
    `Target: ${target || "none"}`,
    `Engine: ${engineStatus || "idle"}`,
    `Batch: ${(Number(hackPercent) * 100 || 0).toFixed(1)}%`,
    `Pad: ${Number(currentPad) || 0}ms`,
    `Ratio: ${Number(batchRatio) || 0}`,
    `RAM: ${(Number(usedRam) || 0).toFixed(1)} / ${(Number(maxRam) || 0).toFixed(1)} GB`,
    `Income: $${(Number(income) || 0).toFixed(2)}/s`,
    `EXP: ${(Number(exp) || 0).toFixed(0)}/s`,
    `Eff: ${(Number(efficiency) || 0).toFixed(4)}`,
    `Cloud: ${cloudStatus || "idle"}`,
  ];

  const incomePoints = Array.isArray(incomeHistoryPoints)
    ? incomeHistoryPoints.slice(-8)
    : [];
  const expPoints = Array.isArray(expHistoryPoints)
    ? expHistoryPoints.slice(-8)
    : [];

  const graphRows = [];
  for (let index = 0; index < Math.max(incomePoints.length, expPoints.length); index++) {
    const incomeValue = incomePoints[index] ?? 0;
    const expValue = expPoints[index] ?? 0;
    graphRows.push(
      `<div class="hud-row"><span>t${index}</span><span>$${(Number(incomeValue) || 0).toFixed(0)}</span><span>EXP ${(Number(expValue) || 0).toFixed(0)}</span></div>`,
    );
  }

  const markup = `
    <style>
      .batcher-hud {
        font-family: monospace;
        font-size: 11px;
        color: #dfe9ff;
        background: rgba(11, 20, 35, 0.85);
        border: 1px solid rgba(130, 170, 255, 0.5);
        border-radius: 8px;
        padding: 8px 10px;
        box-shadow: inset 0 0 10px rgba(120, 160, 255, 0.12);
      }
      .batcher-hud-title {
        font-weight: 700;
        color: #8fc3ff;
        margin-bottom: 4px;
        letter-spacing: 0.05em;
      }
      .batcher-hud-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 2px;
      }
      .hud-row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        opacity: 0.95;
      }
      .hud-row span:nth-child(2) {
        color: #93ffc0;
      }
      .hud-row span:nth-child(3) {
        color: #ffd37d;
      }
    </style>
    <div class="batcher-hud">
      <div class="batcher-hud-title">[HWGW BATCHER]</div>
      <div class="batcher-hud-grid">
        ${hostSummary.map((line) => `<div>${line}</div>`).join("")}
        ${graphRows.join("")}
      </div>
    </div>
  `;

  if (hook0) {
    hook0.innerHTML = markup;
  }

  if (hook1) {
    hook1.innerHTML = "";
  }
}
