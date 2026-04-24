import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { HospitalRecord } from '../../models/hospital.model';
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

  protected roomSummary(hospital: HospitalRecord): string {
    return `${hospital.availableRooms} / ${hospital.totalRooms} rooms`;
  }
}