import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { HospitalRecord } from '../../models/hospital.model';
import { formatRelativeTime } from '../../shared/utils/date-time.util';
import { getHospitalStatusMeta } from '../../shared/utils/hospital-status.util';

@Component({
  selector: 'app-hospital-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hospital-list.component.html',
  host: {
    class: 'block',
  },
})
export class HospitalListComponent {
  readonly hospitals = input<HospitalRecord[]>([]);
  readonly selectedHospitalId = input<string | null>(null);
  readonly loading = input(false);

  readonly hospitalSelected = output<string>();

  protected statusMeta(hospital: HospitalRecord) {
    return getHospitalStatusMeta(hospital.status);
  }

  protected locationLabel(hospital: HospitalRecord): string {
    return hospital.landmark || hospital.area || hospital.address || 'Iloilo City';
  }

  protected roomTypeSummary(hospital: HospitalRecord): string {
    return hospital.roomTypes.length > 0 ? hospital.roomTypes.join(', ') : 'Room types pending update';
  }

  protected shortDescription(description: string): string {
    return description.length > 120 ? `${description.slice(0, 117).trimEnd()}...` : description;
  }

  protected relativeTime(hospital: HospitalRecord): string {
    return formatRelativeTime(hospital.updatedAt || hospital.createdAt);
  }
}