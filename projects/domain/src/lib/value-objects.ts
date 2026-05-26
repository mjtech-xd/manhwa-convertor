// Branded primitives. Catch mix-ups at compile time without runtime cost.

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type ChapterId   = Brand<string, 'ChapterId'>;
export type SessionId   = Brand<string, 'SessionId'>;
export type SceneId     = Brand<string, 'SceneId'>;
export type ApiKeyId    = Brand<string, 'ApiKeyId'>;
export type IsoDate     = Brand<string, 'IsoDate'>;       // YYYY-MM-DD
export type IsoDateTime = Brand<string, 'IsoDateTime'>;   // RFC 3339

export const ChapterId   = (s: string) => s as ChapterId;
export const SessionId   = (s: string) => s as SessionId;
export const SceneId     = (s: string) => s as SceneId;
export const ApiKeyId    = (s: string) => s as ApiKeyId;
export const IsoDate     = (s: string) => s as IsoDate;
export const IsoDateTime = (s: string) => s as IsoDateTime;

export type ModelTier = 'flash' | 'flash-lite' | 'pro';

export const MODEL_TIERS = ['flash', 'flash-lite', 'pro'] as const satisfies readonly ModelTier[];

export interface Dimensions {
  readonly width: number;
  readonly height: number;
}
