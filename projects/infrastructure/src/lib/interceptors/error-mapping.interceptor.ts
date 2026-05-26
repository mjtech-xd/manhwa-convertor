// Maps HttpErrorResponse → typed DomainError so use-cases never see
// raw transport errors. Currently maps:
//   - 401/403 → NoApiKeyAvailableError (best-effort: indicates the key
//     was rejected; KeyRotatorService will rotate next call).
//   - 429 / quota response shapes → QuotaExceededError
//   - everything else → LLMResponseError
//
// The interceptor is wide on purpose; per-host nuance can be added if
// it becomes necessary.

import type { HttpErrorResponse, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { LLMResponseError, NoApiKeyAvailableError, QuotaExceededError } from 'domain';

export function errorMappingInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) {
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 || err.status === 403) {
        return throwError(() => new NoApiKeyAvailableError(`HTTP ${err.status} from ${req.url}`, err));
      }
      if (err.status === 429) {
        return throwError(() => new QuotaExceededError(`HTTP 429 from ${req.url}`, err));
      }
      return throwError(() => new LLMResponseError(`HTTP ${err.status} from ${req.url}`, err));
    }),
  );
}
