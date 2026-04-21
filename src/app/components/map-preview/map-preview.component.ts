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
    const svgMarkup = `
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="previewMarkerShadow" x="0" y="0" width="30" height="30" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="3" stdDeviation="2.4" flood-color="#0f172a" flood-opacity="0.25"/>
          </filter>
        </defs>
        <g filter="url(#previewMarkerShadow)">
          <circle cx="15" cy="15" r="7" fill="#ef4444" stroke="#ffffff" stroke-width="3"/>
          <circle cx="15" cy="15" r="2.2" fill="#ffffff"/>
        </g>
      </svg>
    `;

    return this.leaflet!.icon({
      iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgMarkup)}`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -14],
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