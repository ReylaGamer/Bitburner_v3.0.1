/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("sleep");

  const DARKWEB_ROOT = "darkweb/";
  const HOME = "home";
  const AGENT = `${DARKWEB_ROOT}dark-agent.js`;
  const DEPLOY_VERSION = String(ns.args[0] ?? "unversioned");

  const WORKERS = [
    `${DARKWEB_ROOT}dark-cache.js`,
    `${DARKWEB_ROOT}dark-phishing.js`,
    `${DARKWEB_ROOT}dark-collect.js`,
  ];

  const SCAN_INTERVAL = 5000;
  const source = ns.getHostname();

  ns.print(
    `[dark-agent] running on ${source}; deployment ${DEPLOY_VERSION}`,
  );

  if (source !== HOME) {
    ensureLocalWorkers(ns, WORKERS, DEPLOY_VERSION);
  }

  while (true) {
    const connectedHosts = getConnectedHosts(ns);

    for (const hostname of connectedHosts) {
      if (hostname === HOME || hostname === source) {
        continue;
      }

      if (!hasCurrentBundle(ns, hostname, AGENT, WORKERS, DEPLOY_VERSION)) {
        deployBundle(ns, source, hostname, AGENT, WORKERS, DEPLOY_VERSION);
      }
    }

    if (source !== HOME) {
      ensureLocalWorkers(ns, WORKERS, DEPLOY_VERSION);
    }

    await ns.sleep(SCAN_INTERVAL);
  }
}

/**
 * @param {NS} ns
 * @param {string[]} workers
 * @param {string} version
 */
function ensureLocalWorkers(ns, workers, version) {
  const hostname = ns.getHostname();

  if (hostname === HOME) {
    return;
  }

  const processes = ns.ps(hostname);

  for (const scriptPath of workers) {
    if (processes.some((process) => process.filename === scriptPath)) {
      continue;
    }

    if (!ns.fileExists(scriptPath, hostname)) {
      continue;
    }

    const freeRam = ns.getServerMaxRam(hostname) - ns.getServerUsedRam(hostname);
    const requiredRam = ns.getScriptRam(scriptPath, hostname);

    if (requiredRam > freeRam) {
      continue;
    }

    const pid = ns.exec(scriptPath, hostname, 1, version);

    if (pid > 0) {
      ns.print(
        `[dark-agent] started local worker ${scriptPath} on ${hostname}; PID ${pid}; version ${version}`,
      );
    }
  }
}

/**
 * @param {NS} ns
 * @param {string} hostname
 * @param {string} agentPath
 * @param {string[]} workers
 * @param {string} version
 */
function deployBundle(ns, source, hostname, agentPath, workers, version) {
  try {
    stopManagedProcesses(ns, hostname, [agentPath, ...workers]);

    const toCopy = [agentPath, ...workers];
    const failed = [];

    for (const scriptPath of toCopy) {
      if (!ns.fileExists(scriptPath, source)) {
        failed.push(scriptPath);
        continue;
      }

      const copied = ns.scp(scriptPath, hostname, source);

      if (!copied || !ns.fileExists(scriptPath, hostname)) {
        failed.push(scriptPath);
      }
    }

    if (failed.length > 0) {
      ns.print(
        `[dark-agent] deployment failed on ${hostname}; failed files: ${failed.join(", ")}`,
      );
      return;
    }

    const pid = ns.exec(agentPath, hostname, 1, version);

    if (pid > 0) {
      ns.print(
        `[dark-agent] deployed bundle to ${hostname}; started ${agentPath}; PID ${pid}; version ${version}`,
      );
    } else {
      ns.print(
        `[dark-agent] bundle copied to ${hostname}, but failed to start ${agentPath}`,
      );
    }
  } catch (error) {
    ns.print(
      `[dark-agent] deployment error on ${hostname}: ${String(error)}`,
    );
  }
}

/**
 * @param {NS} ns
 * @param {string} hostname
 * @param {string} agentPath
 * @param {string[]} workers
 * @param {string} version
 * @returns {boolean}
 */
function hasCurrentBundle(ns, hostname, agentPath, workers, version) {
  const managedFiles = [agentPath, ...workers];

  if (!managedFiles.every((scriptPath) => ns.fileExists(scriptPath, hostname))) {
    return false;
  }

  return ns.ps(hostname).some(
    (process) => process.filename === agentPath && process.args?.[0] === version,
  );
}

/**
 * @param {NS} ns
 * @param {string} hostname
 * @param {string[]} files
 */
function stopManagedProcesses(ns, hostname, files) {
  if (!hostname || hostname === "home") {
    return;
  }

  for (const process of ns.ps(hostname)) {
    if (files.includes(process.filename)) {
      ns.kill(process.pid, hostname);
    }
  }
}

/**
 * @param {NS} ns
 * @returns {string[]}
 */
function getConnectedHosts(ns) {
  try {
    return ns.scan(ns.getHostname());
  } catch (error) {
    return [];
  }
}

/**
 * @param {AutocompleteData} data
 */
export function autocomplete(data) {
  return [];
}
