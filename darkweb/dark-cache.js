/** @param {NS} ns */
export async function main(ns) {
  
  const version = String(ns.args[0] ?? "unversioned");
  const hostname = ns.getHostname();
  
  ns.disableLog("ALL");
  ns.tail();

  const logFile = "dnet_cache_stats.json";
  
  //ns.disableLog("sleep");
  ns.print(
    `[dark-cache] running on ${hostname}; deployment ${version}`,
  );

   if (cacheFiles.length === 0) {
        ns.print("No '.cache' files detected on this node.");
        return;
    }

    ns.print(`Found ${cacheFiles.length} cache files to process.`);

    // 1. Initialize or load the existing log tracking metrics
    let stats = {
        totalProfit: 0,
        formattedTotalProfit: "\$0",
        successfulCacheOpens: 0,
        failedCacheOpens: 0,
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

    // 2. Loop through and process each cache file found
    for (const file of cacheFiles) {
        // Skip files we've already cleanly parsed in previous runs
        if (stats.processedFiles.includes(file)) {
            ns.print(`Skipping ${file} (already opened previously).`);
            continue;
        }

        ns.print(`Opening darknet cache configuration: ${file}...`);
        
        // Execute the Darknet method
        const result = ns.dnet.openCache(file);

        // Check if execution was successful 
        // Handles boolean flags, status codes, or valid return objects containing messages
        if (result && (result.success || !result.message?.toLowerCase().includes("fail"))) {
            stats.successfulCacheOpens += 1;
            stats.processedFiles.push(file);
            
            // If the cache returned money, track it (fallbacks to 0 if not financial)
            const moneyGained = result.profit || result.money || 0;
            stats.totalProfit += moneyGained;
            
            ns.print(` SUCCESS: Cleanly opened ${file}. Msg: ${result.message || "Done"}`);
        } else {
            stats.failedCacheOpens += 1;
            ns.print(` FAILURE: Failed to open ${file}. Msg: ${result?.message || "Unknown error"}`);
        }

        // Update timestamps
        stats.formattedTotalProfit = `$${ns.formatNumber(stats.totalProfit)}`;
        stats.lastExecutionTime = new Date().toISOString();

        // 3. Write clean, pretty-printed data back to the JSON file on each loop step
        await ns.write(logFile, JSON.stringify(stats, null, 2), "w");
        
        // Brief pause to prevent UI stutter during consecutive IO reads/writes
        await ns.sleep(100);
    }
    ns.print(`\n--- FINAL RUN SNAPSHOT ---`);
    ns.print(`Total Profit: ${stats.formattedTotalProfit}`);
    ns.print(`Successes: ${stats.successfulCacheOpens} | Failures: ${stats.failedCacheOpens}`);
    ns.print(`Metrics saved to ${logFile}.`);
}
