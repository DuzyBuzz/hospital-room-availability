import { Injectable } from '@angular/core';
import type { Coordinates } from '../../models/hospital.model';

export interface TravelRouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface TravelRouteResult {
  distanceMeters: number;
  durationSeconds: number;
  geometry: Coordinates[];
  steps: TravelRouteStep[];
}

interface OsrmStep {
  distance: number;
  duration: number;
  name: string;
  maneuver: {
    type: string;
    modifier?: string;
  };
}

interface OsrmLeg {
  steps: OsrmStep[];
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: {
    coordinates: [number, number][];
  };
  legs: OsrmLeg[];
}

interface OsrmResponse {
  code: string;
  routes: OsrmRoute[];
}

@Injectable({
  providedIn: 'root',
})
export class DirectionsService {
  async getDrivingRoute(origin: Coordinates, destination: Coordinates): Promise<TravelRouteResult> {
    const requestUrl = new URL(
      `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`,
    );
    requestUrl.searchParams.set('alternatives', 'false');
    requestUrl.searchParams.set('overview', 'full');
    requestUrl.searchParams.set('geometries', 'geojson');
    requestUrl.searchParams.set('steps', 'true');

    const response = await fetch(requestUrl.toString(), {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Route lookup failed.');
    }

    const payload = (await response.json()) as OsrmResponse;

    if (payload.code !== 'Ok' || payload.routes.length === 0) {
      throw new Error('No route available.');
    }

    const primaryRoute = payload.routes[0];

    return {
      distanceMeters: primaryRoute.distance,
      durationSeconds: primaryRoute.duration,
      geometry: primaryRoute.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      steps: primaryRoute.legs.flatMap((leg) =>
        leg.steps.map((step) => ({
          instruction: this.buildInstruction(step),
          distanceMeters: step.distance,
          durationSeconds: step.duration,
        })),
      ),
    };
  }

  private buildInstruction(step: OsrmStep): string {
    const streetName = step.name.trim();
    const streetSuffix = streetName.length > 0 ? ` on ${streetName}` : '';
    const maneuverType = step.maneuver.type;
    const modifier = step.maneuver.modifier;

    switch (maneuverType) {
      case 'depart':
        return `Start${streetSuffix}`;
      case 'arrive':
        return 'Arrive at the medical facility';
      case 'continue':
      case 'new name':
        return `Continue${streetSuffix}`;
      case 'turn':
      case 'fork':
      case 'merge':
      case 'end of road':
      case 'notification':
      case 'off ramp':
      case 'on ramp':
        return `${this.capitalize(modifier ?? 'continue')}${streetSuffix}`;
      case 'roundabout':
      case 'rotary':
        return streetName.length > 0 ? `Enter the roundabout toward ${streetName}` : 'Enter the roundabout';
      default:
        return streetName.length > 0 ? `Proceed on ${streetName}` : 'Continue to the medical facility';
    }
  }

  private capitalize(value: string): string {
    return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
  }
}