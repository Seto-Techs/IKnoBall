/**
 * The API answered, but not with 2xx. Later chunks branch on `status` to pick a
 * friendly reply (`400` closed picks, `404` unknown user, `5xx` "try the web").
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly path: string,
  ) {
    super(`${path} failed with ${status}: ${message}`);
    this.name = 'ApiError';
  }
}

/** A client method the trunk declares but has not been wired to an endpoint yet. */
export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`IknoballClient.${method}() is not implemented yet`);
    this.name = 'NotImplementedError';
  }
}
