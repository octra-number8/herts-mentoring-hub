/** Reset the local database and load synthetic data (tolerates slow-starting services). */
import setup from "../tests/global-setup";

const run = (setup as unknown as { default?: () => Promise<void> }).default ?? setup;
run().then(() => console.log("Database reset and seeded.")).catch((e) => { console.error(e); process.exit(1); });
