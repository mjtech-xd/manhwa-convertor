import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIcon],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent {
  protected readonly nav: readonly NavItem[] = [
    { path: '/single',   label: 'Single',   icon: 'lucideFileText' },
    { path: '/bulk',     label: 'Bulk',     icon: 'lucideLayers'   },
    { path: '/tts',      label: 'TTS',      icon: 'lucideMic'      },
    { path: '/settings', label: 'Settings', icon: 'lucideSettings' },
    { path: '/debug',    label: 'Debug',    icon: 'lucideBug'      },
  ];
}
