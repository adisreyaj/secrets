export function shouldLogStatus(statusCode: number): boolean {
  if (statusCode >= 500) {
    return true;
  }

  return statusCode === 401 || statusCode === 403 || statusCode === 409 || statusCode === 429;
}
