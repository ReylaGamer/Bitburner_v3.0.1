/** @param {NS} ns */
export async function main(ns) {
  const HOME = "home";
  const DEPLOY_VERSION = "2026-09-19.14";

  const STARTUP_SCRIPTS = [
    "dark-agent.js",
    "dark-password-review.js",
  ];

  const hostname = ns.getHostname();

  if (hostname !== HOME) {
    ns.tprint(
      `[dark-startup] must run on ${HOME}; current host is ${hostname}`,
    );
    return;
  }

  ns.disableLog("sleep");
  ns.tprint(`[dark-startup] launching release ${DEPLOY_VERSION}`);

  stopExistingStartupScripts(ns, STARTUP_SCRIPTS);

  let startedCount = 0;

  for (const script of STARTUP_SCRIPTS) {
    const scriptPath = `${script}`;

    if (!ns.fileExists(scriptPath, HOME)) {
      ns.tprint(`[dark-startup] missing startup script: ${scriptPath}`);
      continue;
    }

    const pid = ns.exec(scriptPath, HOME, 1, DEPLOY_VERSION);

    if (pid > 0) {
      startedCount++;
      ns.tprint(
        `[dark-startup] started ${scriptPath}; PID ${pid}; version ${DEPLOY_VERSION}`,
      );
    } else {
      ns.tprint(`[dark-startup] failed to start ${scriptPath}`);
    }
  }

  ns.tprint(
    `[dark-startup] release ${DEPLOY_VERSION} started ` +
    `${startedCount}/${STARTUP_SCRIPTS.length} scripts; exiting`,
  );
}

/**
 * @param {NS} ns
 * @param {string[]} scripts
 */
function stopExistingStartupScripts(ns, scripts) {
  for (const process of ns.ps("home")) {
    const filename = process.filename;
    const isDarkwebStartup = scripts.some(
      (script) => filename === `${script}` || filename.beginsWith(`${script}`),
    );

    if (!isDarkwebStartup) {
      continue;
    }

    ns.kill(process.pid, "home");
    ns.tprint(
      `[dark-startup] stopped prior ${process.filename}; PID ${process.pid}`,
    );
  }
}
