import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { serverTimestamp, Timestamp, type DocumentData } from 'firebase/firestore';
import { catchError, combineLatest, map, of, tap } from 'rxjs';
import type {
  Coordinates,
  FacilityDraft,
  FacilityType,
  HospitalCollectionPath,
  HospitalRecord,
  HospitalStatus,
} from '../../models/hospital.model';
import type { FacilityFormValue } from '../../shared/interfaces/hospital-form.interface';
import {
  DEFAULT_STATUS_FILTERS,
  type StatusFilterState,
} from '../../shared/interfaces/hospital-filters.interface';
import { formatRelativeTime } from '../../shared/utils/date-time.util';
import {
  HOSPITAL_STATUS_OPTIONS,
  deriveHospitalStatusFromRooms,
  getHospitalStatusMeta,
} from '../../shared/utils/hospital-status.util';
import { AuthService } from './auth.service';
import { FirestoreService } from './firestore.service';
import { RoomService } from './room.service';

@Injectable({
  providedIn: 'root',
})
export class HospitalService {
  private readonly authService = inject(AuthService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly roomService = inject(RoomService);

  readonly saving = signal(false);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly saveMessage = signal<string | null>(null);

  readonly searchTerm = signal('');
  readonly activeStatuses = signal<StatusFilterState>({ ...DEFAULT_STATUS_FILTERS });
  readonly selectedRoomType = signal('all');
  readonly selectedArea = signal('all');
  readonly selectedHospitalId = signal<string | null>(null);

  readonly statusOptions = HOSPITAL_STATUS_OPTIONS;

  private readonly liveFacilities = toSignal(
    combineLatest([
      this.firestoreService.streamCollection('hospitals', (id, data) =>
        this.mapFacility(id, 'hospitals', data),
      ),
      this.firestoreService.streamCollection('facilities', (id, data) =>
        this.mapFacility(id, 'facilities', data),
      ),
    ]).pipe(
      tap(() => {
        this.loading.set(false);
        this.errorMessage.set(null);
      }),
      map(([hospitals, facilities]) =>
        [...hospitals, ...facilities].sort((a, b) => this.sortByUpdatedAt(a, b)),
      ),
      catchError((error) => {
        this.loading.set(false);
        this.errorMessage.set(this.humanizeFirestoreError(error));
        return of([] as HospitalRecord[]);
      }),
    ),
    { initialValue: [] as HospitalRecord[] },
  );

  /** Facilities enriched with live room data */
  readonly hospitals = computed(() => {
    const facilities = this.liveFacilities().filter((f) => f.deletedAt === null);
    const roomsByFacility = this.roomService.roomsByFacility();

    return facilities.map((facility) => {
      const rooms = roomsByFacility.get(facility.id) ?? [];
      const totalRooms = rooms.length;
      const availableRooms = rooms.filter((r) => r.status === 'available').length;
      const roomTypes = Array.from(new Set(rooms.map((r) => r.roomTypeName).filter(Boolean)));
      const status = deriveHospitalStatusFromRooms(availableRooms, totalRooms);

      return { ...facility, totalRooms, availableRooms, roomTypes, status };
    });
  });

  readonly totalHospitalCount = computed(() => this.hospitals().length);
  readonly totalAvailableRooms = computed(() =>
    this.hospitals().reduce((sum, h) => sum + h.availableRooms, 0),
  );
  readonly latestHospitalUpdate = computed(() => this.hospitals()[0] ?? null);
  readonly roomTypeOptions = computed(() => {
    const roomTypes = new Set<string>();
    for (const hospital of this.hospitals()) {
      for (const rt of hospital.roomTypes) {
        roomTypes.add(rt);
      }
    }
    return Array.from(roomTypes).sort((a, b) => a.localeCompare(b));
  });
  readonly areaOptions = computed(() => {
    const areas = new Set<string>();
    for (const hospital of this.hospitals()) {
      if (hospital.area.trim()) areas.add(hospital.area.trim());
      if (hospital.landmark.trim()) areas.add(hospital.landmark.trim());
    }
    return Array.from(areas).sort((a, b) => a.localeCompare(b));
  });

  readonly filteredHospitals = computed(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const selectedRoomType = this.selectedRoomType();
    const selectedArea = this.selectedArea().trim().toLowerCase();
    const activeStatuses = this.activeStatuses();

    return this.hospitals().filter((hospital) => {
      const matchesSearch =
        searchTerm.length === 0 ||
        hospital.name.toLowerCase().includes(searchTerm) ||
        hospital.description.toLowerCase().includes(searchTerm) ||
        hospital.landmark.toLowerCase().includes(searchTerm) ||
        hospital.address.toLowerCase().includes(searchTerm) ||
        hospital.area.toLowerCase().includes(searchTerm);

      const matchesStatus = activeStatuses[hospital.status];
      const matchesRoomType =
        selectedRoomType === 'all' || hospital.roomTypes.some((rt) => rt === selectedRoomType);
      const matchesArea =
        selectedArea === 'all' ||
        selectedArea.length === 0 ||
        hospital.area.toLowerCase() === selectedArea ||
        hospital.landmark.toLowerCase() === selectedArea;

      return matchesSearch && matchesStatus && matchesRoomType && matchesArea;
    });
  });

  readonly selectedHospital = computed(() => {
    const selectedHospitalId = this.selectedHospitalId();
    const filteredHospitals = this.filteredHospitals();

    return (
      filteredHospitals.find((h) => h.id === selectedHospitalId) ??
      this.hospitals().find((h) => h.id === selectedHospitalId) ??
      filteredHospitals[0] ??
      this.hospitals()[0] ??
      null
    );
  });

  constructor() {
    effect(() => {
      const hospitals = this.hospitals();
      const filteredHospitals = this.filteredHospitals();
      const selectedHospitalId = this.selectedHospitalId();

      if (hospitals.length === 0) {
        this.selectedHospitalId.set(null);
        return;
      }

      const preferredCollection = filteredHospitals.length > 0 ? filteredHospitals : hospitals;

      if (!selectedHospitalId || !preferredCollection.some((h) => h.id === selectedHospitalId)) {
        this.selectedHospitalId.set(preferredCollection[0]?.id ?? null);
      }
    });
  }

  updateSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  setActiveStatuses(value: StatusFilterState): void {
    this.activeStatuses.set({ ...value });
  }

  resetFilters(): void {
    this.searchTerm.set('');
    this.activeStatuses.set({ ...DEFAULT_STATUS_FILTERS });
    this.selectedRoomType.set('all');
    this.selectedArea.set('all');
  }

  toggleStatus(status: HospitalStatus): void {
    this.activeStatuses.update((current) => ({
      ...current,
      [status]: !current[status],
    }));
  }

  setRoomType(value: string): void {
    this.selectedRoomType.set(value || 'all');
  }

  setArea(value: string): void {
    this.selectedArea.set(value || 'all');
  }

  selectHospital(hospitalId: string): void {
    this.selectedHospitalId.set(hospitalId);
  }

  canRequestManagement(hospital: HospitalRecord | null): boolean {
    return !!hospital && hospital.collectionPath === 'facilities' && hospital.ownerUserId.trim().length > 0;
  }

  canCurrentUserManage(hospital: HospitalRecord | null): boolean {
    const currentUserId = this.authService.user()?.id ?? null;
    return (
      hospital !== null &&
      hospital.collectionPath === 'facilities' &&
      hospital.ownerUserId.trim().length > 0 &&
      currentUserId !== null &&
      hospital.ownerUserId === currentUserId
    );
  }

  clearFeedback(): void {
    this.errorMessage.set(null);
    this.saveMessage.set(null);
  }

  statusCount(status: HospitalStatus): number {
    return this.hospitals().filter((h) => h.status === status).length;
  }

  statusMeta(status: HospitalStatus) {
    return getHospitalStatusMeta(status);
  }

  locationSummary(hospital: HospitalRecord): string {
    return hospital.landmark || hospital.area || hospital.address || 'Iloilo City';
  }

  roomAvailabilitySummary(hospital: HospitalRecord): string {
    return `${hospital.availableRooms} of ${hospital.totalRooms} rooms available`;
  }

  roomTypeSummary(hospital: HospitalRecord): string {
    return hospital.roomTypes.length > 0 ? hospital.roomTypes.join(', ') : 'Room types pending update';
  }

  updatedSummary(hospital: HospitalRecord | null): string {
    return hospital ? formatRelativeTime(hospital.updatedAt || hospital.createdAt) : 'Waiting for updates';
  }

  async saveHospital(
    formValue: FacilityFormValue,
    editingHospital: HospitalRecord | null,
  ): Promise<string | null> {
    this.saving.set(true);
    this.errorMessage.set(null);
    this.saveMessage.set(null);

    if (!this.authService.isAuthenticated()) {
      this.saving.set(false);
      this.errorMessage.set('Sign in to add or update a medical facility listing.');
      return null;
    }

    const currentUser = this.authService.user();

    if (!currentUser) {
      this.saving.set(false);
      this.errorMessage.set('Sign in again before managing facilities.');
      return null;
    }

    if (editingHospital && !this.canCurrentUserManage(editingHospital)) {
      this.saving.set(false);
      this.errorMessage.set('Only the user who created this facility can edit it.');
      return null;
    }

    if (!formValue.location) {
      this.saving.set(false);
      this.errorMessage.set('Click on the map to choose the exact medical facility location.');
      return null;
    }

    const draft = this.createDraft(formValue, editingHospital);
    const payload: Record<string, unknown> = {
      name: draft.name,
      type: draft.type,
      category: draft.category,
      description: draft.description,
      latitude: draft.latitude,
      longitude: draft.longitude,
      landmark: draft.landmark,
      address: draft.address,
      area: draft.area,
      contactNumber: draft.contactNumber,
      website: draft.website,
      sourceLabel: draft.sourceLabel,
      isVerified: editingHospital?.isVerified ?? false,
      ownerUserId: editingHospital?.ownerUserId ?? currentUser.id,
      ownerDisplayName: editingHospital?.ownerDisplayName ?? currentUser.displayName,
      updatedAt: serverTimestamp(),
    };

    try {
      let facilityId: string;

      if (editingHospital) {
        await this.firestoreService.updateDocument(editingHospital.collectionPath, editingHospital.id, payload);
        facilityId = editingHospital.id;
        this.saveMessage.set('Listing updated. The map and directory refresh automatically.');
      } else {
        facilityId = await this.firestoreService.addDocument('facilities', {
          ...payload,
          createdAt: serverTimestamp(),
          deletedAt: null,
        });
        this.saveMessage.set('Listing created. Visitors can now see it on the map and in the directory.');
      }

      // Save per-room data to the rooms collection
      const existingRooms = this.roomService.getRoomsForFacility(facilityId);
      await this.roomService.saveRoomsForFacility(facilityId, formValue.rooms, existingRooms);

      return facilityId;
    } catch (error) {
      this.errorMessage.set(this.humanizeFirestoreError(error));
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async deleteHospital(hospital: HospitalRecord | null): Promise<boolean> {
    this.saving.set(true);
    this.errorMessage.set(null);
    this.saveMessage.set(null);

    const currentUser = this.authService.user();

    if (!currentUser) {
      this.saving.set(false);
      this.errorMessage.set('Sign in before deleting a facility listing.');
      return false;
    }

    if (!hospital || !this.canCurrentUserManage(hospital)) {
      this.saving.set(false);
      this.errorMessage.set('Only the user who created this facility can delete it.');
      return false;
    }

    try {
      await this.firestoreService.updateDocument(hospital.collectionPath, hospital.id, {
        updatedAt: serverTimestamp(),
        deletedAt: serverTimestamp(),
        deletedByUserId: currentUser.id,
      });

      this.saveMessage.set('Facility deleted. It has been removed from the public directory.');
      return true;
    } catch (error) {
      this.errorMessage.set(this.humanizeFirestoreError(error));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  private createDraft(
    formValue: FacilityFormValue,
    editingHospital: HospitalRecord | null,
  ): FacilityDraft {
    return {
      name: formValue.name.trim(),
      type: formValue.type,
      category: formValue.category.trim() || 'Medical Facility',
      description: formValue.description.trim(),
      latitude: formValue.location!.lat,
      longitude: formValue.location!.lng,
      landmark: formValue.landmark.trim(),
      address: formValue.address.trim(),
      area: formValue.area.trim(),
      contactNumber: formValue.contactNumber.trim(),
      website: this.normalizeWebsite(formValue.website),
      sourceLabel: this.resolveSourceLabel(editingHospital),
    };
  }

  private mapFacility(
    id: string,
    collectionPath: HospitalCollectionPath,
    data: DocumentData,
  ): HospitalRecord {
    // Support both new flat lat/lng and legacy nested location map
    const latitude =
      this.readCoordinate(data['latitude']) ??
      this.readCoordinate(data['location']?.['lat']) ??
      10.7202;
    const longitude =
      this.readCoordinate(data['longitude']) ??
      this.readCoordinate(data['location']?.['lng']) ??
      122.5621;

    return {
      id,
      collectionPath,
      name: this.readString(data['name']) || 'Unnamed Medical Facility',
      type: this.parseFacilityType(data['type']),
      category: this.readString(data['category']) || 'Medical Facility',
      description: this.readString(data['description']) || 'No description provided yet.',
      latitude,
      longitude,
      location: { lat: latitude, lng: longitude },
      landmark: this.readString(data['landmark']),
      address: this.readString(data['address']),
      area: this.readString(data['area']) || 'Iloilo City',
      contactNumber: this.readString(data['contactNumber']) || 'Contact number unavailable',
      website: this.normalizeWebsite(this.readString(data['website'])),
      sourceLabel:
        this.readString(data['sourceLabel']) ||
        this.readString(data['ownerDisplayName']) ||
        (collectionPath === 'hospitals' ? 'Medical team update' : 'Directory update'),
      isVerified: data['isVerified'] === true,
      ownerUserId: this.readString(data['ownerUserId']),
      ownerDisplayName:
        this.readString(data['ownerDisplayName']) || this.readString(data['ownerName']),
      createdAt: this.readTimestamp(data['createdAt']),
      updatedAt: this.readTimestamp(data['updatedAt']),
      deletedAt: this.readTimestamp(data['deletedAt']),
      // Overridden by computed `hospitals` signal via live room join
      totalRooms: 0,
      availableRooms: 0,
      roomTypes: [],
      status: 'available',
    };
  }

  private parseFacilityType(value: unknown): FacilityType {
    if (value === 'hospital' || value === 'clinic' || value === 'facility') {
      return value;
    }
    return 'hospital';
  }

  private resolveSourceLabel(editingHospital: HospitalRecord | null): string {
    if (editingHospital?.sourceLabel.trim()) {
      return editingHospital.sourceLabel;
    }
    const displayName = this.authService.displayName().trim();
    return displayName.length > 0 ? `${displayName} update` : 'Medical team update';
  }

  private readCoordinate(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private readTimestamp(value: unknown): Date | null {
    if (value instanceof Timestamp) return value.toDate();
    return value instanceof Date ? value : null;
  }

  private normalizeWebsite(website: string): string {
    const trimmed = website.trim();
    if (trimmed.length === 0) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  private sortByUpdatedAt(left: HospitalRecord, right: HospitalRecord): number {
    const leftTime = left.updatedAt?.getTime() ?? left.createdAt?.getTime() ?? 0;
    const rightTime = right.updatedAt?.getTime() ?? right.createdAt?.getTime() ?? 0;
    return rightTime - leftTime;
  }

  private humanizeFirestoreError(error: unknown): string {
    const errorCode = this.readFirebaseErrorCode(error);
    switch (errorCode) {
      case 'permission-denied':
        return 'Firestore rejected this write. Check your permissions.';
      case 'unauthenticated':
        return 'The database rejected the request because the current write is not allowed.';
      case 'unavailable':
        return 'Firestore is temporarily unavailable. Try again in a moment.';
      case 'failed-precondition':
        return 'Firestore rejected the request because the database rules or indexes are not ready.';
      case 'invalid-argument':
        return 'The facility data sent to Firestore is invalid. Check the form values and try again.';
      case 'not-found':
        return 'The facility you are trying to update no longer exists.';
      case 'resource-exhausted':
        return 'The Firebase project quota was reached. Try again later.';
      case 'deadline-exceeded':
        return 'The Firestore request timed out. Try again.';
      default:
        return this.sanitizeFirebaseMessage(error, 'We could not save your changes right now.');
    }
  }

  private readFirebaseErrorCode(error: unknown): string | null {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error['code'] === 'string'
    ) {
      return error['code'];
    }
    return null;
  }

  private sanitizeFirebaseMessage(error: unknown, fallback: string): string {
    const message = error instanceof Error ? error.message : fallback;
    return message
      .replace('FirebaseError: ', '')
      .replace('Firebase: ', '')
      .replace(/\((auth|firestore)\//g, '(')
      .replace(').', '.')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
