# Database Schema / ER Diagram

```mermaid
erDiagram
    User ||--o{ WorkOrder : "assigned to"
    User ||--o{ CustomerOrder : "created by"
    Location ||--o{ User : "assigned location (optional)"
    Location ||--o{ InventoryBatch : "stocked at"
    Location ||--o{ WorkOrder : "located at"
    Location ||--o{ Transfer : "source"
    Location ||--o{ Transfer : "destination"
    Category ||--o{ Item : "categorizes"
    Item ||--o{ InventoryBatch : "has batches"
    Item ||--o{ WorkOrder : "required in"
    Item ||--o{ Transfer : "transferred"
    Item ||--o{ CustomerOrder : "ordered"
    InventoryBatch ||--o{ InventoryTransaction : "audit trail"
    CustomerOrder }o--|| InventoryBatch : "reserved against"

    User {
        uuid id PK
        string email UK
        string passwordHash
        string name
        enum role "ADMIN | OPERATIONS | SALES"
        uuid assignedLocationId FK "nullable"
    }

    Location {
        uuid id PK
        string name UK
    }

    Category {
        uuid id PK
        string name UK
    }

    Item {
        uuid id PK
        string name
        string sku UK
        uuid categoryId FK
    }

    InventoryBatch {
        uuid id PK
        uuid itemId FK
        uuid locationId FK
        string batchCode
        int physicalQuantity
        int reservedQuantity
        int damagedQuantity
        int version "optimistic-concurrency backstop"
    }

    InventoryTransaction {
        uuid id PK
        uuid batchId FK
        enum type "RECEIPT|RESERVE|RELEASE_RESERVATION|TRANSFER_DISPATCH|TRANSFER_RECEIPT|DAMAGE|ADJUSTMENT"
        int quantity
        string referenceType
        string referenceId
    }

    WorkOrder {
        uuid id PK
        uuid locationId FK
        uuid itemId FK
        int requiredQuantity
        uuid assignedUserId FK
        enum status "ASSIGNED|IN_PROGRESS|COMPLETED"
    }

    Transfer {
        uuid id PK
        uuid sourceLocationId FK
        uuid destinationLocationId FK
        uuid itemId FK
        int quantity
        int receivedQuantity
        enum status "REQUESTED|DISPATCHED|PARTIALLY_RECEIVED|RECEIVED"
    }

    CustomerOrder {
        uuid id PK
        string customerName
        uuid itemId FK
        uuid locationId FK
        uuid batchId FK
        int quantity
        enum status "RESERVED|FULFILLED|CANCELLED"
        uuid createdById FK
    }
```

## Why `availableQuantity` isn't a column

`InventoryBatch` only persists `physicalQuantity`, `reservedQuantity`, and
`damagedQuantity`. `availableQuantity = physical - reserved - damaged` is
computed at read time (`deriveAvailable()` in `inventory.service.ts`) instead
of stored and kept in sync. A derived value can never drift out of sync with
its inputs — there's no update path that can forget to also update it.

## Why `InventoryTransaction` exists

It's an append-only ledger of every quantity change, each tagged with the
business event that caused it (`referenceType` + `referenceId`, e.g.
`TRANSFER` + the transfer's id). Two things fall out of this for free:

1. **Auditability** — you can reconstruct any batch's history.
2. **Structural duplicate-prevention** — `(referenceId, type, referenceType)`
   has a unique constraint, so the same transfer dispatch, or the same
   receipt call, cannot be posted twice even if the application-level status
   check is bypassed or racing.
