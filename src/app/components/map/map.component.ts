import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type {
  CircleMarker,
  Icon,
  LatLngExpression,
  LeafletMouseEvent,
  Map as LeafletMap,
  Marker,
  TileLayer,
} from 'leaflet';
import { MapService } from '../../core/services/map.service';
import type { Coordinates, HospitalRecord, HospitalStatus } from '../../models/hospital.model';
import { getHospitalStatusMeta, HOSPITAL_STATUS_OPTIONS } from '../../shared/utils/hospital-status.util';

@Component({
  selector: 'app-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './map.component.html',
  host: {
    class: 'block relative z-0 isolate',
  },
})
export class MapComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly mapService = inject(MapService);

  private readonly mapCanvas = viewChild.required<ElementRef<HTMLDivElement>>('mapCanvas');
  private readonly markers = new Map<string, Marker>();
  private readonly userLocation = signal<Coordinates | null>(null);

  private leaflet?: typeof import('leaflet');
  private map?: LeafletMap;
  private tileLayer?: TileLayer;
  private draftMarker?: Marker;
  private userLocationMarker?: CircleMarker;
  private userLocationHalo?: CircleMarker;

  readonly hospitals = input<HospitalRecord[]>([]);
  readonly selectedHospitalId = input<string | null>(null);
  readonly selectedHospital = input<HospitalRecord | null>(null);
  readonly panelTitle = input('Iloilo City, Philippines');
  readonly mapNotice = input('Click a hospital marker to inspect room availability details.');
  readonly allowLocationSelection = input(false);
  readonly draftLocation = input<Coordinates | null>(null);
  readonly displayMode = input<'full' | 'preview'>('full');

  readonly hospitalSelected = output<string>();
  readonly locationPicked = output<Coordinates>();

  protected readonly isFullDisplay = computed(() => this.displayMode() === 'full');
  protected readonly statusOptions = HOSPITAL_STATUS_OPTIONS;

  constructor() {
    afterNextRender(() => {
      void this.initializeMap();
    });

    effect(() => {
      this.syncMarkers();
    });

    effect(() => {
      this.syncDraftMarker();
    });

    effect(() => {
      this.syncUserLocationMarker();
    });

    effect(() => {
      const draftLocation = this.draftLocation();

      if (!this.map || !draftLocation || !this.allowLocationSelection()) {
        return;
      }

      this.map.flyTo([draftLocation.lat, draftLocation.lng] as LatLngExpression, 15.1, {
        animate: true,
        duration: 0.7,
      });
    });

    effect(() => {
      const selectedHospital = this.selectedHospital();

      if (!this.map || !selectedHospital) {
        return;
      }

      const marker = this.markers.get(selectedHospital.id);

      if (!marker) {
        return;
      }

      this.refreshMarkerIcons();
      this.map.flyTo([selectedHospital.location.lat, selectedHospital.location.lng] as LatLngExpression, 14.4, {
        animate: true,
        duration: 0.8,
      });
      marker.openPopup();
    });

    this.destroyRef.onDestroy(() => {
      this.map?.remove();
    });
  }

  public focusInitialView(): void {
    if (!this.map || !this.leaflet) {
      return;
    }

    if (this.hospitals().length > 1 && this.isFullDisplay()) {
      const bounds = this.leaflet.latLngBounds(
        this.hospitals().map((hospital) => [hospital.location.lat, hospital.location.lng] as [number, number]),
      );

      this.map.flyToBounds(bounds, {
        animate: true,
        duration: 0.8,
        maxZoom: 13.8,
        padding: [56, 56],
      });
      return;
    }

    this.map.flyTo([...this.mapService.initialCenter] as [number, number], this.mapService.initialZoom, {
      animate: true,
      duration: 0.8,
    });
  }

  public focusLocation(location: Coordinates, zoom = 15.2): void {
    if (!this.map) {
      return;
    }

    this.map.flyTo([location.lat, location.lng] as LatLngExpression, zoom, {
      animate: true,
      duration: 0.7,
    });
  }

  public locateUser(): void {
    this.requestUserLocation(true);
  }

  public zoomIn(): void {
    this.map?.zoomIn();
  }

  public zoomOut(): void {
    this.map?.zoomOut();
  }

  private async initializeMap(): Promise<void> {
    if (!this.shouldInitializeInteractiveFeatures()) {
      return;
    }

    this.leaflet = await import('leaflet');

    const mapContainer = this.mapCanvas().nativeElement;

    this.map = this.leaflet.map(mapContainer, {
      center: [...this.mapService.initialCenter] as [number, number],
      zoom: this.mapService.initialZoom,
      zoomControl: false,
      attributionControl: this.displayMode() !== 'preview',
      preferCanvas: true,
    });

    const tileSource = this.getTileSource();

    this.tileLayer = this.leaflet.tileLayer(tileSource.url, {
      maxZoom: 19,
      attribution: tileSource.attribution,
    }).addTo(this.map);

    if (this.displayMode() !== 'preview') {
      this.leaflet.control.attribution({ position: 'bottomright', prefix: false }).addTo(this.map);
    }

    this.map.on('click', (event: LeafletMouseEvent) => {
      if (!this.allowLocationSelection()) {
        return;
      }

      this.locationPicked.emit({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    });

    this.syncMarkers();
    this.syncDraftMarker();

    queueMicrotask(() => {
      this.map?.invalidateSize();
    });

    this.requestUserLocation(false);
  }

  private syncMarkers(): void {
    if (!this.map || !this.leaflet) {
      return;
    }

    const activeMarkerIds = new Set(this.hospitals().map((hospital) => hospital.id));

    for (const hospital of this.hospitals()) {
      const marker = this.upsertMarker(hospital);

      marker.setLatLng([hospital.location.lat, hospital.location.lng] as LatLngExpression);
      marker.setPopupContent(this.buildPopupMarkup(hospital));
      marker.setIcon(this.createMarkerIcon(hospital.status, hospital.id === this.selectedHospitalId()));

      if (!this.map.hasLayer(marker)) {
        marker.addTo(this.map);
      }
    }

    for (const [markerId, marker] of this.markers.entries()) {
      if (activeMarkerIds.has(markerId)) {
        continue;
      }

      marker.remove();
      marker.off();
      this.markers.delete(markerId);
    }
  }

  private upsertMarker(hospital: HospitalRecord): Marker {
    const existingMarker = this.markers.get(hospital.id);

    if (existingMarker) {
      return existingMarker;
    }

    const marker = this.leaflet!.marker([hospital.location.lat, hospital.location.lng] as LatLngExpression, {
      icon: this.createMarkerIcon(hospital.status, hospital.id === this.selectedHospitalId()),
    })
      .bindPopup(this.buildPopupMarkup(hospital), {
        autoPanPadding: [24, 24],
        closeButton: false,
        className: 'hospital-popup',
      })
      .bindTooltip(this.buildMarkerTooltipMarkup(hospital), {
        className: 'hospital-marker-tooltip',
        direction: 'top',
        offset: [0, -38],
        opacity: 1,
        permanent: this.isFullDisplay(),
      })
      .on('click', () => {
        this.hospitalSelected.emit(hospital.id);
      });

    this.markers.set(hospital.id, marker);

    return marker;
  }

  private refreshMarkerIcons(): void {
    const selectedHospitalId = this.selectedHospitalId();

    for (const hospital of this.hospitals()) {
      const marker = this.markers.get(hospital.id);

      if (!marker) {
        continue;
      }

      marker.setIcon(this.createMarkerIcon(hospital.status, hospital.id === selectedHospitalId));
      marker.setTooltipContent(this.buildMarkerTooltipMarkup(hospital));
    }
  }

  private syncDraftMarker(): void {
    if (!this.map || !this.leaflet) {
      return;
    }

    const draftLocation = this.draftLocation();

    if (!draftLocation || !this.allowLocationSelection()) {
      this.draftMarker?.remove();
      return;
    }

    if (!this.draftMarker) {
      this.draftMarker = this.leaflet
        .marker([draftLocation.lat, draftLocation.lng] as LatLngExpression, {
          icon: this.createDraftMarkerIcon(),
        })
        .bindPopup(
          '<div style="font-family: Manrope, sans-serif; font-size: 13px; color: #0f172a;"><strong>🚩 New facility pin</strong><br/>Place the flag where visitors should find the entrance or admissions point.</div>',
          {
            autoPanPadding: [24, 24],
            closeButton: false,
            className: 'hospital-popup',
          },
        );
    }

    this.draftMarker.setLatLng([draftLocation.lat, draftLocation.lng] as LatLngExpression);

    if (!this.map.hasLayer(this.draftMarker)) {
      this.draftMarker.addTo(this.map);
    }
  }

  private syncUserLocationMarker(): void {
    if (!this.map || !this.leaflet) {
      return;
    }

    const userLocation = this.userLocation();

    if (!userLocation) {
      this.userLocationHalo?.remove();
      this.userLocationMarker?.remove();
      return;
    }

    if (!this.userLocationHalo) {
      this.userLocationHalo = this.leaflet.circleMarker([userLocation.lat, userLocation.lng] as LatLngExpression, {
        radius: 14,
        stroke: false,
        fillColor: '#60a5fa',
        fillOpacity: 0.22,
        interactive: false,
      });
    }

    if (!this.userLocationMarker) {
      this.userLocationMarker = this.leaflet.circleMarker([userLocation.lat, userLocation.lng] as LatLngExpression, {
        radius: 6,
        color: '#ffffff',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 1,
        interactive: false,
      });
    }

    this.userLocationHalo.setLatLng([userLocation.lat, userLocation.lng] as LatLngExpression);
    this.userLocationMarker.setLatLng([userLocation.lat, userLocation.lng] as LatLngExpression);

    if (!this.map.hasLayer(this.userLocationHalo)) {
      this.userLocationHalo.addTo(this.map);
    }

    if (!this.map.hasLayer(this.userLocationMarker)) {
      this.userLocationMarker.addTo(this.map);
    }
  }

  private createMarkerIcon(status: HospitalStatus, isSelected: boolean): Icon {
    const statusMeta = getHospitalStatusMeta(status);
    const outerStroke = isSelected ? '#0f172a' : '#ffffff';
    const strokeWidth = isSelected ? 3 : 2.4;
    const innerCircleFill = isSelected ? '#dbeafe' : '#ffffff';

    const svgMarkup = `
      <svg width="36" height="48" viewBox="0 0 36 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="markerShadow" x="0" y="0" width="36" height="48" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="8" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.24"/>
          </filter>
        </defs>
        <g filter="url(#markerShadow)">
          <path d="M18 44C18 44 31 29.147 31 18.4C31 10.999 25.18 5 18 5C10.82 5 5 10.999 5 18.4C5 29.147 18 44 18 44Z" fill="${statusMeta.accent}" stroke="${outerStroke}" stroke-width="${strokeWidth}"/>
          <circle cx="18" cy="18" r="7.5" fill="${innerCircleFill}" fill-opacity="0.97"/>
          <path d="M18 13.2C18.663 13.2 19.2 13.737 19.2 14.4V16.8H21.6C22.263 16.8 22.8 17.337 22.8 18C22.8 18.663 22.263 19.2 21.6 19.2H19.2V21.6C19.2 22.263 18.663 22.8 18 22.8C17.337 22.8 16.8 22.263 16.8 21.6V19.2H14.4C13.737 19.2 13.2 18.663 13.2 18C13.2 17.337 13.737 16.8 14.4 16.8H16.8V14.4C16.8 13.737 17.337 13.2 18 13.2Z" fill="${statusMeta.accent}"/>
        </g>
      </svg>
    `;

    return this.leaflet!.icon({
      iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgMarkup)}`,
      iconSize: [36, 48],
      iconAnchor: [18, 44],
      popupAnchor: [0, -40],
    });
  }

  private buildMarkerTooltipMarkup(hospital: HospitalRecord): string {
    const locationLabel = hospital.landmark || hospital.area || hospital.address || 'Iloilo City';

    return `
      <div class="hospital-marker-tooltip__card">
        <span class="hospital-marker-tooltip__name">${this.escapeHtml(hospital.name)}</span>
        <span class="hospital-marker-tooltip__meta">${this.escapeHtml(locationLabel)}</span>
      </div>
    `;
  }

  private createDraftMarkerIcon(): Icon {
    const svgMarkup = `
      <svg width="42" height="54" viewBox="0 0 42 54" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="draftShadow" x="2" y="2" width="38" height="50" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="8" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.22"/>
          </filter>
        </defs>
        <g filter="url(#draftShadow)">
          <path d="M17 7V39" stroke="#334155" stroke-width="3" stroke-linecap="round"/>
          <path d="M18 8C23 4.5 28.5 10.5 33 7V19C28.5 22.5 23 16.5 18 20V8Z" fill="#ef4444" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round"/>
          <circle cx="17" cy="40" r="4.5" fill="#ffffff" stroke="#334155" stroke-width="2.2"/>
        </g>
      </svg>
    `;

    return this.leaflet!.icon({
      iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgMarkup)}`,
      iconSize: [42, 54],
      iconAnchor: [21, 44],
      popupAnchor: [0, -34],
    });
  }

  private buildPopupMarkup(hospital: HospitalRecord): string {
    const statusMeta = getHospitalStatusMeta(hospital.status);
    const locationLabel = hospital.landmark || hospital.area || hospital.address || 'Iloilo City';
    const roomTypeSummary = hospital.roomTypes.length > 0 ? hospital.roomTypes.join(', ') : 'Room types pending update';

    return `
      <section style="min-width: 248px; font-family: 'Manrope', sans-serif; color: #0f172a;">
        <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #64748b;">
          ${this.escapeHtml(locationLabel)}
        </p>
        <h3 style="margin: 0 0 8px; font-size: 16px; line-height: 1.4; font-weight: 800; color: #0f172a;">
          ${this.escapeHtml(hospital.name)}
        </h3>
        <p style="margin: 0 0 10px; font-size: 12px; font-weight: 700; color: #475569;">
          ${this.escapeHtml(hospital.category)}
        </p>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
          <span style="display: inline-flex; width: 10px; height: 10px; border-radius: 999px; background: ${statusMeta.accent};"></span>
          <span style="font-size: 13px; font-weight: 700; color: ${statusMeta.chipText};">${statusMeta.label}</span>
        </div>
        <p style="margin: 0 0 8px; font-size: 13px; line-height: 1.6; color: #475569;">
          ${hospital.availableRooms} of ${hospital.totalRooms} rooms available
        </p>
        <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #64748b;">
          ${this.escapeHtml(roomTypeSummary)}
        </p>
      </section>
    `;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private shouldInitializeInteractiveFeatures(): boolean {
    return typeof window !== 'undefined' && !window.navigator.userAgent.toLowerCase().includes('jsdom');
  }

  private getTileSource(): { url: string; attribution: string } {
    return {
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    };
  }

  private requestUserLocation(animate: boolean): void {
    if (!this.map || !('geolocation' in navigator)) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        } satisfies Coordinates;

        this.userLocation.set(location);

        if (animate) {
          this.focusLocation(location, 15.4);
        }
      },
      () => {
        // Ignore geolocation failures and keep the default Iloilo view.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 8_000,
      },
    );
  }
}