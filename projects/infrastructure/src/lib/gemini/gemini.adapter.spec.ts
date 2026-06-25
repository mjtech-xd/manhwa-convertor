import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { BLOB_REGISTRY_PORT, type CharacterBible } from '@mc/domain';
import { GeminiAdapter } from './gemini.adapter';
import { KeyRotatorService } from '../key-rotator/key-rotator.service';

const ACCURACY_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/' +
  'gemini-2.0-flash:generateContent?key=test-key';

function accuracyResponse(issues: readonly string[]) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify({ issues }) }] } }],
  };
}

const EMPTY_BIBLE: CharacterBible = { characters: [], setting: '', tone: '' };

describe('GeminiAdapter caching', () => {
  let adapter: GeminiAdapter;
  let http: HttpTestingController;
  let pickCount: number;

  beforeEach(() => {
    pickCount = 0;
    const fakeKeys = {
      pickGeminiKey() {
        pickCount++;
        return { secret: 'test-key' };
      },
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: KeyRotatorService, useValue: fakeKeys },
        { provide: BLOB_REGISTRY_PORT, useValue: { get: async () => undefined } },
      ],
    });
    adapter = TestBed.inject(GeminiAdapter);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('serves an identical second call from cache without a second request', async () => {
    const first = adapter.checkAccuracy('1. Ada walks in.', [], 'flash');
    http.expectOne(ACCURACY_URL).flush(accuracyResponse(['drift']));
    expect(await first).toEqual({ issues: ['drift'] });

    // Same script + tier → cache hit: no HTTP, no key pick.
    const second = await adapter.checkAccuracy('1. Ada walks in.', [], 'flash');
    http.expectNone(ACCURACY_URL);
    expect(second).toEqual({ issues: ['drift'] });
    expect(pickCount).toBe(1);
  });

  it('still issues a request when the input differs', async () => {
    const a = adapter.checkAccuracy('1. First.', [], 'flash');
    http.expectOne(ACCURACY_URL).flush(accuracyResponse([]));
    await a;

    const b = adapter.checkAccuracy('1. Second.', [], 'flash');
    http.expectOne(ACCURACY_URL).flush(accuracyResponse(['x']));
    expect(await b).toEqual({ issues: ['x'] });
    expect(pickCount).toBe(2);
  });

  it('does not cache a failed call', async () => {
    const first = adapter.buildBible([], 'flash');
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      'gemini-2.0-flash:generateContent?key=test-key';
    http.expectOne(url).flush('boom', { status: 500, statusText: 'Server Error' });
    await expect(first).rejects.toThrow(/buildBible/);

    // Retry of the same request must hit the network again.
    const retry = adapter.buildBible([], 'flash');
    http.expectOne(url).flush({
      candidates: [{ content: { parts: [{ text: JSON.stringify(EMPTY_BIBLE) }] } }],
    });
    expect(await retry).toEqual(EMPTY_BIBLE);
  });
});
