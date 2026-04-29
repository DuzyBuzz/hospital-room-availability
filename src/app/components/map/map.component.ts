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
  Circle,
  CircleMarker,
  Icon,
  LatLngExpression,
  LeafletMouseEvent,
  Map as LeafletMap,
  Marker,
  Polyline,
  TileLayer,
} from 'leaflet';
import { FeedbackService } from '../../core/services/feedback.service';
import { MapService } from '../../core/services/map.service';
import type { Coordinates, HospitalRecord, HospitalStatus } from '../../models/hospital.model';
import { getHospitalStatusMeta, HOSPITAL_STATUS_OPTIONS } from '../../shared/utils/hospital-status.util';
import { loadLeaflet } from '../../shared/utils/leaflet-loader.util';

const LEAFLET_MARKER_ICON_URL = '/assets/leaflet/marker-icon.png';
const LEAFLET_MARKER_ICON_RETINA_URL = '/assets/leaflet/marker-icon-2x.png';
const LEAFLET_MARKER_SHADOW_URL = '/assets/leaflet/marker-shadow.png';

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
  private readonly feedbackService = inject(FeedbackService);
  protected readonly mapService = inject(MapService);

  private readonly mapCanvas = viewChild.required<ElementRef<HTMLDivElement>>('mapCanvas');
  private readonly markers = new Map<string, Marker>();
  private readonly mapInitialized = signal(false);
  private resizeObserver?: ResizeObserver;
  private readonly viewportCleanup: Array<() => void> = [];

  private leaflet?: typeof import('leaflet');
  private map?: LeafletMap;
  private tileLayer?: TileLayer;
  private draftMarker?: Marker;
  private userLocationAccuracyRing?: Circle;
  private userLocationMarker?: CircleMarker;
  private userLocationHalo?: CircleMarker;
  private routeLine?: Polyline;
  private geolocationWatchId: number | null = null;
  private userLocationAccuracyMeters: number | null = null;
  private hasCenteredOnUserLocation = false;
  private locateRequestPending = false;

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
  protected readonly hasUserLocation = computed(() => this.mapService.userLocation() !== null);
  protected readonly isFollowingUserLocation = signal(false);
  protected readonly liveLocationLabel = computed(() =>
    this.isFollowingUserLocation() ? 'Following your live location' : 'Live location on map',
  );
  protected readonly statusOptions = HOSPITAL_STATUS_OPTIONS;

  constructor() {
    afterNextRender(() => {
      void this.initializeMap();
    });

    effect(() => {
      this.mapInitialized();
      this.hospitals();
      this.selectedHospitalId();
      this.syncMarkers();
    });

    effect(() => {
      this.mapInitialized();
      this.allowLocationSelection();
      this.draftLocation();
      this.syncDraftMarker();
    });

    effect(() => {
      this.mapInitialized();
      this.mapService.userLocation();
      this.syncUserLocationMarker();
    });

    effect(() => {
      this.mapInitialized();
      this.mapService.activeRoute();
      this.syncRouteLine();
    });

    effect(() => {
      this.mapInitialized();
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
      this.mapInitialized();
      const selectedHospital = this.selectedHospital();
      const userLocation = this.mapService.userLocation();

      if (!this.map || !selectedHospital) {
        return;
      }

      const marker = this.markers.get(selectedHospital.id);

      if (!marker) {
        return;
      }

      this.refreshMarkerIcons();

      if (userLocation && this.leaflet && this.isFullDisplay()) {
        const selectionBounds = this.leaflet.latLngBounds([
          [selectedHospital.location.lat, selectedHospital.location.lng] as [number, number],
          [userLocation.lat, userLocation.lng] as [number, number],
        ]);

        this.map.flyToBounds(selectionBounds, {
          animate: true,
          duration: 0.8,
          maxZoom: 14.8,
          padding: [72, 72],
        });
      } else {
        this.map.flyTo([selectedHospital.location.lat, selectedHospital.location.lng] as LatLngExpression, 14.4, {
          animate: true,
          duration: 0.8,
        });
      }

      marker.openPopup();
    });

    effect(() => {
      const selectedHospital = this.selectedHospital();
      const userLocation = this.mapService.userLocation();

      if (!selectedHospital || !this.isFullDisplay() || !userLocation) {
        this.mapService.clearRoute();
        return;
      }

      void this.mapService.updateRouteToHospital(selectedHospital);
    });

    this.destroyRef.onDestroy(() => {
      this.resizeObserver?.disconnect();

      for (const cleanup of this.viewportCleanup) {
        cleanup();
      }

      if (this.geolocationWatchId !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(this.geolocationWatchId);
      }

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
    this.isFollowingUserLocation.set(true);
    this.hasCenteredOnUserLocation = false;
    this.locateRequestPending = true;
    this.startUserLocationTracking();

    const userLocation = this.mapService.userLocation();

    if (userLocation) {
      this.followUserLocation(userLocation, true);
      this.feedbackService.success('Live location ready', this.buildLocationReadyMessage(userLocation));
      this.mapService.setMapNotice('Live location locked. The map is following your position.');
      this.locateRequestPending = false;
    }
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

    try {
      this.leaflet = await loadLeaflet();

      const mapContainer = this.mapCanvas().nativeElement;

      this.map = this.leaflet.map(mapContainer, {
        center: [...this.mapService.initialCenter] as [number, number],
        zoom: this.mapService.initialZoom,
        zoomControl: false,
        attributionControl: this.displayMode() !== 'preview',
        preferCanvas: true,
      });

      const routePane = this.map.createPane('routePane');
      routePane.style.zIndex = '350';
      routePane.style.pointerEvents = 'none';

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

        const location = {
          lat: event.latlng.lat,
          lng: event.latlng.lng,
        } satisfies Coordinates;

        this.locationPicked.emit(location);
        this.mapService.setMapNotice('Location selected on the map. Save the form to keep this facility pin.');
        this.feedbackService.success('Leaflet pin selected', `Marker set to ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}.`);
      });

      this.registerResponsiveInvalidation();
      this.registerFollowModeInterruption();

      this.mapInitialized.set(true);

      this.scheduleMapInvalidation();

      this.startUserLocationTracking();
    } catch {
      this.mapService.setMapNotice('Leaflet could not load the interactive map. Refresh the page or check the network connection.');
      this.feedbackService.error(
        'Leaflet map failed',
        'The interactive map could not load. Refresh the page or check the network connection.',
        { life: 6000 },
      );
    }
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
      marker.setZIndexOffset(hospital.id === this.selectedHospitalId() ? 400 : 0);

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
      riseOnHover: true,
      riseOffset: 280,
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
          zIndexOffset: 500,
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

    const userLocation = this.mapService.userLocation();

    if (!userLocation) {
      this.userLocationAccuracyRing?.remove();
      this.userLocationHalo?.remove();
      this.userLocationMarker?.remove();
      return;
    }

    const showAccuracyRing =
      typeof this.userLocationAccuracyMeters === 'number' &&
      Number.isFinite(this.userLocationAccuracyMeters) &&
      this.userLocationAccuracyMeters <= 500;

    if (showAccuracyRing) {
      if (!this.userLocationAccuracyRing) {
        this.userLocationAccuracyRing = this.leaflet.circle(
          [userLocation.lat, userLocation.lng] as LatLngExpression,
          {
            radius: Math.max(this.userLocationAccuracyMeters ?? 0, 18),
            stroke: false,
            fillColor: '#60a5fa',
            fillOpacity: 0.1,
            interactive: false,
          },
        );
      }

      this.userLocationAccuracyRing.setLatLng([userLocation.lat, userLocation.lng] as LatLngExpression);
      this.userLocationAccuracyRing.setRadius(Math.max(this.userLocationAccuracyMeters ?? 0, 18));

      if (!this.map.hasLayer(this.userLocationAccuracyRing)) {
        this.userLocationAccuracyRing.addTo(this.map);
      }
    } else {
      this.userLocationAccuracyRing?.remove();
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
      }).bindTooltip(this.buildUserLocationTooltip(), {
        className: 'user-location-tooltip',
        direction: 'top',
        offset: [0, -10],
        opacity: 1,
        permanent: this.isFullDisplay(),
      });
    }

    this.userLocationHalo.setLatLng([userLocation.lat, userLocation.lng] as LatLngExpression);
    this.userLocationMarker.setLatLng([userLocation.lat, userLocation.lng] as LatLngExpression);
    this.userLocationMarker.setTooltipContent(this.buildUserLocationTooltip());

    if (!this.map.hasLayer(this.userLocationHalo)) {
      this.userLocationHalo.addTo(this.map);
    }

    if (!this.map.hasLayer(this.userLocationMarker)) {
      this.userLocationMarker.addTo(this.map);
    }

    this.userLocationHalo.bringToFront();
    this.userLocationMarker.bringToFront();
  }

  private syncRouteLine(): void {
    if (!this.map || !this.leaflet) {
      return;
    }

    const activeRoute = this.mapService.activeRoute();

    if (!activeRoute || activeRoute.geometry.length < 2) {
      this.routeLine?.remove();
      return;
    }

    const linePoints = activeRoute.geometry.map((point) => [point.lat, point.lng] as [number, number]);

    if (!this.routeLine) {
      this.routeLine = this.leaflet.polyline(linePoints, {
        color: '#1d4ed8',
        weight: 4,
        opacity: 0.9,
        pane: 'routePane',
        lineCap: 'round',
        lineJoin: 'round',
      });
    }

    this.routeLine.setLatLngs(linePoints);

    if (!this.map.hasLayer(this.routeLine)) {
      this.routeLine.addTo(this.map);
    }
  }

  private createMarkerIcon(_status: HospitalStatus, _isSelected: boolean): Icon {
    return this.leaflet!.icon({
      iconUrl: LEAFLET_MARKER_ICON_URL,
      iconRetinaUrl: LEAFLET_MARKER_ICON_RETINA_URL,
      shadowUrl: LEAFLET_MARKER_SHADOW_URL,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      tooltipAnchor: [16, -28],
      shadowSize: [41, 41],
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
    return this.leaflet!.icon({
      iconUrl: LEAFLET_MARKER_ICON_URL,
      iconRetinaUrl: LEAFLET_MARKER_ICON_RETINA_URL,
      shadowUrl: LEAFLET_MARKER_SHADOW_URL,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      tooltipAnchor: [16, -28],
      shadowSize: [41, 41],
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

  private buildUserLocationTooltip(): string {
    if (
      typeof this.userLocationAccuracyMeters === 'number' &&
      Number.isFinite(this.userLocationAccuracyMeters) &&
      this.userLocationAccuracyMeters <= 500
    ) {
      return `Your live location • ±${Math.round(this.userLocationAccuracyMeters)} m`;
    }

    return 'Your live location';
  }

  private startUserLocationTracking(): void {
    if (!this.map || !('geolocation' in navigator)) {
      return;
    }

    const options = {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 12_000,
    } satisfies PositionOptions;

    if (this.geolocationWatchId === null) {
      this.geolocationWatchId = navigator.geolocation.watchPosition(
        (position) => {
          this.handleUserLocationUpdate(position);
        },
        () => {
          this.handleGeolocationError();

          if (!this.mapService.userLocation()) {
            if (this.geolocationWatchId !== null) {
              navigator.geolocation.clearWatch(this.geolocationWatchId);
              this.geolocationWatchId = null;
            }

            this.isFollowingUserLocation.set(false);
          }
        },
        options,
      );
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.handleUserLocationUpdate(position);
      },
      () => {
        this.handleGeolocationError();
      },
      options,
    );
  }

  private handleUserLocationUpdate(position: GeolocationPosition): void {
    const hadUserLocation = this.mapService.userLocation() !== null;
    const location = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    } satisfies Coordinates;

    this.userLocationAccuracyMeters = position.coords.accuracy;
    this.mapService.setUserLocation(location);

    if (this.locateRequestPending) {
      this.feedbackService.success('Live location ready', this.buildLocationReadyMessage(location));
      this.mapService.setMapNotice('Live location locked. The map is following your position.');
      this.locateRequestPending = false;
    }

    if (!hadUserLocation && this.isFullDisplay()) {
      this.isFollowingUserLocation.set(true);
      this.hasCenteredOnUserLocation = false;
      this.followUserLocation(location, true);
      return;
    }

    if (this.isFollowingUserLocation()) {
      this.followUserLocation(location);
    }
  }

  private followUserLocation(location: Coordinates, forceZoom = false): void {
    if (!this.map) {
      return;
    }

    const nextCenter = [location.lat, location.lng] as LatLngExpression;

    if (!this.hasCenteredOnUserLocation || forceZoom || this.map.getZoom() < 15.6) {
      this.hasCenteredOnUserLocation = true;
      this.map.flyTo(nextCenter, Math.max(this.map.getZoom(), 15.8), {
        animate: true,
        duration: 0.7,
      });
      return;
    }

    this.map.panTo(nextCenter, {
      animate: true,
      duration: 0.55,
    });
  }

  private registerFollowModeInterruption(): void {
    if (!this.map || typeof window === 'undefined') {
      return;
    }

    const mapCanvas = this.mapCanvas().nativeElement;
    const stopFollowing = () => {
      if (!this.isFollowingUserLocation()) {
        return;
      }

      this.isFollowingUserLocation.set(false);
      this.hasCenteredOnUserLocation = false;
    };

    const registerInteraction = (eventName: 'pointerdown' | 'wheel' | 'mousedown' | 'touchstart') => {
      const handler = () => {
        stopFollowing();
      };

      mapCanvas.addEventListener(eventName, handler, { passive: true });
      this.viewportCleanup.push(() => {
        mapCanvas.removeEventListener(eventName, handler);
      });
    };

    registerInteraction('pointerdown');
    registerInteraction('wheel');

    if (typeof PointerEvent === 'undefined') {
      registerInteraction('mousedown');
      registerInteraction('touchstart');
    }
  }

  private registerResponsiveInvalidation(): void {
    if (!this.map || typeof window === 'undefined') {
      return;
    }

    const invalidateMap = () => {
      this.scheduleMapInvalidation();
    };
    const mapCanvas = this.mapCanvas().nativeElement;

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver?.disconnect();
      this.resizeObserver = new ResizeObserver(() => {
        invalidateMap();
      });
      this.resizeObserver.observe(mapCanvas);
    }

    const registerListener = (
      target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
      eventName: 'resize' | 'orientationchange' | 'scroll',
    ) => {
      const handler = () => {
        invalidateMap();
      };

      target.addEventListener(eventName, handler, { passive: true });
      this.viewportCleanup.push(() => {
        target.removeEventListener(eventName, handler);
      });
    };

    registerListener(window, 'resize');
    registerListener(window, 'orientationchange');

    if (window.visualViewport) {
      registerListener(window.visualViewport, 'resize');
      registerListener(window.visualViewport, 'scroll');
    }
  }

  private scheduleMapInvalidation(): void {
    if (!this.map || typeof window === 'undefined') {
      return;
    }

    const invalidate = () => {
      if (!this.map) {
        return;
      }

      this.map.invalidateSize({
        pan: false,
        debounceMoveend: true,
      });
    };

    queueMicrotask(invalidate);
    window.requestAnimationFrame(() => {
      invalidate();
    });
    window.setTimeout(() => {
      invalidate();
    }, 180);
  }

  private handleGeolocationError(): void {
    if (!this.locateRequestPending) {
      return;
    }

    this.locateRequestPending = false;
    this.isFollowingUserLocation.set(false);
    this.mapService.setMapNotice('Live location is unavailable. Allow browser location access and try again.');
    this.feedbackService.error(
      'Location unavailable',
      'Allow browser location access to center the Leaflet map on your live position.',
    );
  }

  private buildLocationReadyMessage(location: Coordinates): string {
    return `Leaflet centered the map on ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}.`;
  }
}