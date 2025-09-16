// src/services/errors.ts
export class NotFoundError extends Error {
  constructor(entity: string, where?: unknown) {
    super(`${entity} not found${where ? `: ${JSON.stringify(where)}` : ""}`);
    this.name = "NotFoundError";
  }
}
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
