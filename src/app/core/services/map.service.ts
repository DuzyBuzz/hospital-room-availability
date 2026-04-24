import { Injectable, computed, inject, signal } from '@angular/core';
import type { Coordinates, HospitalRecord } from '../../models/hospital.model';
import { DirectionsService, type TravelRouteResult } from './directions.service';
import { FeedbackService } from './feedback.service';

export interface ActiveTravelRoute extends TravelRouteResult {
  destinationId: string;
  destinationName: string;
  directionsUrl: string;
}

@Injectable({
  providedIn: 'root',
})
export class MapService {
  private readonly directionsService = inject(DirectionsService);
  private readonly feedbackService = inject(FeedbackService);

  private activeRequestKey: string | null = null;
  private routeFeedbackKey: string | null = null;
  private resolvedRouteKey: string | null = null;

  readonly initialCenter = [10.7202, 122.5621] as const;
  readonly initialZoom = 12.3;

  readonly draftLocation = signal<Coordinates | null>(null);
  readonly userLocation = signal<Coordinates | null>(null);
  readonly activeRoute = signal<ActiveTravelRoute | null>(null);
  readonly routeLoading = signal(false);
  readonly routeError = signal<string | null>(null);
  readonly mapNotice = signal(
    'Browse live hospitals, compare room counts, and inspect availability across Iloilo in real time.',
  );

  readonly selectedLocationLabel = computed(() => {
    const draftLocation = this.draftLocation();

    return draftLocation
      ? `${draftLocation.lat.toFixed(5)}, ${draftLocation.lng.toFixed(5)}`
      : 'Put a 🚩 on the map to set the exact medical facility location.';
  });
  readonly userLocationLabel = computed(() => {
    const userLocation = this.userLocation();

    return userLocation
      ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`
      : 'GPS location unavailable';
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

  setUserLocation(location: Coordinates): void {
    this.userLocation.set(location);
    this.routeError.set(null);
  }

  clearRoute(): void {
    this.activeRequestKey = null;
    this.routeFeedbackKey = null;
    this.resolvedRouteKey = null;
    this.routeLoading.set(false);
    this.routeError.set(null);
    this.activeRoute.set(null);
  }

  async updateRouteToHospital(hospital: HospitalRecord): Promise<void> {
    const userLocation = this.userLocation();

    if (!userLocation) {
      this.clearRoute();
      return;
    }

    const requestKey = [
      hospital.id,
      userLocation.lat.toFixed(4),
      userLocation.lng.toFixed(4),
      hospital.location.lat.toFixed(4),
      hospital.location.lng.toFixed(4),
    ].join(':');

    if (this.resolvedRouteKey === requestKey && this.activeRoute()?.destinationId === hospital.id) {
      return;
    }

    this.activeRequestKey = requestKey;
    this.routeLoading.set(true);
    this.routeError.set(null);

    try {
      const route = await this.directionsService.getDrivingRoute(userLocation, hospital.location);

      if (this.activeRequestKey !== requestKey) {
        return;
      }

      this.activeRoute.set({
        ...route,
        destinationId: hospital.id,
        destinationName: hospital.name,
        directionsUrl: this.getDirectionsUrl(hospital.location) ?? '',
      });
      this.routeFeedbackKey = null;
      this.resolvedRouteKey = requestKey;
    } catch (error) {
      if (this.activeRequestKey !== requestKey) {
        return;
      }

      this.activeRoute.set(null);
      this.resolvedRouteKey = null;
      this.routeError.set('Directions and travel time are temporarily unavailable.');

      if (this.routeFeedbackKey !== requestKey) {
        this.feedbackService.warn(
          'Directions unavailable',
          'Driving time and route guidance are temporarily unavailable for this facility.',
        );
        this.routeFeedbackKey = requestKey;
      }
    } finally {
      if (this.activeRequestKey === requestKey) {
        this.routeLoading.set(false);
      }
    }
  }

  formatDistance(distanceMeters: number): string {
    if (distanceMeters < 1000) {
      return `${Math.round(distanceMeters)} m`;
    }

    const distanceKilometers = distanceMeters / 1000;

    return distanceKilometers >= 10
      ? `${distanceKilometers.toFixed(0)} km`
      : `${distanceKilometers.toFixed(1)} km`;
  }

  formatDuration(durationSeconds: number): string {
    const totalMinutes = Math.max(1, Math.round(durationSeconds / 60));

    if (totalMinutes < 60) {
      return `${totalMinutes} min`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
  }

  getDirectionsUrl(destination: Coordinates): string | null {
    const userLocation = this.userLocation();

    if (!userLocation) {
      return null;
    }

    const requestUrl = new URL('https://www.google.com/maps/dir/');
    requestUrl.searchParams.set('api', '1');
    requestUrl.searchParams.set('origin', `${userLocation.lat},${userLocation.lng}`);
    requestUrl.searchParams.set('destination', `${destination.lat},${destination.lng}`);
    requestUrl.searchParams.set('travelmode', 'driving');

    return requestUrl.toString();
  }
}