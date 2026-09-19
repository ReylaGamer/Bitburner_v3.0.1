/** @param {NS} ns */
export async function main(ns) {
  const DARKWEB_ROOT = "darkweb/";
  const version = String(ns.args[0] ?? "unversioned");
  const hostname = ns.getHostname();
  const statusFile = `${DARKWEB_ROOT}dark-phishing-status.json`;

  ns.disableLog("sleep");
  ns.print(
    `[dark-phishing] running on ${hostname}; deployment ${version}`,
  );

  let tick = 0;
  while (true) {
    const status = {
      kind: "dark-phishing",
      hostname,
      version,
      tick,
      updatedAt: Date.now(),
    };

    ns.write(statusFile, JSON.stringify(status, null, 2), "w");
    tick++;
    await ns.sleep(7000);
  }
}

/**
 * @param {AutocompleteData} data
 */
export function autocomplete(data) {
  return [];
}
