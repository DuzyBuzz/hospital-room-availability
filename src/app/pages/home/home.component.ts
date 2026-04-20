import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HospitalService } from '../../core/services/hospital.service';
import { MapService } from '../../core/services/map.service';
import { MapComponent } from '../../components/map/map.component';
import { HospitalDetailsComponent } from '../../components/sidebar/hospital-details.component';
import { HospitalListComponent } from '../../components/sidebar/hospital-list.component';
import type { HospitalStatus } from '../../models/hospital.model';

@Component({
  selector: 'app-home',
  imports: [
    HospitalDetailsComponent,
    HospitalListComponent,
    MapComponent,
    NgTemplateOutlet,
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
  protected readonly hospitalService = inject(HospitalService);
  protected readonly mapService = inject(MapService);
  protected readonly mobileSidebarOpen = signal(false);

  private readonly mapComponent = viewChild(MapComponent);

  protected updateSearchTerm(value: string): void {
    this.hospitalService.updateSearchTerm(value);
    this.mobileSidebarOpen.set(true);
  }

  protected handleSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.updateSearchTerm(target?.value ?? '');
  }

  protected updateRoomType(value: string): void {
    this.hospitalService.setRoomType(value);
    this.mobileSidebarOpen.set(true);
  }

  protected handleRoomTypeChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.updateRoomType(target?.value ?? 'all');
  }

  protected updateArea(value: string): void {
    this.hospitalService.setArea(value);
    this.mobileSidebarOpen.set(true);
  }

  protected handleAreaChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.updateArea(target?.value ?? 'all');
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
    this.mobileSidebarOpen.set(true);
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
}