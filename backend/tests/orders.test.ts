import request from "supertest";
import { createApp } from "../src/app";
import { makeBatch, makeItem, makeLocation, makeUser, prisma, resetDatabase } from "./testUtils";

const app = createApp();

describe("Customer Orders — reservation", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Mandatory Test 1: Cannot reserve more than available inventory.
  test("rejects a single reservation larger than available stock", async () => {
    const { token: salesToken } = await makeUser("SALES");
    const location = await makeLocation();
    const item = await makeItem();
    const batch = await makeBatch(item.id, location.id, 50);

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${salesToken}`)
      .send({
        customerName: "Acme Corp",
        itemId: item.id,
        locationId: location.id,
        batchId: batch.id,
        quantity: 60, // more than the 50 physical/available
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("InsufficientStockError");
  });

  // Concurrency variant of Test 1: two simultaneous reservations that
  // together exceed available stock — exactly one must succeed. This is
  // the specific "User A reserves 80, User B reserves 50 out of 100,
  // neither should be allowed to both succeed" scenario from the spec.
  test("under concurrent requests, does not allow total reservations to exceed available stock", async () => {
    const { token: salesToken } = await makeUser("SALES");
    const location = await makeLocation();
    const item = await makeItem();
    const batch = await makeBatch(item.id, location.id, 100);

    const [resA, resB] = await Promise.all([
      request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${salesToken}`)
        .send({ customerName: "User A Co", itemId: item.id, locationId: location.id, batchId: batch.id, quantity: 80 }),
      request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${salesToken}`)
        .send({ customerName: "User B Co", itemId: item.id, locationId: location.id, batchId: batch.id, quantity: 50 }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    // Exactly one request succeeds (201), the other is rejected (409).
    expect(statuses).toEqual([201, 409]);

    const finalBatch = await prisma.inventoryBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(finalBatch.reservedQuantity).toBeLessThanOrEqual(100);
    expect([80, 50]).toContain(finalBatch.reservedQuantity);
  });

  // Mandatory Test 5: Unauthorized user cannot perform restricted operation.
  test("a SALES user cannot create a Work Order (Admin-only operation)", async () => {
    const { token: salesToken } = await makeUser("SALES");
    const location = await makeLocation();
    const item = await makeItem();
    const opsUser = await makeUser("OPERATIONS");

    const res = await request(app)
      .post("/api/work-orders")
      .set("Authorization", `Bearer ${salesToken}`)
      .send({
        locationId: location.id,
        itemId: item.id,
        requiredQuantity: 10,
        assignedUserId: opsUser.user.id,
      });

    expect(res.status).toBe(403);
  });

  test("a request with no auth token is rejected", async () => {
    const res = await request(app).get("/api/inventory");
    expect(res.status).toBe(401);
  });
});
