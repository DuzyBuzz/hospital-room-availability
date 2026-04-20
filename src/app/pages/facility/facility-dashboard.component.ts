import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { map } from 'rxjs';
import { AuthModalComponent } from '../../components/auth/auth-modal.component';
import { MapComponent } from '../../components/map/map.component';
import { HospitalDetailsComponent } from '../../components/sidebar/hospital-details.component';
import { HospitalListComponent } from '../../components/sidebar/hospital-list.component';
import { AuthService } from '../../core/services/auth.service';
import { HospitalService } from '../../core/services/hospital.service';
import { MapService } from '../../core/services/map.service';
import type { Coordinates, HospitalStatus } from '../../models/hospital.model';
import type { HospitalFormValue } from '../../shared/interfaces/hospital-form.interface';
import { FacilityFormComponent } from './facility-form.component';

@Component({
  selector: 'app-facility-dashboard',
  imports: [
    AuthModalComponent,
    DialogModule,
    FacilityFormComponent,
    HospitalDetailsComponent,
    HospitalListComponent,
    MapComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './facility-dashboard.component.html',
  host: {
    class: 'block min-h-screen',
  },
})
export class FacilityDashboardComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly authService = inject(AuthService);
  protected readonly hospitalService = inject(HospitalService);
  protected readonly mapService = inject(MapService);
  protected readonly mobileSheetExpanded = signal(false);

  private readonly mapComponent = viewChild(MapComponent);
  private readonly routeHospitalId = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('hospitalId'))),
    { initialValue: null },
  );
  private readonly handledRouteHospitalId = signal<string | null | undefined>(undefined);
  private readonly pendingEntryMode = signal<'create' | 'edit' | null>(null);

  protected readonly entryModalOpen = signal(false);
  protected readonly editingHospitalId = signal<string | null>(null);
  protected readonly editingHospital = computed(
    () => this.hospitalService.hospitals().find((hospital) => hospital.id === this.editingHospitalId()) ?? null,
  );
  protected readonly activeSelectionId = computed(
    () => this.editingHospitalId() ?? this.hospitalService.selectedHospitalId(),
  );
  protected readonly mapSelectedHospital = computed(
    () => this.editingHospital() ?? this.hospitalService.selectedHospital(),
  );
  protected readonly statusCounts = computed(() => ({
    available: this.hospitalService.statusCount('available'),
    fewBeds: this.hospitalService.statusCount('fewBeds'),
    full: this.hospitalService.statusCount('full'),
  }));
  protected readonly entryModalTitle = computed(() =>
    this.editingHospital() ? 'Edit hospital facility' : 'Add hospital facility',
  );

  constructor() {
    effect(
      () => {
        const routeHospitalId = this.routeHospitalId();

        if (routeHospitalId === this.handledRouteHospitalId()) {
          return;
        }

        if (!routeHospitalId) {
          this.handledRouteHospitalId.set(null);
          return;
        }

        const matchingHospital = this.hospitalService.hospitals().find(
          (hospital) => hospital.id === routeHospitalId,
        );

        if (!matchingHospital) {
          return;
        }

        this.handledRouteHospitalId.set(routeHospitalId);
        this.editingHospitalId.set(matchingHospital.id);
        this.hospitalService.selectHospital(matchingHospital.id);
        this.mobileSheetExpanded.set(true);

        if (this.authService.isAuthenticated()) {
          this.openEntryModalFor(matchingHospital.id);
          return;
        }

        this.pendingEntryMode.set('edit');
        this.mapService.clearDraftLocation();
        this.mapService.setMapNotice('Sign in to update this listing, or keep browsing the map.');
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        const pendingEntryMode = this.pendingEntryMode();

        if (!pendingEntryMode || !this.authService.isAuthenticated()) {
          return;
        }

        if (pendingEntryMode === 'create') {
          this.beginNewEntry();
        } else {
          const hospitalId = this.editingHospitalId() ?? this.hospitalService.selectedHospitalId();

          if (hospitalId) {
            this.openEntryModalFor(hospitalId);
          }
        }

        this.pendingEntryMode.set(null);
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        if (this.authService.isAuthenticated() || !this.entryModalOpen()) {
          return;
        }

        this.closeEntryModal();
      },
      { allowSignalWrites: true },
    );
  }

  protected updateSearchTerm(value: string): void {
    this.hospitalService.updateSearchTerm(value);
  }

  protected showAllHospitals(): void {
    this.hospitalService.resetFilters();
    this.mapComponent()?.focusInitialView();
  }

  protected showOnlyStatus(status: HospitalStatus): void {
    const activeStatuses = this.hospitalService.activeStatuses();
    const selectedCount = Object.values(activeStatuses).filter(Boolean).length;
    const isOnlyStatusActive = activeStatuses[status] && selectedCount === 1;

    this.hospitalService.setActiveStatuses(
      isOnlyStatusActive
        ? { available: true, fewBeds: true, full: true }
        : {
            available: status === 'available',
            fewBeds: status === 'fewBeds',
            full: status === 'full',
          },
    );
    this.mobileSheetExpanded.set(true);
  }

  protected openSignInModal(): void {
    this.authService.openModal('signIn');
  }

  protected startNewEntry(): void {
    if (!this.authService.isAuthenticated()) {
      this.pendingEntryMode.set('create');
      this.authService.openModal('signIn');
      return;
    }

    this.beginNewEntry();
  }

  protected openSelectedEntry(): void {
    const hospitalId = this.hospitalService.selectedHospitalId();

    if (!hospitalId) {
      return;
    }

    if (!this.authService.isAuthenticated()) {
      this.pendingEntryMode.set('edit');
      this.editingHospitalId.set(hospitalId);
      this.authService.openModal('signIn');
      return;
    }

    this.openEntryModalFor(hospitalId);
  }

  protected closeEntryModal(): void {
    this.entryModalOpen.set(false);
    this.editingHospitalId.set(null);
    this.hospitalService.clearFeedback();

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { hospitalId: null },
      queryParamsHandling: 'merge',
    });
  }

  protected selectForEditing(hospitalId: string): void {
    const selectedHospital = this.hospitalService.hospitals().find((hospital) => hospital.id === hospitalId);

    this.hospitalService.selectHospital(hospitalId);
    this.mobileSheetExpanded.set(true);

    if (!selectedHospital || this.entryModalOpen()) {
      return;
    }

    this.mapComponent()?.focusLocation(selectedHospital.location, 15.1);
  }

  protected pickLocation(location: Coordinates): void {
    this.mapService.setDraftLocation(location);
    this.mapComponent()?.focusLocation(location, 15.4);
  }

  protected clearLocation(): void {
    this.mapService.clearDraftLocation();
  }

  protected async saveHospital(formValue: HospitalFormValue): Promise<void> {
    const hospitalId = await this.hospitalService.saveHospital(formValue, this.editingHospital());

    if (!hospitalId) {
      return;
    }

    this.hospitalService.selectHospital(hospitalId);
    this.entryModalOpen.set(false);
    this.editingHospitalId.set(null);

    const savedHospital = this.hospitalService.hospitals().find((hospital) => hospital.id === hospitalId);

    if (savedHospital) {
      this.mapComponent()?.focusLocation(savedHospital.location, 15.2);
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { hospitalId: null },
      replaceUrl: true,
      queryParamsHandling: 'merge',
    });
  }

  private beginNewEntry(): void {
    this.entryModalOpen.set(true);
    this.editingHospitalId.set(null);
    this.hospitalService.clearFeedback();
    this.mapService.clearDraftLocation();
    this.mobileSheetExpanded.set(true);

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { hospitalId: null },
      queryParamsHandling: 'merge',
    });
  }

  private openEntryModalFor(hospitalId: string): void {
    const selectedHospital = this.hospitalService.hospitals().find((hospital) => hospital.id === hospitalId);

    if (!selectedHospital) {
      return;
    }

    this.entryModalOpen.set(true);
    this.editingHospitalId.set(hospitalId);
    this.hospitalService.selectHospital(hospitalId);
    this.hospitalService.clearFeedback();
    this.mapService.setDraftLocation(selectedHospital.location);
    this.mobileSheetExpanded.set(true);
    this.mapComponent()?.focusLocation(selectedHospital.location, 15.2);

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { hospitalId },
      queryParamsHandling: 'merge',
    });
  }

  protected locateUser(): void {
    this.mapComponent()?.locateUser();
  }

  protected toggleMobileSheet(): void {
    this.mobileSheetExpanded.update((value) => !value);
  }

  protected isSingleStatusSelected(status: HospitalStatus): boolean {
    const activeStatuses = this.hospitalService.activeStatuses();

    return activeStatuses[status] && Object.values(activeStatuses).filter(Boolean).length === 1;
  }

  protected handleEntryDialogVisibilityChange(visible: boolean): void {
    if (!visible && this.entryModalOpen()) {
      this.closeEntryModal();
    }
  }
}