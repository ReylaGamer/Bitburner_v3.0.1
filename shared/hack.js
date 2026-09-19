/**
 * @param {NS} ns
 */
export async function main(ns) {
  const target = String(ns.args[0] ?? "");
  const delay = Math.max(0, Number(ns.args[1]) || 0);
  const batchId = String(ns.args[2] ?? "");
  const runId = String(ns.args[3] ?? "");
  const incomePort = Number(ns.args[4] ?? 0);

  if (!target) {
    return;
  }

  if (delay > 0) {
    await ns.sleep(delay);
  }

  const amount = await ns.hack(target);

  if (
    amount > 0 &&
    runId &&
    Number.isInteger(incomePort) &&
    incomePort >= 1 &&
    incomePort <= 20
  ) {
    ns.writePort(
      incomePort,
      JSON.stringify({
        runId,
        batchId,
        type: "hack",
        target,
        amount,
      }),
    );
  }
}
