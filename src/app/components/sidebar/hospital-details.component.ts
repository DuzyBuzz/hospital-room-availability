import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { HospitalRecord } from '../../models/hospital.model';
import { MapService } from '../../core/services/map.service';
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
  protected readonly mapService = inject(MapService);

  readonly hospital = input<HospitalRecord | null>(null);

  protected readonly travelRoute = computed(() => {
    const selectedHospital = this.hospital();
    const activeRoute = this.mapService.activeRoute();

    if (!selectedHospital || !activeRoute || activeRoute.destinationId !== selectedHospital.id) {
      return null;
    }

    return activeRoute;
  });
  protected readonly travelDistance = computed(() => {
    const travelRoute = this.travelRoute();

    return travelRoute ? this.mapService.formatDistance(travelRoute.distanceMeters) : null;
  });
  protected readonly travelDuration = computed(() => {
    const travelRoute = this.travelRoute();

    return travelRoute ? this.mapService.formatDuration(travelRoute.durationSeconds) : null;
  });
  protected readonly directionsPreview = computed(() => this.travelRoute()?.steps.slice(0, 4) ?? []);
  protected readonly directionsUrl = computed(() => {
    const selectedHospital = this.hospital();

    return selectedHospital ? this.mapService.getDirectionsUrl(selectedHospital.location) : null;
  });

  protected statusMeta(hospital: HospitalRecord) {
    return getHospitalStatusMeta(hospital.status);
  }

  protected formatLastUpdated(hospital: HospitalRecord): string {
    return formatDateTime(hospital.updatedAt || hospital.createdAt);
  }

  protected formatStepDistance(distanceMeters: number): string {
    return this.mapService.formatDistance(distanceMeters);
  }
}