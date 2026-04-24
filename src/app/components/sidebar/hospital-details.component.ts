import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { HospitalRecord } from '../../models/hospital.model';
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

  protected descriptionSummary(description: string): string {
    return description.length > 160 ? `${description.slice(0, 157).trimEnd()}...` : description;
  }

  protected websiteLabel(website: string): string {
    return website.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}