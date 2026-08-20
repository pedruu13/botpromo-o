import { generateDailyReport } from "./metrics.js";

async function run() {
  await generateDailyReport();
}

run();
