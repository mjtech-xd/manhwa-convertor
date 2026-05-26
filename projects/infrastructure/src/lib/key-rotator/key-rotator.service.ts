// Minimal key rotator for Phase 3. Holds Gemini API keys in
// localStorage, tracks per-day + per-minute usage, picks the next live
// key when asked.
//
// FOLLOW-UPS (CLAUDE.md):
//   - Move canonical state into the Electron main process (single
//     source of truth across windows).
//   - Use safeStorage / keytar instead of localStorage.

import { Injectable, signal } from '@angular/core';
import {
  ApiKeyId,
  IsoDateTime,
  NoApiKeyAvailableError,
  type ApiKey,
  type ApiKeyUsage,
  type KeyLimits,
  DEFAULT_KEY_LIMITS,
} from 'domain';

const STORAGE_KEY_KEYS = 'mc.apiKeys.v1';
const STORAGE_KEY_USAGE = 'mc.apiKeyUsage.v1';

interface StoredKey {
  readonly id: string;
  readonly label: string;
  readonly secret: string;
  readonly provider: 'gemini' | 'openrouter' | 'ai33';
  readonly addedAt: string;
}

interface StoredUsage {
  readonly keyId: string;
  readonly usageDay: number;
  readonly resetDate: string;
  readonly recentRequestTimestamps: readonly number[];
}

@Injectable({ providedIn: 'root' })
export class KeyRotatorService {
  private readonly keys = signal<readonly ApiKey[]>(this.loadKeys());
  readonly geminiKeys = this.keys.asReadonly();

  list(): readonly ApiKey[] {
    return this.keys();
  }

  add(label: string, secret: string, provider: ApiKey['provider'] = 'gemini'): ApiKey {
    const key: ApiKey = {
      id: ApiKeyId(crypto.randomUUID()),
      label,
      secret,
      provider,
      addedAt: IsoDateTime(new Date().toISOString()),
    };
    const next = [...this.keys(), key];
    this.keys.set(next);
    this.persistKeys(next);
    return key;
  }

  remove(id: ApiKey['id']): void {
    const next = this.keys().filter((k) => k.id !== id);
    this.keys.set(next);
    this.persistKeys(next);
  }

  /**
   * Pick the next available Gemini key. Increments its usage counter
   * immediately so concurrent calls don't pick the same one.
   * Throws NoApiKeyAvailableError if every key is exhausted.
   */
  pickGeminiKey(limits: KeyLimits = DEFAULT_KEY_LIMITS): ApiKey {
    const today = new Date().toISOString().slice(0, 10);
    const now = Date.now();
    const minuteAgo = now - 60_000;

    const usages = this.loadUsage();

    const candidates = this.keys()
      .filter((k) => k.provider === 'gemini')
      .map((k) => {
        let u = usages[k.id];
        if (!u || u.resetDate !== today) {
          u = { keyId: k.id, usageDay: 0, resetDate: today, recentRequestTimestamps: [] };
        }
        const recent = u.recentRequestTimestamps.filter((t) => t > minuteAgo);
        return { key: k, usage: { ...u, recentRequestTimestamps: recent } };
      })
      .filter(({ usage }) =>
        usage.usageDay < limits.dailyCap && usage.recentRequestTimestamps.length < limits.perMinuteCap,
      )
      .sort((a, b) => a.usage.usageDay - b.usage.usageDay);

    const pick = candidates[0];
    if (!pick) throw new NoApiKeyAvailableError('All Gemini keys are throttled or exhausted.');

    usages[pick.key.id] = {
      keyId: pick.key.id,
      usageDay: pick.usage.usageDay + 1,
      resetDate: today,
      recentRequestTimestamps: [...pick.usage.recentRequestTimestamps, now],
    };
    this.persistUsage(usages);
    return pick.key;
  }

  // ─── Persistence ────────────────────────────────────────────────────

  private loadKeys(): readonly ApiKey[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_KEYS);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as readonly StoredKey[];
      return parsed.map((k) => ({
        id: ApiKeyId(k.id),
        label: k.label,
        secret: k.secret,
        provider: k.provider,
        addedAt: IsoDateTime(k.addedAt),
      }));
    } catch {
      return [];
    }
  }

  private persistKeys(keys: readonly ApiKey[]): void {
    const stored: StoredKey[] = keys.map((k) => ({
      id: String(k.id),
      label: k.label,
      secret: k.secret,
      provider: k.provider,
      addedAt: String(k.addedAt),
    }));
    localStorage.setItem(STORAGE_KEY_KEYS, JSON.stringify(stored));
  }

  private loadUsage(): Record<string, StoredUsage> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_USAGE);
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, StoredUsage>;
    } catch {
      return {};
    }
  }

  private persistUsage(usages: Record<string, StoredUsage>): void {
    localStorage.setItem(STORAGE_KEY_USAGE, JSON.stringify(usages));
  }
}

// Re-export for type-only use in domain consumers.
export type { ApiKeyUsage };
