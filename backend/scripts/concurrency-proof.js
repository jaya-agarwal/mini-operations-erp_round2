// Standalone proof of the row-locking strategy used by orders.service.ts
// (createCustomerOrder -> withLockedBatch -> SELECT ... FOR UPDATE).
// Run directly against Postgres with the `pg` driver, independent of Prisma,
// to prove the concurrency guarantee holds before wiring it through the ORM.
const { Client } = require("pg");

const CONN = "postgresql://postgres:postgres@localhost:5432/minierp_dev";

async function setup() {
  const client = new Client(CONN);
  await client.connect();
  await client.query(`
    DROP TABLE IF EXISTS proof_batches;
    CREATE TABLE proof_batches (
      id SERIAL PRIMARY KEY,
      physical INT NOT NULL,
      reserved INT NOT NULL DEFAULT 0
    );
    INSERT INTO proof_batches (physical, reserved) VALUES (100, 0);
  `);
  await client.end();
}

// Mirrors withLockedBatch() + the reserve logic exactly:
// BEGIN -> SELECT ... FOR UPDATE -> check available -> UPDATE -> COMMIT
async function attemptReserve(label, quantity, delayMs) {
  const client = new Client(CONN);
  await client.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT id, physical, reserved FROM proof_batches WHERE id = 1 FOR UPDATE"
    );
    const batch = rows[0];
    const available = batch.physical - batch.reserved;

    // Simulate real-world work happening while holding the lock (e.g. app
    // logic, other queries) to make the race window realistic.
    await new Promise((r) => setTimeout(r, delayMs));

    if (quantity > available) {
      await client.query("ROLLBACK");
      console.log(`[${label}] REJECTED - requested ${quantity}, only ${available} available`);
      return { label, success: false };
    }

    await client.query("UPDATE proof_batches SET reserved = reserved + $1 WHERE id = 1", [quantity]);
    await client.query("COMMIT");
    console.log(`[${label}] SUCCESS - reserved ${quantity}`);
    return { label, success: true };
  } catch (e) {
    await client.query("ROLLBACK");
    console.log(`[${label}] ERROR: ${e.message}`);
    return { label, success: false, error: e.message };
  } finally {
    await client.end();
  }
}

async function main() {
  await setup();
  console.log("Starting state: physical=100, reserved=0, available=100");
  console.log("Firing User A (reserve 80) and User B (reserve 50) CONCURRENTLY...\n");

  // Fired truly concurrently (no await between them) to force the race.
  const [a, b] = await Promise.all([
    attemptReserve("User A", 80, 150),
    attemptReserve("User B", 50, 50),
  ]);

  const verify = new Client(CONN);
  await verify.connect();
  const { rows } = await verify.query("SELECT physical, reserved, physical - reserved AS available FROM proof_batches WHERE id = 1");
  await verify.end();

  console.log(`\nFinal state: physical=${rows[0].physical}, reserved=${rows[0].reserved}, available=${rows[0].available}`);

  const successCount = [a, b].filter((r) => r.success).length;
  if (successCount === 1) {
    console.log("\n✅ PROOF PASSED: exactly one of the two concurrent over-committing requests succeeded.");
    console.log("   The SELECT ... FOR UPDATE row lock correctly serialized the two transactions.");
  } else {
    console.log(`\n❌ PROOF FAILED: ${successCount} requests succeeded (expected exactly 1).`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
