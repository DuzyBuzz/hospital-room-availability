import { Injectable, computed, signal } from '@angular/core';
import type { Coordinates } from '../../models/hospital.model';

@Injectable({
  providedIn: 'root',
})
export class MapService {
  readonly initialCenter = [10.7202, 122.5621] as const;
  readonly initialZoom = 12.3;

  readonly draftLocation = signal<Coordinates | null>(null);
  readonly mapNotice = signal(
    'Browse live hospitals, compare room counts, and inspect availability across Iloilo in real time.',
  );

  readonly selectedLocationLabel = computed(() => {
    const draftLocation = this.draftLocation();

    return draftLocation
      ? `${draftLocation.lat.toFixed(5)}, ${draftLocation.lng.toFixed(5)}`
      : 'Put a 🚩 on the map to set the exact hospital location.';
  });

  setDraftLocation(location: Coordinates): void {
    this.draftLocation.set(location);
  }

  clearDraftLocation(): void {
    this.draftLocation.set(null);
  }

  setMapNotice(notice: string): void {
    this.mapNotice.set(notice);
  }
}