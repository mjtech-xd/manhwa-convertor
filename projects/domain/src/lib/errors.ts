// Typed domain errors. Adapters convert HTTP/IPC failures into these at
// the boundary so use-cases never see raw transport errors.

export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}

export class ExtractError extends DomainError {
  readonly code = 'extract.failed';
}

export class FilterError extends DomainError {
  readonly code = 'filter.failed';
}

export class LLMResponseError extends DomainError {
  readonly code = 'llm.malformed-response';
}

export class QuotaExceededError extends DomainError {
  readonly code = 'llm.quota-exceeded';
}

export class NoApiKeyAvailableError extends DomainError {
  readonly code = 'llm.no-key-available';
}

export class TtsRenderError extends DomainError {
  readonly code = 'tts.render-failed';
}

export class StorageError extends DomainError {
  readonly code = 'storage.failed';
}

export class IpcError extends DomainError {
  readonly code = 'ipc.failed';
}

export class ValidationError extends DomainError {
  readonly code = 'validation.failed';
}
