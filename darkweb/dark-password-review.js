/** @param {NS} ns */
export async function main(ns) {
  const version = String(ns.args[0] ?? "unversioned");
  const hostname = ns.getHostname();
  const TEXT_FILE_GLOB = ".txt";
  const REVIEW_INTERVAL = 15000;

  ns.disableLog("sleep");
  ns.print(
    `[dark-password-review] running on ${hostname}; deployment ${version}`,
  );

  while (true) {
    const files = ns.ls("home", TEXT_FILE_GLOB);

    if (files.length > 0) {
      ns.print(
        `[dark-password-review] reviewed ${files.length} text file(s); version ${version}`,
      );

      for (const file of files) {
        try {
          const contents = ns.read(file);
          if (typeof contents === "string") {
            const review = summarizeText(contents);
            ns.print(
              `[dark-password-review] ${file}: ${review}`,
            );
          }
        } catch (error) {
          ns.print(
            `[dark-password-review] failed to read ${file}: ${String(error)}`,
          );
        }
      }
    }

    await ns.sleep(REVIEW_INTERVAL);
  }
}

/**
 * Tokenize and summarize candidate review content.
 *
 * @param {string} contents
 * @returns {string}
 */
function summarizeText(contents) {
  const clean = contents
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) {
    return "empty";
  }

  const words = clean.split(" ");
  const uniqueWords = new Set(words.map((word) => word.toLowerCase()));

  return `${words.length} words / ${uniqueWords.size} unique tokens`;
}

/**
 * @param {AutocompleteData} data
 */
export function autocomplete(data) {
  return [];
}
