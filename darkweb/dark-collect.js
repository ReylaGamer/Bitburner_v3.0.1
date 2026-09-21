/** @param {NS} ns */
export async function main(ns) {
  const version = String(ns.args[0] ?? "unversioned");
  const hostname = ns.getHostname();
  
  if (hostname === "home") {
    return;
  }

  ns.disableLog("ALL");
  ns.tail();

  ns.print(
    `[dark-collect] running on ${hostname}; deployment ${version}`,
  );

  try {
      await collectFiles(ns, hostname);
    } catch (error) {
      ns.print(
        `${hostname}: collection cycle failed: ${formatError(error)}`,
      );
    }
}

/**
 * Collect approved text files from the current darknet node.
 *
 * @param {NS} ns
 * @param {string} sourceHostname
 */
async function collectFiles(ns, hostname) {

  const logFile = "dnet_collect_stats.json";
  
  const files = ns
    .ls(hostname)
    .filter((filename) => isCollectableTextFile(filename));

  if (files.length === 0) {
    ns.print(`${hostname}: no collectable text files found`);
    return;
  }

  ns.print(`Found ${files.length} files to process.`);

  // 1. Initialize or load the existing log tracking metrics
  let stats = {
        totalfiles: {$files.length},
        processedFiles: [],
        lastExecutionTime: Date.now()
    };

  if (ns.fileExists(logFile)) {
        try {
            stats = JSON.parse(ns.read(logFile));
        } catch (e) {
            ns.print("WARNING: Stats file corrupt. Re-initializing logs.");
        }
  }
  // 2. Loop through and process each file found
  for (const filename of files) {

    const destinationName = makeUniqueFilename(
      hostname,
      filename,
    );

    if (ns.fileExists(destinationName, "home")) {
      continue;
    }

    let temporaryFileCreated = false;

    try {
      const contents = ns.read(filename);

      if (typeof contents !== "string") {
        ns.print(`${hostname}: skipped unreadable file ${filename}`);
        continue;
      }

      ns.write(destinationName, contents, "w");
      temporaryFileCreated = true;

      const copied = await ns.scp(
        destinationName,
        "home",
        hostname,
      );

      if (!copied) {
        ns.print(
          `${hostname}: failed to collect ${filename}`,
        );
        continue;
      } 
      else if (copied && (copied.success || !copied.message?.toLowerCase().includes("fail"))) {
        stats.processedFiles.push(file);
      }

      ns.print(
        `${hostname}: collected ${filename} as ${destinationName}`,
      );
    } catch (error) {
      ns.print(
        `${hostname}: failed to collect ${filename}: ` +
          `${formatError(error)}`,
      );
    } finally {
      if (
        temporaryFileCreated &&
        ns.fileExists(destinationName, hostname)
      ) {
        ns.rm(destinationName, hostname);
      }
    }
  }
  // 3. Write clean, pretty-printed data back to the JSON file on each loop step
  await ns.write(logFile, JSON.stringify(stats, null, 2), "w");
}

/**
 * Exclude all files managed by the deployment system.
 *
 * @param {string} filename
 * @returns {boolean}
 */
function isCollectableTextFile(filename) {
  if (!filename || isManagedWorker(filename)) {
    return false;
  }

  const lowerName = filename.toLowerCase();

  if (
    lowerName.includes("__collected__") ||
    lowerName.endsWith(".tmp") ||
    lowerName.endsWith(".lock") ||
    lowerName.endsWith(".pid")
  ) {
    return false;
  }

  return [
    ".json",
    ".log",
    ".txt",
    ".lit",
    ".msg",
  ].some((extension) => lowerName.endsWith(extension));
}

/**
 * These files belong to the darknet deployment system and must never be
 * collected back to home as data files.
 *
 * @param {string} filename
 * @returns {boolean}
 */
function isManagedWorker(filename) {
  return new Set([
    "dark-agent.js",
    "dark-cache.js",
    "dark-phishing.js",
    "dark-collect.js",
    "dark-credentials.json",
    "dnet_phishing_stats.json",
    "dnet_cache_stats.json"
    "dnet_collect_stats.json"
  ]).has(filename);
}

/**
 * Create a unique flat filename for home.
 *
 * @param {string} hostname
 * @param {string} filename
 * @returns {string}
 */
function makeUniqueFilename(hostname, filename) {
  const safeHostname = hostname.replace(
    /[^a-zA-Z0-9_-]/g,
    "_",
  );

  const safeFilename = filename.replace(
    /[^a-zA-Z0-9._-]/g,
    "_",
  );

  return `__collected__${safeHostname}__${safeFilename}.txt`;
}

