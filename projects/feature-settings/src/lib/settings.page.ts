import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { KeyRotatorService } from 'infrastructure';

@Component({
  selector: 'mc-settings-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgIcon],
  template: `
    <section class="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h2 class="m-0 flex items-center gap-2 text-xl">
        <ng-icon name="lucideSettings" size="1.25rem" />
        Settings
      </h2>

      <section class="rounded-lg border border-mc-border bg-mc-bg-elev p-4">
        <h3 class="m-0 mb-2 flex items-center gap-2 text-base font-medium">
          <ng-icon name="lucideKey" size="1rem" />
          Gemini API keys
        </h3>
        <p class="m-0 mb-3 text-sm text-mc-text-muted">
          Add one or more Gemini keys. The pipeline rotates between them to stay within free-tier quotas.
          Get a free key at
          <a class="underline" href="https://aistudio.google.com/apikey" rel="noopener" target="_blank">
            aistudio.google.com/apikey
          </a>.
        </p>

        <form class="flex flex-wrap items-center gap-2" (submit)="$event.preventDefault(); add()">
          <input
            type="text"
            [(ngModel)]="newLabel"
            name="label"
            placeholder="Label (e.g. 'main account')"
            class="min-w-[12rem] rounded border border-mc-border bg-mc-bg px-2 py-1.5 text-mc-text outline-none focus:border-mc-accent"
          />
          <div class="relative flex-1 min-w-[18rem]">
            <input
              [type]="reveal() ? 'text' : 'password'"
              [(ngModel)]="newSecret"
              name="secret"
              placeholder="AIza…"
              autocomplete="off"
              spellcheck="false"
              class="w-full rounded border border-mc-border bg-mc-bg px-2 py-1.5 pr-9 text-mc-text outline-none focus:border-mc-accent"
            />
            <button
              type="button"
              (click)="reveal.set(!reveal())"
              [attr.aria-label]="reveal() ? 'Hide key' : 'Show key'"
              class="absolute inset-y-0 right-0 grid w-9 place-items-center text-mc-text-muted hover:text-mc-text"
            >
              <ng-icon [name]="reveal() ? 'lucideEyeOff' : 'lucideEye'" size="1rem" />
            </button>
          </div>
          <button
            type="submit"
            [disabled]="!canAdd()"
            class="rounded bg-mc-accent px-3 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </form>

        @if (keyCount() === 0) {
          <p class="mt-3 italic text-mc-text-faint">
            No keys yet — add one to enable the bible / narration stages.
          </p>
        } @else {
          <ul class="mt-3 flex list-none flex-col gap-1.5 p-0">
            @for (k of keys(); track k.id) {
              <li class="grid grid-cols-[12rem_1fr_auto] items-center gap-3 rounded border border-mc-border bg-mc-bg px-3 py-2">
                <span class="font-medium text-mc-text">{{ k.label || '(no label)' }}</span>
                <span class="font-mono text-xs text-mc-text-muted">{{ mask(k.secret) }}</span>
                <button
                  type="button"
                  (click)="remove(k.id)"
                  class="flex items-center gap-1 rounded border border-mc-border px-2 py-1 text-mc-text-muted hover:border-mc-danger hover:text-mc-danger"
                >
                  <ng-icon name="lucideTrash2" size="0.9rem" />
                  <span>Remove</span>
                </button>
              </li>
            }
          </ul>
        }
      </section>

      <section class="rounded-lg border border-mc-border bg-mc-bg-elev p-4">
        <h3 class="m-0 mb-2 flex items-center gap-2 text-base font-medium">
          <ng-icon name="lucideMic" size="1rem" />
          AI33 API key (TTS)
        </h3>
        <p class="m-0 mb-3 text-sm text-mc-text-muted">
          Required for the TTS tab. ai33.pro is an ElevenLabs-compatible aggregator — get a key at
          <a class="underline" href="https://ai33.pro" rel="noopener" target="_blank">ai33.pro</a>.
        </p>

        <form class="flex flex-wrap items-center gap-2" (submit)="$event.preventDefault(); addAi33()">
          <input
            type="text"
            [(ngModel)]="newAi33Label"
            name="ai33label"
            placeholder="Label (e.g. 'ai33 main')"
            class="min-w-[12rem] rounded border border-mc-border bg-mc-bg px-2 py-1.5 text-mc-text outline-none focus:border-mc-accent"
          />
          <div class="relative flex-1 min-w-[18rem]">
            <input
              [type]="revealAi33() ? 'text' : 'password'"
              [(ngModel)]="newAi33Secret"
              name="ai33secret"
              placeholder="API key…"
              autocomplete="off"
              spellcheck="false"
              class="w-full rounded border border-mc-border bg-mc-bg px-2 py-1.5 pr-9 text-mc-text outline-none focus:border-mc-accent"
            />
            <button
              type="button"
              (click)="revealAi33.set(!revealAi33())"
              [attr.aria-label]="revealAi33() ? 'Hide key' : 'Show key'"
              class="absolute inset-y-0 right-0 grid w-9 place-items-center text-mc-text-muted hover:text-mc-text"
            >
              <ng-icon [name]="revealAi33() ? 'lucideEyeOff' : 'lucideEye'" size="1rem" />
            </button>
          </div>
          <button
            type="submit"
            [disabled]="!canAddAi33()"
            class="rounded bg-mc-accent px-3 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </form>

        @if (ai33KeyCount() === 0) {
          <p class="mt-3 italic text-mc-text-faint">No AI33 key yet — add one to enable TTS rendering.</p>
        } @else {
          <ul class="mt-3 flex list-none flex-col gap-1.5 p-0">
            @for (k of ai33Keys(); track k.id) {
              <li class="grid grid-cols-[12rem_1fr_auto] items-center gap-3 rounded border border-mc-border bg-mc-bg px-3 py-2">
                <span class="font-medium text-mc-text">{{ k.label || '(no label)' }}</span>
                <span class="font-mono text-xs text-mc-text-muted">{{ mask(k.secret) }}</span>
                <button
                  type="button"
                  (click)="remove(k.id)"
                  class="flex items-center gap-1 rounded border border-mc-border px-2 py-1 text-mc-text-muted hover:border-mc-danger hover:text-mc-danger"
                >
                  <ng-icon name="lucideTrash2" size="0.9rem" />
                  <span>Remove</span>
                </button>
              </li>
            }
          </ul>
        }
      </section>
    </section>
  `,
})
export class SettingsPage {
  private readonly rotator = inject(KeyRotatorService);

  protected readonly keys = this.rotator.geminiKeys;
  protected readonly keyCount = computed(() => this.keys().length);
  protected readonly ai33Keys = this.rotator.ai33Keys;
  protected readonly ai33KeyCount = computed(() => this.ai33Keys().length);

  protected newLabel = '';
  protected newSecret = '';
  protected readonly reveal = signal(false);

  protected newAi33Label = '';
  protected newAi33Secret = '';
  protected readonly revealAi33 = signal(false);

  protected canAdd = (): boolean => this.newSecret.trim().length >= 20;
  protected canAddAi33 = (): boolean => this.newAi33Secret.trim().length >= 10;

  add(): void {
    const secret = this.newSecret.trim();
    if (secret.length < 20) return;
    this.rotator.add(this.newLabel.trim(), secret, 'gemini');
    this.newLabel = '';
    this.newSecret = '';
  }

  addAi33(): void {
    const secret = this.newAi33Secret.trim();
    if (secret.length < 10) return;
    this.rotator.add(this.newAi33Label.trim(), secret, 'ai33');
    this.newAi33Label = '';
    this.newAi33Secret = '';
  }

  remove(id: ReturnType<typeof this.rotator.list>[number]['id']): void {
    this.rotator.remove(id);
  }

  mask(secret: string): string {
    if (secret.length <= 8) return '****';
    return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
  }
}
