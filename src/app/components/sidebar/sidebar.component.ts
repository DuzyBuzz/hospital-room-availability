import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DrawerModule } from 'primeng/drawer';

@Component({
  selector: 'app-sidebar',
  imports: [DrawerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.component.html',
  host: {
    class: 'block',
  },
})
export class SidebarComponent {
  readonly visible = input(false);
  readonly position = input<'left' | 'right' | 'top' | 'bottom' | 'full'>('left');
  readonly modal = input(true);
  readonly dismissible = input(true);
  readonly closable = input(false);
  readonly closeOnEscape = input(true);
  readonly blockScroll = input(true);
  readonly baseZIndex = input(1200);
  readonly styleClass = input('');
  readonly appendTo = input<any>('body');

  readonly visibleChange = output<boolean>();

  protected handleVisibleChange(visible: boolean): void {
    this.visibleChange.emit(visible);
  }
}