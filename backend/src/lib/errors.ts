export class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super(message, 422, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Operation conflicts with current state") {
    super(message, 409);
  }
}

// Thrown specifically when a stock operation would over-commit inventory.
// Kept distinct from generic ConflictError so tests / clients can branch on it.
export class InsufficientStockError extends AppError {
  constructor(message = "Insufficient available stock for this operation") {
    super(message, 409);
  }
}
