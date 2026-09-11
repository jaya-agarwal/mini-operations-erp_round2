import request from "supertest";
import { createApp } from "../src/app";
import { makeBatch, makeItem, makeLocation, makeUser, prisma, resetDatabase } from "./testUtils";

const app = createApp();

describe("Internal Transfers", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function setupTransfer(sourceQty: number) {
    const { token: opsToken } = await makeUser("OPERATIONS");
    const source = await makeLocation("Source");
    const destination = await makeLocation("Destination");
    const item = await makeItem();
    const sourceBatch = await makeBatch(item.id, source.id, sourceQty);

    const createRes = await request(app)
      .post("/api/transfers")
      .set("Authorization", `Bearer ${opsToken}`)
      .send({
        sourceLocationId: source.id,
        destinationLocationId: destination.id,
        itemId: item.id,
        quantity: 30,
        sourceBatchId: sourceBatch.id,
      });

    return { opsToken, source, destination, item, sourceBatch, transferId: createRes.body.data.id };
  }

  // Mandatory Test 2: Cannot transfer more than available inventory.
  test("rejects dispatch of a transfer larger than available source stock", async () => {
    const { opsToken, sourceBatch, transferId } = await setupTransfer(10); // only 10 available, transfer requests 30

    const res = await request(app)
      .post(`/api/transfers/${transferId}/dispatch`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ sourceBatchId: sourceBatch.id });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("InsufficientStockError");
  });

  // Mandatory Test 3: Destination stock increases only after transfer receipt.
  test("destination inventory does not increase on dispatch, only on receipt", async () => {
    const { opsToken, destination, item, sourceBatch, transferId } = await setupTransfer(100);

    await request(app)
      .post(`/api/transfers/${transferId}/dispatch`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ sourceBatchId: sourceBatch.id })
      .expect(200);

    const destBatchesAfterDispatch = await prisma.inventoryBatch.findMany({
      where: { locationId: destination.id, itemId: item.id },
    });
    expect(destBatchesAfterDispatch).toHaveLength(0); // nothing created yet, no increase

    const receiveRes = await request(app)
      .post(`/api/transfers/${transferId}/receive`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ destinationBatchCode: "DEST-B1" });

    expect(receiveRes.status).toBe(200);
    expect(receiveRes.body.data.destinationBatch.physicalQuantity).toBe(30);
  });

  // Mandatory Test 4: Same transfer cannot be received twice.
  test("rejects a second receive attempt on an already-fully-received transfer", async () => {
    const { opsToken, sourceBatch, transferId } = await setupTransfer(100);

    await request(app)
      .post(`/api/transfers/${transferId}/dispatch`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ sourceBatchId: sourceBatch.id })
      .expect(200);

    await request(app)
      .post(`/api/transfers/${transferId}/receive`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ destinationBatchCode: "DEST-B1" })
      .expect(200);

    const secondReceive = await request(app)
      .post(`/api/transfers/${transferId}/receive`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ destinationBatchCode: "DEST-B1" });

    expect(secondReceive.status).toBe(409);
  });

  // Bonus: pre-built Live Verification "Change 2" — partial receipt.
  test("supports receiving a transfer in two partial installments", async () => {
    const { opsToken, transferId, sourceBatch, destination, item } = await setupTransfer(100); // transfer qty = 30

    await request(app)
      .post(`/api/transfers/${transferId}/dispatch`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ sourceBatchId: sourceBatch.id })
      .expect(200);

    const firstPartial = await request(app)
      .post(`/api/transfers/${transferId}/receive`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ destinationBatchCode: "DEST-B1", quantity: 20 });

    expect(firstPartial.status).toBe(200);
    expect(firstPartial.body.data.transfer.status).toBe("PARTIALLY_RECEIVED");
    expect(firstPartial.body.data.transfer.receivedQuantity).toBe(20);

    const secondPartial = await request(app)
      .post(`/api/transfers/${transferId}/receive`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ destinationBatchCode: "DEST-B1", quantity: 10 });

    expect(secondPartial.status).toBe(200);
    expect(secondPartial.body.data.transfer.status).toBe("RECEIVED");
    expect(secondPartial.body.data.transfer.receivedQuantity).toBe(30);

    const destBatch = await prisma.inventoryBatch.findFirst({ where: { locationId: destination.id, itemId: item.id } });
    expect(destBatch?.physicalQuantity).toBe(30);
  });
});
