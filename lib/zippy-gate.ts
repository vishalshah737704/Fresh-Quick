// The widget compares the server's 401 text with the login-required text; an expired session keeps its own message.
export function isLoginRequiredError(status: number, message: string, loginRequiredText: string): boolean {
  return status === 401 && message === loginRequiredText;
}
