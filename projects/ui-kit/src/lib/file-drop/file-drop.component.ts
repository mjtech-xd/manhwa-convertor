import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';

@Component({
  selector: 'mc-file-drop',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label
      class="drop"
      [class.is-active]="isDragging()"
      (dragenter)="onDragEnter($event)"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      <input type="file" [attr.accept]="accept" multiple hidden (change)="onPick($event)" />
      <strong>{{ label }}</strong>
      <span class="hint">{{ hint }}</span>
    </label>
  `,
  styles: [`
    .drop {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      padding: 2rem;
      border: 2px dashed var(--mc-border);
      border-radius: 0.6rem;
      cursor: pointer;
      transition: border-color 120ms ease, background 120ms ease;
      background: var(--mc-bg-elev);
    }
    .drop:hover, .drop.is-active {
      border-color: var(--mc-accent);
      background: var(--mc-bg-hover);
    }
    strong { font-size: 0.95rem; }
    .hint { color: var(--mc-text-muted); font-size: 0.8rem; }
  `],
})
export class FileDropComponent {
  accept = 'application/pdf';
  label = 'Drop a PDF here or click to choose';
  hint = 'Single chapter, up to 200 MB';

  readonly filesPicked = output<readonly File[]>();
  protected readonly isDragging = signal(false);

  onDragEnter(e: DragEvent): void { e.preventDefault(); this.isDragging.set(true); }
  onDragOver(e: DragEvent):  void { e.preventDefault(); }
  onDragLeave(e: DragEvent): void { e.preventDefault(); this.isDragging.set(false); }
  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(false);
    const files = e.dataTransfer?.files;
    if (files && files.length) this.emit(Array.from(files));
  }
  onPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length) this.emit(Array.from(input.files));
    input.value = '';
  }

  private emit(files: readonly File[]): void {
    const filtered = files.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (filtered.length) this.filesPicked.emit(filtered);
  }
}
