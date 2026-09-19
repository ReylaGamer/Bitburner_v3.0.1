/** @param {NS} ns */
export async function main(ns) {
  const DARKWEB_ROOT = "darkweb/";
  const version = String(ns.args[0] ?? "unversioned");
  const hostname = ns.getHostname();
  const statusFile = `${DARKWEB_ROOT}dark-collect-status.json`;

  ns.disableLog("sleep");
  ns.print(
    `[dark-collect] running on ${hostname}; deployment ${version}`,
  );

  let tick = 0;
  while (true) {
    const status = {
      kind: "dark-collect",
      hostname,
      version,
      tick,
      updatedAt: Date.now(),
    };

    ns.write(statusFile, JSON.stringify(status, null, 2), "w");
    tick++;
    await ns.sleep(8000);
  }
}

/**
 * @param {AutocompleteData} data
 */
export function autocomplete(data) {
  return [];
}
