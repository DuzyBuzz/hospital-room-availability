import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { HospitalStatus } from '../../models/hospital.model';
import type { StatusFilterState } from '../../shared/interfaces/hospital-filters.interface';
import type { HospitalStatusOption } from '../../shared/utils/hospital-status.util';

@Component({
  selector: 'app-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './filters.component.html',
  host: {
    class: 'block',
  },
})
export class FiltersComponent {
  readonly query = input('');
  readonly statusOptions = input<readonly HospitalStatusOption[]>([]);
  readonly activeStatuses = input<StatusFilterState>({
    available: true,
    fewBeds: true,
    full: true,
  });
  readonly statusCounts = input<Record<HospitalStatus, number>>({
    available: 0,
    fewBeds: 0,
    full: 0,
  });
  readonly roomTypeOptions = input<string[]>([]);
  readonly selectedRoomType = input('all');
  readonly areaOptions = input<string[]>([]);
  readonly selectedArea = input('all');

  readonly queryChange = output<string>();
  readonly statusToggled = output<HospitalStatus>();
  readonly roomTypeChanged = output<string>();
  readonly areaChanged = output<string>();

  protected isActive(status: HospitalStatus): boolean {
    return this.activeStatuses()[status];
  }

  protected onRoomTypeChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.roomTypeChanged.emit(target?.value ?? 'all');
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.queryChange.emit(target?.value ?? '');
  }

  protected onAreaChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.areaChanged.emit(target?.value ?? 'all');
  }
}