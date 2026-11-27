export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
    public readonly details?: Record<string, number>,
  ) {
    super(code);
    this.name = "ServiceError";
  }
}
