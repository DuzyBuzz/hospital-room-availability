import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MapPreviewComponent } from '../../components/map-preview/map-preview.component';
import type { Coordinates, HospitalRecord, HospitalStatus } from '../../models/hospital.model';
import type { HospitalFormValue } from '../../shared/interfaces/hospital-form.interface';
import type { HospitalStatusOption } from '../../shared/utils/hospital-status.util';

const MEDICAL_CATEGORY_OPTIONS = [
  'General Hospital',
  'Clinic',
  'Medical Center',
  'Specialty Hospital',
  'Emergency Center',
  'Diagnostic Center',
  'Rural Health Unit',
  'Birthing Center',
  'Dialysis Center',
  'Infirmary',
] as const;

@Component({
  selector: 'app-facility-form',
  imports: [MapPreviewComponent, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './facility-form.component.html',
  host: {
    class: 'block',
  },
})
export class FacilityFormComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);

  private readonly lastPatchedHospitalId = signal<string | null | undefined>(undefined);

  readonly hospital = input<HospitalRecord | null>(null);
  readonly draftLocation = input<Coordinates | null>(null);
  readonly roomTypeOptions = input<string[]>([]);
  readonly saving = input(false);
  readonly statusOptions = input<readonly HospitalStatusOption[]>([]);

  readonly cancel = output<void>();
  readonly saveHospital = output<HospitalFormValue>();
  readonly clearLocation = output<void>();
  readonly locationPicked = output<Coordinates>();

  protected readonly categoryOptions = computed(() => {
    const currentCategory = this.hospital()?.category?.trim() ?? '';

    if (currentCategory.length === 0 || MEDICAL_CATEGORY_OPTIONS.includes(currentCategory as (typeof MEDICAL_CATEGORY_OPTIONS)[number])) {
      return [...MEDICAL_CATEGORY_OPTIONS];
    }

    return [currentCategory, ...MEDICAL_CATEGORY_OPTIONS];
  });
  protected readonly mapPickerOpen = signal(false);
  protected readonly submitted = signal(false);
  protected readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    category: ['General Hospital', [Validators.required]],
    description: ['', [Validators.required, Validators.minLength(12)]],
    landmark: [''],
    address: ['', [Validators.required, Validators.minLength(6)]],
    area: ['Iloilo City', [Validators.required, Validators.minLength(2)]],
    contactNumber: ['', [Validators.required, Validators.minLength(7)]],
    website: [''],
    totalRooms: [12, [Validators.required, Validators.min(1)]],
    availableRooms: [6, [Validators.required, Validators.min(0)]],
    roomTypes: [['Private Room'] as string[]],
    customRoomTypes: [''],
    status: ['available' as HospitalStatus, [Validators.required]],
  });
  protected readonly locationLabel = computed(() => {
    const draftLocation = this.draftLocation();

    return draftLocation
      ? `${draftLocation.lat.toFixed(5)}, ${draftLocation.lng.toFixed(5)}`
      : this.mapPickerOpen()
        ? 'Tap the preview map to place the marker.'
        : 'Use the preview map to place the marker for this medical facility.';
  });

  constructor() {
    effect(
      () => {
        const hospital = this.hospital();
        const nextHospitalId = hospital?.id ?? null;

        if (nextHospitalId === this.lastPatchedHospitalId()) {
          return;
        }

        if (hospital) {
          this.form.reset({
            name: hospital.name,
            category: hospital.category || 'General Hospital',
            description: hospital.description,
            landmark: hospital.landmark,
            address: hospital.address,
            area: hospital.area || 'Iloilo City',
            contactNumber: hospital.contactNumber,
            website: hospital.website,
            totalRooms: hospital.totalRooms,
            availableRooms: hospital.availableRooms,
            roomTypes: [...hospital.roomTypes],
            customRoomTypes: '',
            status: hospital.status,
          });
        } else {
          this.form.reset({
            name: '',
            category: 'General Hospital',
            description: '',
            landmark: '',
            address: '',
            area: 'Iloilo City',
            contactNumber: '',
            website: '',
            totalRooms: 12,
            availableRooms: 6,
            roomTypes: ['Private Room'],
            customRoomTypes: '',
            status: 'available',
          });
        }

        this.submitted.set(false);
        this.mapPickerOpen.set(false);
        this.lastPatchedHospitalId.set(nextHospitalId);
      },
    );
  }

  protected shouldShowError(control: { invalid: boolean; touched: boolean; dirty: boolean }): boolean {
    return control.invalid && (control.touched || control.dirty || this.submitted());
  }

  protected toggleRoomType(roomType: string): void {
    const currentRoomTypes = this.form.controls.roomTypes.value;
    const nextRoomTypes = currentRoomTypes.includes(roomType)
      ? currentRoomTypes.filter((selectedType) => selectedType !== roomType)
      : [...currentRoomTypes, roomType];

    this.form.controls.roomTypes.setValue(nextRoomTypes);
  }

  protected isRoomTypeSelected(roomType: string): boolean {
    return this.form.controls.roomTypes.value.includes(roomType);
  }

  protected selectStatus(status: HospitalStatus): void {
    this.form.controls.status.setValue(status);
  }

  protected enableMapPicker(): void {
    this.mapPickerOpen.set(true);
  }

  protected handleLocationPicked(location: Coordinates): void {
    this.mapPickerOpen.set(true);
    this.locationPicked.emit(location);
  }

  protected submitForm(): void {
    this.submitted.set(true);

    if (this.form.invalid || !this.draftLocation()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saveHospital.emit({
      ...this.form.getRawValue(),
      location: this.draftLocation(),
    });
  }
}