/*
 * Public API surface of `infrastructure`.
 * Adapters are NOT re-exported individually — consumers wire them via
 * `provideInfrastructure()`. The KeyRotatorService is the one exception
 * because feature-settings needs to call add()/remove() directly.
 */

export * from './lib/providers';
export { KeyRotatorService } from './lib/key-rotator/key-rotator.service';
