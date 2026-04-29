import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
import type { Coordinates, HospitalRecord, HospitalStatus } from '../../models/hospital.model';
import type { FacilityFormValue } from '../../shared/interfaces/hospital-form.interface';
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
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './facility-dashboard.component.html',
  host: {
    class: 'block min-h-screen',
  },
})
export class FacilityDashboardComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly authService = inject(AuthService);
  protected readonly hospitalService = inject(HospitalService);
  protected readonly mapService = inject(MapService);
  protected readonly mobileSheetExpanded = signal(false);
  protected readonly userMenuOpen = signal(false);
  protected readonly profileDialogOpen = signal(false);
  protected readonly profileValidated = signal(false);

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
  protected readonly selectedHospital = computed(() => this.hospitalService.selectedHospital());
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
    this.editingHospital() ? 'Edit medical facility' : 'Add medical facility',
  );
  protected readonly canRequestSelectedEntry = computed(() => this.canRequestEdit(this.selectedHospital()));
  protected readonly canDeleteSelectedFacility = computed(() =>
    this.hospitalService.canCurrentUserManage(this.selectedHospital()),
  );
  protected readonly canDeleteEditingFacility = computed(() =>
    this.hospitalService.canCurrentUserManage(this.editingHospital()),
  );
  protected readonly selectedOwnershipMessage = computed(() =>
    this.managementRestrictionMessage(this.selectedHospital()),
  );

  protected readonly profileForm = this.formBuilder.group({
    currentPassword: ['', [Validators.required, Validators.minLength(6)]],
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    newPassword: [''],
    confirmPassword: [''],
  });

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
        this.hospitalService.selectHospital(matchingHospital.id);
        this.mobileSheetExpanded.set(true);
        this.requestEditForHospital(matchingHospital.id);
      },
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
            this.requestEditForHospital(hospitalId);
          }
        }

        this.pendingEntryMode.set(null);
      },
    );

    effect(
      () => {
        if (this.authService.isAuthenticated() || !this.entryModalOpen()) {
          return;
        }

        this.closeEntryModal();
      },
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

  protected toggleUserMenu(): void {
    this.userMenuOpen.update((state) => !state);
  }

  protected openProfileDialog(): void {
    const user = this.authService.user();

    if (!user) {
      this.authService.openModal('signIn');
      return;
    }

    this.userMenuOpen.set(false);
    this.profileValidated.set(false);
    this.profileForm.reset({
      currentPassword: '',
      displayName: user.displayName,
      email: user.email,
      newPassword: '',
      confirmPassword: '',
    });
    this.profileDialogOpen.set(true);
  }

  protected closeProfileDialog(): void {
    if (this.authService.busy()) {
      return;
    }

    this.profileDialogOpen.set(false);
    this.profileValidated.set(false);
  }

  protected async validateProfileAccess(): Promise<void> {
    this.profileForm.controls.currentPassword.markAsTouched();

    if (this.profileForm.controls.currentPassword.invalid) {
      return;
    }

    const valid = await this.authService.validateCurrentPassword(this.profileForm.controls.currentPassword.value);
    this.profileValidated.set(valid);
  }

  protected async submitProfileUpdate(): Promise<void> {
    this.profileForm.markAllAsTouched();

    if (!this.profileValidated()) {
      return;
    }

    if (this.profileForm.controls.displayName.invalid || this.profileForm.controls.email.invalid) {
      return;
    }

    const newPassword = this.profileForm.controls.newPassword.value.trim();
    const confirmPassword = this.profileForm.controls.confirmPassword.value.trim();

    if (newPassword.length > 0 && newPassword !== confirmPassword) {
      this.authService.errorMessage.set('Password confirmation does not match.');
      return;
    }

    const updated = await this.authService.updateProfileCredentials({
      currentPassword: this.profileForm.controls.currentPassword.value,
      displayName: this.profileForm.controls.displayName.value,
      email: this.profileForm.controls.email.value,
      newPassword,
    });

    if (updated) {
      this.closeProfileDialog();
    }
  }

  protected async signOutFromMenu(): Promise<void> {
    this.userMenuOpen.set(false);
    await this.authService.signOut();
  }

  protected startNewEntry(): void {
    if (!this.authService.isAuthenticated()) {
      this.pendingEntryMode.set('create');
      this.authService.openModal('signUp');
      return;
    }

    this.beginNewEntry();
  }

  protected openSelectedEntry(): void {
    const hospitalId = this.hospitalService.selectedHospitalId();

    if (!hospitalId) {
      return;
    }

    this.requestEditForHospital(hospitalId);
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

  protected async saveHospital(formValue: FacilityFormValue): Promise<void> {
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

  protected async deleteSelectedFacility(): Promise<void> {
    await this.deleteFacility(this.selectedHospital());
  }

  protected async deleteEditingFacility(): Promise<void> {
    await this.deleteFacility(this.editingHospital());
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

  private requestEditForHospital(hospitalId: string): void {
    const targetHospital = this.hospitalService.hospitals().find((hospital) => hospital.id === hospitalId);

    if (!targetHospital) {
      return;
    }

    this.hospitalService.selectHospital(hospitalId);
    this.mobileSheetExpanded.set(true);

    if (!this.hospitalService.canRequestManagement(targetHospital)) {
      this.editingHospitalId.set(null);
      this.mapService.clearDraftLocation();
      this.mapService.setMapNotice(this.managementRestrictionMessage(targetHospital) ?? 'This facility is locked for editing.');
      return;
    }

    if (!this.authService.isAuthenticated()) {
      this.pendingEntryMode.set('edit');
      this.editingHospitalId.set(hospitalId);
      this.authService.openModal('signIn');
      return;
    }

    if (!this.hospitalService.canCurrentUserManage(targetHospital)) {
      this.editingHospitalId.set(null);
      this.mapService.clearDraftLocation();
      this.mapService.setMapNotice(this.managementRestrictionMessage(targetHospital) ?? 'Only the creator can manage this facility.');
      return;
    }

    this.openEntryModalFor(hospitalId);
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

  private canRequestEdit(hospital: HospitalRecord | null): boolean {
    if (!hospital || !this.hospitalService.canRequestManagement(hospital)) {
      return false;
    }

    return !this.authService.isAuthenticated() || this.hospitalService.canCurrentUserManage(hospital);
  }

  private managementRestrictionMessage(hospital: HospitalRecord | null): string | null {
    if (!hospital) {
      return null;
    }

    if (hospital.collectionPath !== 'facilities') {
      return 'Only community-submitted facilities can be edited or deleted here.';
    }

    if (!hospital.ownerUserId) {
      return 'This facility has no recorded owner, so editing and deletion are locked.';
    }

    if (!this.authService.isAuthenticated()) {
      return 'Sign in with the account that created this facility to edit or delete it.';
    }

    if (!this.hospitalService.canCurrentUserManage(hospital)) {
      return 'Only the user who created this facility can edit or delete it.';
    }

    return null;
  }

  private async deleteFacility(hospital: HospitalRecord | null): Promise<void> {
    if (!hospital || !this.hospitalService.canCurrentUserManage(hospital)) {
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        `Delete ${hospital.name}? This removes it from the public directory.`,
      );

      if (!confirmed) {
        return;
      }
    }

    const deleted = await this.hospitalService.deleteHospital(hospital);

    if (!deleted) {
      return;
    }

    this.entryModalOpen.set(false);
    this.editingHospitalId.set(null);
    this.mapService.clearDraftLocation();
    this.mapComponent()?.focusInitialView();

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { hospitalId: null },
      replaceUrl: true,
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