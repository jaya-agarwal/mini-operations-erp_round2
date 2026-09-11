import request from "supertest";
import { createApp } from "../src/app";
import { makeBatch, makeItem, makeLocation, makeUser, prisma, resetDatabase } from "./testUtils";

const app = createApp();

describe("Pre-built Live Verification features", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Live Verification "Change 1": damaged stock reduces available quantity.
  test("marking stock as damaged reduces available quantity but not physical quantity", async () => {
    const { token: opsToken } = await makeUser("OPERATIONS");
    const location = await makeLocation();
    const item = await makeItem();
    const batch = await makeBatch(item.id, location.id, 100);

    const res = await request(app)
      .post(`/api/inventory/${batch.id}/damage`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ quantity: 15 });

    expect(res.status).toBe(200);
    expect(res.body.data.physicalQuantity).toBe(100);
    expect(res.body.data.damagedQuantity).toBe(15);
    expect(res.body.data.availableQuantity).toBe(85);
  });

  // Live Verification "Change 3": cancelling an order releases its reservation.
  test("cancelling an order releases the reserved quantity back to available stock", async () => {
    const { token: salesToken } = await makeUser("SALES");
    const location = await makeLocation();
    const item = await makeItem();
    const batch = await makeBatch(item.id, location.id, 100);

    const orderRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${salesToken}`)
      .send({ customerName: "Acme Corp", itemId: item.id, locationId: location.id, batchId: batch.id, quantity: 40 })
      .expect(201);

    const afterReserve = await prisma.inventoryBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(afterReserve.reservedQuantity).toBe(40);

    const cancelRes = await request(app)
      .post(`/api/orders/${orderRes.body.data.order.id}/cancel`)
      .set("Authorization", `Bearer ${salesToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.order.status).toBe("CANCELLED");
    expect(cancelRes.body.data.batch.reservedQuantity).toBe(0);
    expect(cancelRes.body.data.batch.availableQuantity).toBe(100);
  });
});
