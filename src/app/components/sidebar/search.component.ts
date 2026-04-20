import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search.component.html',
  host: {
    class: 'block',
  },
})
export class SearchComponent {
  readonly query = input('');
  readonly queryChange = output<string>();

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.queryChange.emit(target?.value ?? '');
  }
}