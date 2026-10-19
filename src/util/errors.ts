/** Errors that carry an actionable next step are the CLI's main UX contract. */
export class GuardError extends Error {
  readonly code: string
  readonly hint?: string
  readonly exitCode: number

  constructor(code: string, message: string, options: { hint?: string; exitCode?: number; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'GuardError'
    this.code = code
    this.hint = options.hint
    this.exitCode = options.exitCode ?? 3
  }
}

export function isGuardError(error: unknown): error is GuardError {
  return error instanceof GuardError
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
