/** Cloud sandboxes and Docker uploads are intentionally unavailable in the app. */
export class LangSmithSandboxError extends Error {}
export class LangSmithResourceNotFoundError extends LangSmithSandboxError {}
export class SandboxClient {
  constructor() {
    throw new Error('Cloud sandbox access is disabled in Cinefern.');
  }
}
