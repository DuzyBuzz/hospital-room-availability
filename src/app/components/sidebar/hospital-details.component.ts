import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { HospitalRecord } from '../../models/hospital.model';
import { formatDateTime } from '../../shared/utils/date-time.util';
import { getHospitalStatusMeta } from '../../shared/utils/hospital-status.util';

@Component({
  selector: 'app-hospital-details',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hospital-details.component.html',
  host: {
    class: 'block',
  },
})
export class HospitalDetailsComponent {
  readonly hospital = input<HospitalRecord | null>(null);

  protected statusMeta(hospital: HospitalRecord) {
    return getHospitalStatusMeta(hospital.status);
  }

  protected formatLastUpdated(hospital: HospitalRecord): string {
    return formatDateTime(hospital.updatedAt || hospital.createdAt);
  }
}