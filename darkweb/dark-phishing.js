/** @param {NS} ns */
export async function main(ns) {
  const DARKWEB_ROOT = "darkweb/";
  const version = String(ns.args[0] ?? "unversioned");
  const hostname = ns.getHostname();
  const statusFile = `${DARKWEB_ROOT}dark-phishing-status.json`;

  ns.disableLog("ALL");
  ns.tail();

  // v3.0.1 Darknet phishing targets must be valid darknet servers 
    const target = ns.args[0] || "darkweb"; 
    const logFile = "dnet_phishing_stats.json";

  ns.print(
    `[dark-phishing] running on ${hostname}; deployment ${version}`,
  );
  
  while (true) { 
    ns.print(`Launching phishing attack against ${target}...`);
      
    let status = {
      totalProfit: 0,
      formattedTotalProfit: "\$0",
      successfulAttacks: 0,
      failedAttacks: 0,
      lastAttackTime: Date.now(),
    };

    // Read and parse historical tracking data if it exists
        if (ns.fileExists(logFile)) {
            try {
                const fileContent = ns.read(logFile);
                stats = JSON.parse(fileContent);
            } catch (e) {
                ns.print("WARNING: Corrupt data format found. Re-initializing logs.");
            }
        }
    
        // Process outcome metrics
        if (profitGained > 0) {
            stats.totalProfit += profitGained;
            stats.successfulAttacks += 1;
            stats.formattedTotalProfit = `$${ns.formatNumber(stats.totalProfit)}`;
            stats.lastAttackTime = new Date().toISOString();
            
            ns.print(` SUCCESS: Earned \$${ns.formatNumber(profitGained)}!`);
        } else {
            stats.failedAttacks += 1;
            ns.print(` FAILURE: Phishing defense blocked the attack.`);
        }

        // Clean overwrite ("w") keeping file size light over continuous runs
        await ns.write(logFile, JSON.stringify(stats, null, 2), "w");

        ns.print(`--- CURRENT METRICS ---`);
        ns.print(`Total Profit: ${stats.formattedTotalProfit}`);
        ns.print(`Success Rate: ${stats.successfulAttacks} W / ${stats.failedAttacks} L`);
        ns.print(`-----------------------`);

        // Mandatory safety sleep to avoid infinite loop locks
        await ns.sleep(1000); 
  }
}
