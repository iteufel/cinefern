import type { SettingValue } from '@cinefern/provider-sdk';
import type { KeyValueStorage } from './library';
import {
  authenticateJellyfin,
  logoutJellyfin,
  normalizeJellyfinUrl,
  type JellyfinSession,
  type JellyfinTransport,
} from '../providers/jellyfin';

export const JELLYFIN_SESSION_KEY = 'cinefern.secret.jellyfin.session';

/** Passwords only exist during sign-in. Library settings contain no authentication material. */
export class JellyfinConnection {
  constructor(
    private storage: KeyValueStorage,
    private transport: JellyfinTransport,
  ) {}

  private async read(): Promise<JellyfinSession | null> {
    const raw = await this.storage.get(JELLYFIN_SESSION_KEY);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as JellyfinSession;
      if (
        ['serverUrl', 'username', 'userId', 'accessToken', 'deviceId'].some(
          (key) => typeof value[key as keyof JellyfinSession] !== 'string',
        )
      )
        return null;
      normalizeJellyfinUrl(value.serverUrl);
      return value;
    } catch {
      return null;
    }
  }

  async connect(
    values: Record<string, SettingValue>,
  ): Promise<Record<string, SettingValue>> {
    // A revoked OS key or damaged old session must not prevent a fresh sign-in.
    const previous = await this.read().catch(() => null);
    const deviceId =
      previous?.deviceId ??
      'cinefern-' +
        Date.now().toString(36) +
        '-' +
        Math.random().toString(36).slice(2);
    const session = await authenticateJellyfin(
      this.transport,
      String(values.serverUrl || ''),
      String(values.username || ''),
      String(values.password ?? ''),
      deviceId,
    );
    await this.storage.set(JELLYFIN_SESSION_KEY, JSON.stringify(session));
    return {
      serverUrl: session.serverUrl,
      username: session.username,
      userId: session.userId,
    };
  }

  async restore(
    saved: Record<string, SettingValue>,
  ): Promise<Record<string, SettingValue>> {
    // Match both server and user before injecting a credential into a provider's context.
    const session = await this.read();
    if (
      !session ||
      session.serverUrl !== saved.serverUrl ||
      session.userId !== saved.userId
    )
      return {};
    return { ...session };
  }

  async disconnect() {
    const session = await this.read().catch(() => null);
    await this.storage.remove(JELLYFIN_SESSION_KEY);
    // Local sign-out works even if the server is offline. Revoke the session when reachable.
    if (session) void logoutJellyfin(this.transport, session).catch(() => {});
  }
}
