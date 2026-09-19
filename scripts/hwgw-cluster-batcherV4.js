import { injectOverviewHUD } from "/shared/batcher-hud.js";

let lastLoggedError = "";

/**
 * @param {NS} ns
 */
export async function main(ns) {
  const BASE_PAD = 40;
  const HOME_RAM_RESERVE = 48;
  const MAX_GRAPH_SLOTS = 26;
  const MIN_CASH_RESERVE = 500000;

  const TARGET_REFRESH_INTERVAL = 10000;
  const TARGET_SWITCH_MARGIN = 0.10;

  const INCOME_PORT = 20;
  const LOCK_FILE = "/hwgw-cluster-batcher-lock.txt";

  const HACK_SCRIPT = "/shared/hack.js";
  const WEAKEN_SCRIPT = "/shared/weaken.js";
  const GROW_SCRIPT = "/shared/grow.js";
  const ALL_SCRIPTS = [
    HACK_SCRIPT,
    WEAKEN_SCRIPT,
    GROW_SCRIPT,
  ];

  const HACK_PERCENT_CANDIDATES = [
    0.01,
    0.05,
    0.10,
    0.15,
    0.20,
    0.25,
    0.30,
  ];

  const START_TIME = Date.now();
  const RUN_ID =
    `batcher-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let allRootedServers = [];
  let myHackingLevel = ns.getHackingLevel();
  let target = "";
  let currentTargetProfile = null;
  let lastTargetRefresh = 0;

  let localTotalMoneyHacked = 0;
  let incomeHistoryPoints = [];
  let expHistoryPoints = [];

  let currentBatchID = 0;
  let currentPad = BASE_PAD;
  let currentEngineStatus = "INITIALIZING";
  let lastCloudStatus = "INITIALIZING";

  ns.disableLog("ALL");

  // Prevent duplicate controller instances using a valid text file path.
  if (ns.fileExists(LOCK_FILE, "home")) {
    let existingLock = null;

    try {
      existingLock = JSON.parse(ns.read(LOCK_FILE));
    } catch {
      existingLock = null;
    }

    let existingProcessRunning = false;

    if (
      existingLock &&
      Number.isInteger(existingLock.pid) &&
      typeof existingLock.host === "string"
    ) {
      try {
        existingProcessRunning = ns.isRunning(
          existingLock.pid,
          existingLock.host
        );
      } catch {
        existingProcessRunning = false;
      }
    }

    if (existingProcessRunning) {
      ns.tprint(
        "❌ Another hwgw-cluster-batcher instance is already running."
      );
      return;
    }

    ns.rm(LOCK_FILE, "home");
  }

  await ns.write(
    LOCK_FILE,
    JSON.stringify({
      pid: ns.pid,
      host: ns.getHostname(),
      runId: RUN_ID,
    }),
    "w"
  );

  if (!ns.fileExists(LOCK_FILE, "home")) {
    ns.tprint("❌ Unable to create the batcher lock file.");
    return;
  }

  function getWorkerScriptRam() {
    const ramValues = ALL_SCRIPTS.map((script) =>
      ns.getScriptRam(script, "home")
    );

    const ram = Math.max(...ramValues);

    return Number.isFinite(ram) && ram > 0 ? ram : 1.75;
  }

  function updateWorkerPool() {
    const pool = [...allRootedServers];

    for (const server of ns.cloud.getServerNames()) {
      if (!pool.includes(server)) {
        pool.push(server);
      }
    }

    return pool;
  }

  function stopOwnedWorkers(workers) {
    let stopped = 0;

    for (const host of workers) {
      for (const process of ns.ps(host)) {
        if (!ALL_SCRIPTS.includes(process.filename)) {
          continue;
        }

        if (String(process.args[3] ?? "") !== RUN_ID) {
          continue;
        }

        if (ns.kill(process.pid, host)) {
          stopped++;
        }
      }
    }

    if (stopped > 0) {
      ns.print(
        `Stopped ${stopped} worker process(es) during target switch.`
      );
    }

    return stopped;
  }

  function clearHud() {
    const documentObject = eval("document");
    const hook0 = documentObject.getElementById(
      "overview-extra-hook-0"
    );
    const hook1 = documentObject.getElementById(
      "overview-extra-hook-1"
    );

    if (hook0) hook0.innerHTML = "";
    if (hook1) hook1.innerHTML = "";
  }

  ns.atExit(() => {
    stopOwnedWorkers(updateWorkerPool());

    let belongsToThisInstance = false;

    try {
      const lock = JSON.parse(ns.read(LOCK_FILE));

      belongsToThisInstance =
        lock &&
        lock.runId === RUN_ID &&
        lock.pid === ns.pid &&
        lock.host === ns.getHostname();
    } catch {
      belongsToThisInstance = false;
    }

    if (belongsToThisInstance) {
      ns.rm(LOCK_FILE, "home");
    }

    clearHud();
  });

  function collectIncomeReports() {
    const port = ns.getPortHandle(INCOME_PORT);

    while (!port.empty()) {
      const rawReport = port.read();

      if (
        rawReport === "NULL PORT DATA" ||
        rawReport === null ||
        rawReport === undefined
      ) {
        break;
      }

      try {
        const report = JSON.parse(String(rawReport));

        if (
          report.runId === RUN_ID &&
          Number.isFinite(report.amount) &&
          report.amount > 0
        ) {
          localTotalMoneyHacked += report.amount;
        }
      } catch {
        if (lastLoggedError !== "BAD_INCOME_REPORT") {
          ns.print("Ignored malformed income report.");
          lastLoggedError = "BAD_INCOME_REPORT";
        }
      }
    }
  }

  function tryGetRoot(server) {
    if (ns.hasRootAccess(server)) return true;

    const tools = [
      ["BruteSSH.exe", () => ns.brutessh(server)],
      ["FTPCrack.exe", () => ns.ftpcrack(server)],
      ["relaySMTP.exe", () => ns.relaysmtp(server)],
      ["HTTPWorm.exe", () => ns.httpworm(server)],
      ["SQLInject.exe", () => ns.sqlinject(server)],
    ];

    let openedPorts = 0;

    for (const [program, openPort] of tools) {
      if (ns.fileExists(program, "home")) {
        openedPorts++;
        openPort();
      }
    }

    if (
      ns.getServerNumPortsRequired(server) > openedPorts
    ) {
      return false;
    }

    ns.nuke(server);
    return ns.hasRootAccess(server);
  }

  function scanNetwork() {
    const visited = new Set();
    const queue = ["home"];
    const validTargets = [];

    allRootedServers = [];
    myHackingLevel = ns.getHackingLevel();

    while (queue.length > 0) {
      const current = queue.shift();

      if (visited.has(current)) continue;
      visited.add(current);

      if (tryGetRoot(current)) {
        allRootedServers.push(current);
      }

      if (
        current !== "home" &&
        ns.hasRootAccess(current) &&
        myHackingLevel >=
          ns.getServerRequiredHackingLevel(current) &&
        ns.getServerMaxMoney(current) > 0
      ) {
        validTargets.push(current);
      }

      for (const neighbor of ns.scan(current)) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    return validTargets;
  }

  function getBatchProfile(server, hackPercent) {
    const maxMoney = ns.getServerMaxMoney(server);
    const hackChance = ns.hackAnalyzeChance(server);
    const hackAnalyze = ns.hackAnalyze(server);
    const weakenEffect = ns.weakenAnalyze(1);

    if (
      !Number.isFinite(maxMoney) ||
      maxMoney <= 0 ||
      !Number.isFinite(hackChance) ||
      hackChance <= 0 ||
      !Number.isFinite(hackAnalyze) ||
      hackAnalyze <= 0 ||
      !Number.isFinite(weakenEffect) ||
      weakenEffect <= 0
    ) {
      return null;
    }

    const hackThreads = Math.max(
      1,
      Math.ceil(hackPercent / hackAnalyze)
    );

    const weakenThreads1 = Math.max(
      1,
      Math.ceil(
        ns.hackAnalyzeSecurity(hackThreads, server) /
          weakenEffect
      )
    );

    const growThreads = Math.max(
      1,
      Math.ceil(
        ns.growthAnalyze(
          server,
          1 / (1 - hackPercent)
        )
      )
    );

    const weakenThreads2 = Math.max(
      1,
      Math.ceil(
        ns.growthAnalyzeSecurity(growThreads, server) /
          weakenEffect
      )
    );

    const totalThreads =
      hackThreads +
      weakenThreads1 +
      growThreads +
      weakenThreads2;

    const batchRam = totalThreads * getWorkerScriptRam();

    const hackTime = ns.getHackTime(server);
    const growTime = ns.getGrowTime(server);
    const weakenTime = ns.getWeakenTime(server);

    if (
      !Number.isFinite(hackTime) ||
      !Number.isFinite(growTime) ||
      !Number.isFinite(weakenTime)
    ) {
      return null;
    }

    const batchPeriodMs = Math.max(
      weakenTime + BASE_PAD * 2,
      growTime + BASE_PAD,
      hackTime + BASE_PAD * 2
    );

    const expectedMoneyPerBatch =
      maxMoney * hackPercent * hackChance;

    const expectedMoneyPerSecond =
      expectedMoneyPerBatch / (batchPeriodMs / 1000);

    const moneyPerRamSecond =
      expectedMoneyPerSecond /
      Math.max(batchRam, getWorkerScriptRam());

    return {
      server,
      hackPercent,
      hackThreads,
      weakenThreads1,
      growThreads,
      weakenThreads2,
      totalThreads,
      batchRam,
      hackTime,
      growTime,
      weakenTime,
      batchPeriodMs,
      expectedMoneyPerBatch,
      expectedMoneyPerSecond,
      moneyPerRamSecond,
    };
  }

  function getBestBatchProfile(
    server,
    maxThreads = Infinity
  ) {
    return HACK_PERCENT_CANDIDATES
      .map((percent) =>
        getBatchProfile(server, percent)
      )
      .filter(
        (profile) =>
          profile !== null &&
          profile.totalThreads <= maxThreads
      )
      .sort(
        (a, b) =>
          b.moneyPerRamSecond -
          a.moneyPerRamSecond
      )[0] ?? null;
  }

  function selectBestTarget() {
    return scanNetwork()
      .map((server) => ({
        server,
        profile: getBestBatchProfile(server),
      }))
      .filter((entry) => entry.profile !== null)
      .sort(
        (a, b) =>
          b.profile.moneyPerRamSecond -
          a.profile.moneyPerRamSecond
      )[0] ?? null;
  }

  function getClusterRam(workers) {
    let maxRam = 0;
    let usedRam = 0;

    for (const worker of workers) {
      const serverMaxRam = ns.getServerMaxRam(worker);
      const reserve =
        worker === "home" ? HOME_RAM_RESERVE : 0;

      maxRam += serverMaxRam;
      usedRam += Math.min(
        serverMaxRam,
        ns.getServerUsedRam(worker) + reserve
      );
    }

    return {
      maxRam,
      usedRam,
      freeRam: Math.max(0, maxRam - usedRam),
    };
  }

  function hasActivePrepScripts(workers) {
    return workers.some((worker) =>
      ns.ps(worker).some((process) =>
        process.args.some(
          (argument) => String(argument) === "prep"
        )
      )
    );
  }

  async function deployThreads(
    workers,
    script,
    threadsNeeded,
    targetServer,
    delay,
    batchId
  ) {
    let remaining = Math.max(
      0,
      Math.floor(threadsNeeded)
    );

    const safeDelay = Math.max(
      0,
      Math.floor(Number(delay) || 0)
    );

    const scriptRam = ns.getScriptRam(script, "home");

    for (const host of workers) {
      if (remaining <= 0) break;

      if (host !== "home") {
        await ns.scp(ALL_SCRIPTS, host, "home");
      }

      const reserve =
        host === "home" ? HOME_RAM_RESERVE : 0;

      const availableRam = Math.max(
        0,
        ns.getServerMaxRam(host) -
          ns.getServerUsedRam(host) -
          reserve
      );

      const freeThreads = Math.floor(
        availableRam / scriptRam
      );

      if (freeThreads <= 0) continue;

      const threads = Math.min(
        remaining,
        freeThreads
      );

      const processBatchId =
        `${batchId}-${Date.now()}-${Math.random()}`;

      const pid = ns.exec(
        script,
        host,
        threads,
        targetServer,
        safeDelay,
        processBatchId,
        RUN_ID,
        INCOME_PORT
      );

      if (pid !== 0) {
        remaining -= threads;
      }
    }

    return remaining;
  }

  async function writeWorkerScripts() {
    const hackWorker = `/**
 * @param {NS} ns
 */
export async function main(ns) {
  const target = String(ns.args[0] ?? "");
  const additionalMsec = Math.max(0, Number(ns.args[1]) || 0);
  const runId = String(ns.args[3] ?? "");
  const incomePort = Number(ns.args[4]);

  if (!target) return;

  const amount = await ns.hack(target, {
    additionalMsec,
  });

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
        amount,
        target,
      })
    );
  }
}`;

    const weakenWorker = `/**
 * @param {NS} ns
 */
export async function main(ns) {
  const target = String(ns.args[0] ?? "");
  const additionalMsec = Math.max(0, Number(ns.args[1]) || 0);

  if (!target) return;

  await ns.weaken(target, { additionalMsec });
}`;

    const growWorker = `/**
 * @param {NS} ns
 */
export async function main(ns) {
  const target = String(ns.args[0] ?? "");
  const additionalMsec = Math.max(0, Number(ns.args[1]) || 0);

  if (!target) return;

  await ns.grow(target, { additionalMsec });
}`;

    await ns.write(HACK_SCRIPT, hackWorker, "w");
    await ns.write(WEAKEN_SCRIPT, weakenWorker, "w");
    await ns.write(GROW_SCRIPT, growWorker, "w");
  }

  async function prepareTarget(
    workers,
    selectedTarget,
    freeRam
  ) {
    if (hasActivePrepScripts(workers)) {
      currentEngineStatus = "PREP SCRIPTS RUNNING";
      await ns.sleep(BASE_PAD * 2);
      return;
    }

    const prepThreads = Math.floor(
      freeRam / getWorkerScriptRam()
    );

    if (prepThreads <= 0) {
      currentEngineStatus = "WAITING FOR PREP RAM";
      await ns.sleep(BASE_PAD);
      return;
    }

    const security =
      ns.getServerSecurityLevel(selectedTarget);

    const minSecurity =
      ns.getServerMinSecurityLevel(selectedTarget);

    const money =
      ns.getServerMoneyAvailable(selectedTarget);

    const maxMoney =
      ns.getServerMaxMoney(selectedTarget);

    if (security > minSecurity + 0.5) {
      currentEngineStatus = "WEAKENING TARGET";

      await deployThreads(
        workers,
        WEAKEN_SCRIPT,
        prepThreads,
        selectedTarget,
        0,
        "prep"
      );
    } else if (money < maxMoney * 0.90) {
      currentEngineStatus = "GROWING TARGET";

      await deployThreads(
        workers,
        GROW_SCRIPT,
        prepThreads,
        selectedTarget,
        0,
        "prep"
      );
    }

    await ns.sleep(BASE_PAD * 2);
  }

  function manageCloudServers(efficiency, homeMoney) {
    if (homeMoney < MIN_CASH_RESERVE) {
      lastCloudStatus = "LIQUIDITY DEFENSE";
      return;
    }

    const spendable = homeMoney - MIN_CASH_RESERVE;
    const servers = ns.cloud.getServerNames();
    const limit = ns.cloud.getServerLimit();
    const moneyPerMbSecond = efficiency * 1024 * 1024;

    if (servers.length < limit) {
      const ram = 8;
      const cost = ns.cloud.getServerCost(ram);

      if (spendable <= cost) {
        lastCloudStatus = "SAVING FOR NEW CLOUD SLOT";
        return;
      }

      const payback =
        moneyPerMbSecond * ram > 0
          ? cost / (moneyPerMbSecond * ram)
          : Infinity;

      if (payback > 1800 && efficiency !== 0) {
        lastCloudStatus =
          `THROTTLED (POOR ROI: ${payback.toFixed(0)}s)`;
        return;
      }

      let index = 1;

      while (servers.includes(`cloud${index}`)) {
        index++;
      }

      if (
        ns.cloud.purchaseServer(`cloud${index}`, ram)
      ) {
        lastCloudStatus =
          `ACQUIRED cloud${index} (${payback.toFixed(0)}s ROI)`;
      }

      return;
    }

    const lowest = servers
      .map((name) => ({
        name,
        ram: ns.getServerMaxRam(name),
      }))
      .sort((a, b) => a.ram - b.ram)[0];

    if (!lowest || lowest.ram >= 1048576) {
      lastCloudStatus = "MAX CAPACITY REACHED";
      return;
    }

    const nextRam = lowest.ram * 2;
    const cost = ns.cloud.getServerUpgradeCost(
      lowest.name,
      nextRam
    );

    if (spendable <= cost) {
      lastCloudStatus =
        `SAVING FOR UPGRADE (${lowest.name})`;
      return;
    }

    const payback =
      moneyPerMbSecond * lowest.ram > 0
        ? cost / (moneyPerMbSecond * lowest.ram)
        : Infinity;

    if (payback > 1800) {
      lastCloudStatus =
        `ROI CEILING HIT (${payback.toFixed(0)}s)`;
      return;
    }

    if (
      ns.cloud.upgradeServer(lowest.name, nextRam)
    ) {
      lastCloudStatus =
        `UPGRADED ${lowest.name} (${payback.toFixed(0)}s ROI)`;
    }
  }

  async function refreshTargetIfNeeded() {
    const now = Date.now();
    const levelChanged =
      ns.getHackingLevel() > myHackingLevel;

    if (
      !levelChanged &&
      now - lastTargetRefresh <
        TARGET_REFRESH_INTERVAL
    ) {
      return;
    }

    const selection = selectBestTarget();
    const candidate = selection?.profile ?? null;
    const current = target
      ? getBestBatchProfile(target)
      : null;

    const currentScore =
      current?.moneyPerRamSecond ?? 0;

    const candidateScore =
      candidate?.moneyPerRamSecond ?? 0;

    const shouldSwitch =
      selection &&
      (
        !target ||
        (
          selection.server !== target &&
          candidateScore >
            currentScore * (1 + TARGET_SWITCH_MARGIN)
        )
      );

    if (shouldSwitch) {
      if (target && selection.server !== target) {
        currentEngineStatus = "SWITCHING TARGET";
        stopOwnedWorkers(updateWorkerPool());
      }

      target = selection.server;
      currentTargetProfile = candidate;
      currentEngineStatus = "PREPPING TARGET";
    }

    myHackingLevel = ns.getHackingLevel();
    lastTargetRefresh = now;
  }

  await writeWorkerScripts();
  await refreshTargetIfNeeded();

  if (!target) {
    ns.tprint("❌ No valid targets found.");
    return;
  }

  while (true) {
    collectIncomeReports();
    await refreshTargetIfNeeded();

    if (!target) {
      await ns.sleep(BASE_PAD);
      continue;
    }

    const workers = updateWorkerPool();
    const cluster = getClusterRam(workers);
    const workerRam = getWorkerScriptRam();

    const elapsedSeconds = Math.max(
      (Date.now() - START_TIME) / 1000,
      1
    );

    const income =
      localTotalMoneyHacked / elapsedSeconds;

    const rawExp = ns.getTotalScriptExpGain();
    const exp = Array.isArray(rawExp)
      ? rawExp[0] ?? 0
      : rawExp ?? 0;

    const efficiency =
      cluster.usedRam > 0
        ? income / cluster.usedRam
        : 0;

    incomeHistoryPoints.push(income);
    expHistoryPoints.push(exp);

    if (
      incomeHistoryPoints.length >
      MAX_GRAPH_SLOTS
    ) {
      incomeHistoryPoints.shift();
      expHistoryPoints.shift();
    }

    injectOverviewHUD(
      ns,
      target,
      currentEngineStatus,
      currentTargetProfile?.hackPercent ?? 0,
      currentPad,
      1.0,
      cluster.maxRam,
      cluster.usedRam,
      income,
      exp,
      efficiency,
      lastCloudStatus,
      incomeHistoryPoints,
      expHistoryPoints
    );

    manageCloudServers(
      efficiency,
      ns.getServerMoneyAvailable("home")
    );

    const security =
      ns.getServerSecurityLevel(target);

    const minSecurity =
      ns.getServerMinSecurityLevel(target);

    const money =
      ns.getServerMoneyAvailable(target);

    const maxMoney =
      ns.getServerMaxMoney(target);

    if (
      security > minSecurity + 0.5 ||
      money < maxMoney * 0.90
    ) {
      await prepareTarget(
        workers,
        target,
        cluster.freeRam
      );

      continue;
    }

    const availableThreads = Math.floor(
      cluster.freeRam / workerRam
    );

    const profile =
      getBestBatchProfile(
        target,
        availableThreads
      ) ?? currentTargetProfile;

    if (
      !profile ||
      profile.totalThreads > availableThreads
    ) {
      currentEngineStatus = "WAITING FOR BATCH RAM";
      await ns.sleep(BASE_PAD);
      continue;
    }

    currentTargetProfile = profile;
    currentBatchID++;

    currentEngineStatus =
      `PIPELINED ${(profile.hackPercent * 100).toFixed(1)}% BATCHING`;

    const hackDelay = Math.max(
      0,
      profile.weakenTime -
        profile.hackTime -
        BASE_PAD
    );

    const growDelay = Math.max(
      0,
      profile.weakenTime +
        BASE_PAD -
        profile.growTime
    );

    const remainingHack = await deployThreads(
      workers,
      HACK_SCRIPT,
      profile.hackThreads,
      target,
      hackDelay,
      currentBatchID
    );

    const remainingWeaken1 = await deployThreads(
      workers,
      WEAKEN_SCRIPT,
      profile.weakenThreads1,
      target,
      0,
      currentBatchID
    );

    const remainingGrow = await deployThreads(
      workers,
      GROW_SCRIPT,
      profile.growThreads,
      target,
      growDelay,
      currentBatchID
    );

    const remainingWeaken2 = await deployThreads(
      workers,
      WEAKEN_SCRIPT,
      profile.weakenThreads2,
      target,
      BASE_PAD * 2,
      currentBatchID
    );

    if (
      remainingHack > 0 ||
      remainingWeaken1 > 0 ||
      remainingGrow > 0 ||
      remainingWeaken2 > 0
    ) {
      currentEngineStatus = "PARTIAL BATCH";
    }

    await ns.sleep(BASE_PAD);
  }
}
