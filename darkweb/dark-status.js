/** @param {NS} ns */
export async function main(ns) {
  const version = String(ns.args[0] ?? "unversioned");
  const hostname = ns.getHostname();
  const STATUS_FILE = `dark-status.json`;
  const STATUS_INTERVAL = 5000;

  ns.disableLog("sleep");
  ns.print(
    `[dark-status] running on ${hostname}; deployment ${version}`,
  );

  while (true) {
    const status = {
      hostname,
      version,
      updatedAt: Date.now(),
      processes: ns.ps(hostname).map((process) => ({
        pid: process.pid,
        filename: process.filename,
        args: process.args,
      })),
    };

    ns.write(STATUS_FILE, JSON.stringify(status, null, 2), "w");
    await ns.sleep(STATUS_INTERVAL);
  }
}
