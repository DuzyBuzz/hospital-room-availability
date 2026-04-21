import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { Icon, LatLngExpression, LeafletMouseEvent, Map as LeafletMap, Marker } from 'leaflet';
import { MapService } from '../../core/services/map.service';
import type { Coordinates } from '../../models/hospital.model';
import { loadLeaflet } from '../../shared/utils/leaflet-loader.util';

@Component({
  selector: 'app-map-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './map-preview.component.html',
  host: {
    class: 'relative block h-full w-full overflow-hidden rounded-3xl',
  },
})
export class MapPreviewComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly mapService = inject(MapService);

  private readonly previewCanvas = viewChild.required<ElementRef<HTMLDivElement>>('previewCanvas');
  private readonly mapInitialized = signal(false);
  private resizeObserver?: ResizeObserver;
  private readonly viewportCleanup: Array<() => void> = [];

  private leaflet?: typeof import('leaflet');
  private map?: LeafletMap;
  private marker?: Marker;

  readonly location = input<Coordinates | null>(null);
  readonly locationPicked = output<Coordinates>();

  constructor() {
    afterNextRender(() => {
      void this.initializeMap();
    });

    effect(() => {
      this.mapInitialized();
      this.location();
      this.syncMarker();
    });

    this.destroyRef.onDestroy(() => {
      this.resizeObserver?.disconnect();

      for (const cleanup of this.viewportCleanup) {
        cleanup();
      }

      this.map?.remove();
    });
  }

  private async initializeMap(): Promise<void> {
    if (typeof window === 'undefined' || window.navigator.userAgent.toLowerCase().includes('jsdom')) {
      return;
    }

    this.leaflet = await loadLeaflet();

    this.map = this.leaflet.map(this.previewCanvas().nativeElement, {
      center: [...this.mapService.initialCenter] as [number, number],
      zoom: 13.7,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      preferCanvas: true,
    });

    this.leaflet.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    }).addTo(this.map);

    this.map.on('click', (event: LeafletMouseEvent) => {
      this.locationPicked.emit({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    });

    this.registerResponsiveInvalidation();
    this.mapInitialized.set(true);

    this.syncMarker();
    this.scheduleMapInvalidation();
  }

  private syncMarker(): void {
    if (!this.map || !this.leaflet) {
      return;
    }

    const location = this.location();

    if (!location) {
      this.marker?.remove();
      return;
    }

    if (!this.marker) {
      this.marker = this.leaflet.marker([location.lat, location.lng] as LatLngExpression, {
        icon: this.createMarkerIcon(),
      });
    }

    this.marker.setLatLng([location.lat, location.lng] as LatLngExpression);

    if (!this.map.hasLayer(this.marker)) {
      this.marker.addTo(this.map);
    }

    this.map.flyTo([location.lat, location.lng] as LatLngExpression, 15.1, {
      animate: true,
      duration: 0.5,
    });
  }

  private createMarkerIcon(): Icon {
    return this.leaflet!.icon({
      iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString(),
      iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString(),
      shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      tooltipAnchor: [16, -28],
      shadowSize: [41, 41],
    });
  }

  private registerResponsiveInvalidation(): void {
    if (!this.map || typeof window === 'undefined') {
      return;
    }

    const invalidateMap = () => {
      this.scheduleMapInvalidation();
    };
    const previewCanvas = this.previewCanvas().nativeElement;

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver?.disconnect();
      this.resizeObserver = new ResizeObserver(() => {
        invalidateMap();
      });
      this.resizeObserver.observe(previewCanvas);
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
}