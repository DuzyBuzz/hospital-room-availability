import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MapPreviewComponent } from '../../components/map-preview/map-preview.component';
import type { Coordinates, FacilityType, HospitalRecord } from '../../models/hospital.model';
import type { Room } from '../../models/room.model';
import type { RoomDraft, RoomStatus } from '../../models/room.model';
import type { FacilityFormValue } from '../../shared/interfaces/hospital-form.interface';
import { RoomTypeService } from '../../core/services/room-type.service';
import { RoomService } from '../../core/services/room.service';

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

const FACILITY_TYPE_OPTIONS: { value: FacilityType; label: string }[] = [
  { value: 'hospital', label: 'Hospital' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'facility', label: 'Facility' },
];

const ROOM_STATUS_OPTIONS: { value: RoomStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'maintenance', label: 'Maintenance' },
];

interface RoomFormEntry {
  roomTypeId: string;
  roomNumber: string;
  status: RoomStatus;
  remarks: string;
  /** true while the row is being edited inline */
  editing: boolean;
}

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

  protected readonly roomTypeService = inject(RoomTypeService);
  protected readonly roomService = inject(RoomService);

  private readonly lastPatchedHospitalId = signal<string | null | undefined>(undefined);

  readonly hospital = input<HospitalRecord | null>(null);
  readonly canDelete = input(false);
  readonly draftLocation = input<Coordinates | null>(null);
  readonly saving = input(false);

  readonly cancel = output<void>();
  readonly deleteRequested = output<void>();
  readonly saveHospital = output<FacilityFormValue>();
  readonly clearLocation = output<void>();
  readonly locationPicked = output<Coordinates>();

  protected readonly facilityTypeOptions = FACILITY_TYPE_OPTIONS;
  protected readonly roomStatusOptions = ROOM_STATUS_OPTIONS;

  protected readonly categoryOptions = computed(() => {
    const currentCategory = this.hospital()?.category?.trim() ?? '';
    if (
      currentCategory.length === 0 ||
      MEDICAL_CATEGORY_OPTIONS.includes(currentCategory as (typeof MEDICAL_CATEGORY_OPTIONS)[number])
    ) {
      return [...MEDICAL_CATEGORY_OPTIONS];
    }
    return [currentCategory, ...MEDICAL_CATEGORY_OPTIONS];
  });

  protected readonly mapPickerOpen = signal(false);
  protected readonly submitted = signal(false);

  /** Inline room entries managed outside the main form group */
  protected readonly roomEntries = signal<RoomFormEntry[]>([]);

  /** Inline new-room row */
  protected readonly newRoom = signal<Omit<RoomFormEntry, 'editing'>>({
    roomTypeId: '',
    roomNumber: '',
    status: 'available',
    remarks: '',
  });
  protected readonly addingRoom = signal(false);

  protected readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    type: ['hospital' as FacilityType, [Validators.required]],
    category: ['General Hospital', [Validators.required]],
    description: ['', [Validators.required, Validators.minLength(12)]],
    landmark: [''],
    address: ['', [Validators.required, Validators.minLength(6)]],
    area: ['Iloilo City', [Validators.required, Validators.minLength(2)]],
    contactNumber: ['', [Validators.required, Validators.minLength(7)]],
    website: [''],
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
    effect(() => {
      const hospital = this.hospital();
      const nextHospitalId = hospital?.id ?? null;

      if (nextHospitalId === this.lastPatchedHospitalId()) {
        return;
      }

      if (hospital) {
        this.form.reset({
          name: hospital.name,
          type: hospital.type,
          category: hospital.category || 'General Hospital',
          description: hospital.description,
          landmark: hospital.landmark,
          address: hospital.address,
          area: hospital.area || 'Iloilo City',
          contactNumber: hospital.contactNumber,
          website: hospital.website,
        });

        // Load existing rooms from the room service
        const existingRooms: Room[] = this.roomService.getRoomsForFacility(hospital.id);
        this.roomEntries.set(
          existingRooms.map((r) => ({
            roomTypeId: r.roomTypeId,
            roomNumber: r.roomNumber,
            status: r.status,
            remarks: r.remarks,
            editing: false,
          })),
        );
      } else {
        this.form.reset({
          name: '',
          type: 'hospital',
          category: 'General Hospital',
          description: '',
          landmark: '',
          address: '',
          area: 'Iloilo City',
          contactNumber: '',
          website: '',
        });
        this.roomEntries.set([]);
      }

      this.submitted.set(false);
      this.mapPickerOpen.set(false);
      this.addingRoom.set(false);
      this.lastPatchedHospitalId.set(nextHospitalId);
    });
  }

  protected shouldShowError(control: { invalid: boolean; touched: boolean; dirty: boolean }): boolean {
    return control.invalid && (control.touched || control.dirty || this.submitted());
  }

  protected enableMapPicker(): void {
    this.mapPickerOpen.set(true);
  }

  protected handleLocationPicked(location: Coordinates): void {
    this.mapPickerOpen.set(true);
    this.locationPicked.emit(location);
  }

  // ─── Room management ───────────────────────────────────────────────────────

  protected startAddRoom(): void {
    this.newRoom.set({ roomTypeId: this.roomTypeService.roomTypes()[0]?.id ?? '', roomNumber: '', status: 'available', remarks: '' });
    this.addingRoom.set(true);
  }

  protected cancelAddRoom(): void {
    this.addingRoom.set(false);
  }

  protected confirmAddRoom(): void {
    const nr = this.newRoom();
    if (!nr.roomTypeId || !nr.roomNumber.trim()) return;
    this.roomEntries.update((entries) => [
      ...entries,
      { ...nr, roomNumber: nr.roomNumber.trim(), editing: false },
    ]);
    this.addingRoom.set(false);
  }

  protected patchNewRoom(patch: Partial<Omit<RoomFormEntry, 'editing'>>): void {
    this.newRoom.update((cur) => ({ ...cur, ...patch }));
  }

  protected removeRoom(index: number): void {
    this.roomEntries.update((entries) => entries.filter((_, i) => i !== index));
  }

  protected patchRoom(index: number, patch: Partial<Omit<RoomFormEntry, 'editing'>>): void {
    this.roomEntries.update((entries) =>
      entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  }

  protected setRoomStatus(index: number, status: RoomStatus): void {
    this.patchRoom(index, { status });
  }

  protected getRoomTypeName(roomTypeId: string): string {
    return this.roomTypeService.getRoomTypeName(roomTypeId);
  }

  protected countRoomsByStatus(status: RoomStatus): number {
    return this.roomEntries().filter((e) => e.status === status).length;
  }

  // ─── Submit ────────────────────────────────────────────────────────────────

  protected submitForm(): void {
    this.submitted.set(true);

    if (this.form.invalid || !this.draftLocation()) {
      this.form.markAllAsTouched();
      return;
    }

    const facilityId = this.hospital()?.id ?? '';
    const rooms: RoomDraft[] = this.roomEntries().map((entry) => ({
      facilityId,
      roomTypeId: entry.roomTypeId,
      roomNumber: entry.roomNumber,
      status: entry.status,
      remarks: entry.remarks,
    }));

    this.saveHospital.emit({
      ...this.form.getRawValue(),
      location: this.draftLocation(),
      rooms,
    });
  }
}
