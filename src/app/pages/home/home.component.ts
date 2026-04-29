import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { HospitalService } from '../../core/services/hospital.service';
import { MapService } from '../../core/services/map.service';
import { RoomService } from '../../core/services/room.service';
import { MapComponent } from '../../components/map/map.component';
import { AuthService } from '../../core/services/auth.service';
import { HospitalDetailsComponent } from '../../components/sidebar/hospital-details.component';
import { HospitalListComponent } from '../../components/sidebar/hospital-list.component';
import type { HospitalStatus } from '../../models/hospital.model';
import type { RoomStatus } from '../../models/room.model';

@Component({
  selector: 'app-home',
  imports: [
    ButtonModule,
    DialogModule,
    HospitalDetailsComponent,
    HospitalListComponent,
    MapComponent,
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  host: {
    class: 'block min-h-screen',
  },
})
export class HomeComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);

  protected readonly authService = inject(AuthService);
  protected readonly hospitalService = inject(HospitalService);
  protected readonly mapService = inject(MapService);
  protected readonly roomService = inject(RoomService);
  protected readonly mobileSidebarOpen = signal(false);
  protected readonly detailsDialogOpen = signal(false);
  protected readonly userMenuOpen = signal(false);
  protected readonly profileDialogOpen = signal(false);
  protected readonly profileValidated = signal(false);

  protected readonly selectedHospitalRooms = computed(() => {
    const selectedHospital = this.hospitalService.selectedHospital();
    if (!selectedHospital) {
      return [];
    }

    return this.roomService.roomsByFacility().get(selectedHospital.id) ?? [];
  });

  private readonly mapComponent = viewChild(MapComponent);

  protected readonly profileForm = this.formBuilder.group({
    currentPassword: ['', [Validators.required, Validators.minLength(6)]],
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    newPassword: [''],
    confirmPassword: [''],
  });

  protected updateSearchTerm(value: string): void {
    this.hospitalService.updateSearchTerm(value);
    this.mobileSidebarOpen.set(true);
  }

  protected handleSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.updateSearchTerm(target?.value ?? '');
  }

  protected selectRoomType(value: string): void {
    this.hospitalService.setRoomType(value);
    this.mobileSidebarOpen.set(true);
  }

  protected selectArea(value: string): void {
    this.hospitalService.setArea(value);
    this.mobileSidebarOpen.set(true);
  }

  protected showAllHospitals(): void {
    this.hospitalService.resetFilters();
    this.mapComponent()?.focusInitialView();
    this.mobileSidebarOpen.set(true);
  }

  protected toggleStatus(status: HospitalStatus): void {
    const activeStatuses = this.hospitalService.activeStatuses();
    const activeCount = Object.values(activeStatuses).filter(Boolean).length;

    if (activeStatuses[status] && activeCount === 1) {
      this.hospitalService.setActiveStatuses({
        available: true,
        fewBeds: true,
        full: true,
      });
      this.mobileSidebarOpen.set(true);
      return;
    }

    this.hospitalService.toggleStatus(status);
    this.mobileSidebarOpen.set(true);
  }

  protected isStatusActive(status: HospitalStatus): boolean {
    return this.hospitalService.activeStatuses()[status];
  }

  protected selectHospital(hospitalId: string): void {
    this.hospitalService.selectHospital(hospitalId);
    this.mobileSidebarOpen.set(false);
  }

  protected selectHospitalFromMap(hospitalId: string): void {
    this.hospitalService.selectHospital(hospitalId);
    this.mobileSidebarOpen.set(false);
    this.openDetailsDialog();
  }

  protected openDetailsDialog(): void {
    if (!this.hospitalService.selectedHospital()) {
      return;
    }

    this.detailsDialogOpen.set(true);
  }

  protected closeDetailsDialog(): void {
    this.detailsDialogOpen.set(false);
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

  protected locateUser(): void {
    this.mapComponent()?.locateUser();
  }

  protected toggleMobileSidebar(): void {
    this.mobileSidebarOpen.update((value) => !value);
  }

  protected closeMobileSidebar(): void {
    this.mobileSidebarOpen.set(false);
  }

  protected hasRoomTypeFilter(): boolean {
    return this.hospitalService.selectedRoomType() !== 'all';
  }

  protected hasAreaFilter(): boolean {
    return this.hospitalService.selectedArea() !== 'all';
  }

  protected isRoomTypeSelected(value: string): boolean {
    return this.hospitalService.selectedRoomType() === value;
  }

  protected isAreaSelected(value: string): boolean {
    return this.hospitalService.selectedArea() === value;
  }

  protected roomStatusClass(status: RoomStatus): string {
    if (status === 'available') {
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    }

    if (status === 'occupied') {
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    }

    return 'bg-amber-50 text-amber-700 ring-amber-200';
  }
}