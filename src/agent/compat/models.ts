/** Metro cannot bundle LangChain's arbitrary import(packageName) model registry.
 * Cinefern always injects a configured model instance into Deep Agents instead. */
export async function initChatModel(): Promise<never> {
  throw new Error('Cinefern requires a host-configured model instance.');
}
