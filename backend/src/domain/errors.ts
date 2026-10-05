/** An error the API answers with: `{"error": {"code", "message"}}` and an HTTP status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const invalid = (message: string) => new ApiError(400, 'invalid', message);
export const notFound = (what: string) => new ApiError(404, 'not_found', `No such ${what}`);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);

/** Concurrent writes kept winning; the caller can simply try again. */
export const busy = () => conflict('busy', 'Something changed at the same moment; try again');
