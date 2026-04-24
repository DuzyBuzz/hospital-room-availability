import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Timestamp, serverTimestamp, type DocumentData } from 'firebase/firestore';
import { catchError, combineLatest, map, of, tap } from 'rxjs';
import type {
  Coordinates,
  HospitalCollectionPath,
  HospitalDraft,
  HospitalRecord,
  HospitalStatus,
} from '../../models/hospital.model';
import { DEFAULT_ROOM_TYPES } from '../../models/room-type.model';
import type { HospitalFormValue } from '../../shared/interfaces/hospital-form.interface';
import {
  DEFAULT_STATUS_FILTERS,
  type StatusFilterState,
} from '../../shared/interfaces/hospital-filters.interface';
import { formatRelativeTime } from '../../shared/utils/date-time.util';
import {
  HOSPITAL_STATUS_OPTIONS,
  deriveHospitalStatus,
  getHospitalStatusMeta,
} from '../../shared/utils/hospital-status.util';
import { AuthService } from './auth.service';
import { FeedbackService } from './feedback.service';
import { FirestoreService } from './firestore.service';

@Injectable({
  providedIn: 'root',
})
export class HospitalService {
  private readonly authService = inject(AuthService);
  private readonly feedbackService = inject(FeedbackService);
  private readonly firestoreService = inject(FirestoreService);

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

  private readonly liveHospitals = toSignal(
    combineLatest([
      this.firestoreService.streamCollection('hospitals', (id, data) =>
        this.mapHospital(id, 'hospitals', data),
      ),
      this.firestoreService.streamCollection('facilities', (id, data) =>
        this.mapHospital(id, 'facilities', data),
      ),
    ]).pipe(
      tap(() => {
        this.loading.set(false);
        this.errorMessage.set(null);
      }),
      map(([hospitals, facilities]) => [...hospitals, ...facilities].sort((left, right) => this.sortByUpdatedAt(left, right))),
      catchError((error) => {
        this.loading.set(false);
        const message = this.humanizeFirestoreError(error);

        this.errorMessage.set(message);
        this.feedbackService.error('Firestore sync issue', message, { life: 6000 });

        return of([] as HospitalRecord[]);
      }),
    ),
    { initialValue: [] as HospitalRecord[] },
  );

  readonly hospitals = computed(() => this.liveHospitals().filter((hospital) => hospital.deletedAt === null));
  readonly totalHospitalCount = computed(() => this.hospitals().length);
  readonly totalAvailableRooms = computed(() =>
    this.hospitals().reduce((sum, hospital) => sum + hospital.availableRooms, 0),
  );
  readonly latestHospitalUpdate = computed(() => this.hospitals()[0] ?? null);
  readonly roomTypeOptions = computed(() => {
    const roomTypes = new Set<string>(DEFAULT_ROOM_TYPES);

    for (const hospital of this.hospitals()) {
      for (const roomType of hospital.roomTypes) {
        roomTypes.add(roomType);
      }
    }

    return Array.from(roomTypes).sort((left, right) => left.localeCompare(right));
  });
  readonly areaOptions = computed(() => {
    const areaOptions = new Set<string>();

    for (const hospital of this.hospitals()) {
      if (hospital.area.trim().length > 0) {
        areaOptions.add(hospital.area.trim());
      }

      if (hospital.landmark.trim().length > 0) {
        areaOptions.add(hospital.landmark.trim());
      }
    }

    return Array.from(areaOptions).sort((left, right) => left.localeCompare(right));
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
        selectedRoomType === 'all' || hospital.roomTypes.some((roomType) => roomType === selectedRoomType);
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
      filteredHospitals.find((hospital) => hospital.id === selectedHospitalId) ??
      this.hospitals().find((hospital) => hospital.id === selectedHospitalId) ??
      filteredHospitals[0] ??
      this.hospitals()[0] ??
      null
    );
  });

  constructor() {
    effect(
      () => {
        const hospitals = this.hospitals();
        const filteredHospitals = this.filteredHospitals();
        const selectedHospitalId = this.selectedHospitalId();

        if (hospitals.length === 0) {
          this.selectedHospitalId.set(null);
          return;
        }

        const preferredCollection = filteredHospitals.length > 0 ? filteredHospitals : hospitals;

        if (!selectedHospitalId || !preferredCollection.some((hospital) => hospital.id === selectedHospitalId)) {
          this.selectedHospitalId.set(preferredCollection[0]?.id ?? null);
        }
      },
    );
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
    this.activeStatuses.update((currentState) => ({
      ...currentState,
      [status]: !currentState[status],
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
      hospital !== null
      && hospital.collectionPath === 'facilities'
      && hospital.ownerUserId.trim().length > 0
      && currentUserId !== null
      && hospital.ownerUserId === currentUserId
    );
  }

  clearFeedback(): void {
    this.errorMessage.set(null);
    this.saveMessage.set(null);
  }

  statusCount(status: HospitalStatus): number {
    return this.hospitals().filter((hospital) => hospital.status === status).length;
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
    formValue: HospitalFormValue,
    editingHospital: HospitalRecord | null,
  ): Promise<string | null> {
    this.saving.set(true);
    this.errorMessage.set(null);
    this.saveMessage.set(null);

    if (!this.authService.isAuthenticated()) {
      this.saving.set(false);
      this.setErrorFeedback('Authentication required', 'Sign in to add or update a medical facility listing.');
      return null;
    }

    const currentUser = this.authService.user();

    if (!currentUser) {
      this.saving.set(false);
      this.setErrorFeedback('Authentication required', 'Sign in again before managing facilities.');
      return null;
    }

    if (editingHospital && !this.canCurrentUserManage(editingHospital)) {
      this.saving.set(false);
      this.setErrorFeedback('Permission denied', 'Only the user who created this facility can edit it.');
      return null;
    }

    const roomTypes = this.normalizeRoomTypes([
      ...formValue.roomTypes,
      ...formValue.customRoomTypes
        .split(',')
        .map((roomType) => roomType.trim())
        .filter((roomType) => roomType.length > 0),
    ]);

    if (!formValue.location) {
      this.saving.set(false);
      this.setErrorFeedback('Location required', 'Click on the map to choose the exact medical facility location.');
      return null;
    }

    if (roomTypes.length === 0) {
      this.saving.set(false);
      this.setErrorFeedback('Room type required', 'Select at least one room type before saving this record.');
      return null;
    }

    if (formValue.availableRooms > formValue.totalRooms) {
      this.saving.set(false);
      this.setErrorFeedback('Invalid room counts', 'Available rooms cannot be greater than the total room count.');
      return null;
    }

    const draft = this.createDraft(formValue, roomTypes, editingHospital);
    const payload = {
      name: draft.name,
      category: draft.category,
      description: draft.description,
      location: draft.location,
      coordinates: draft.location,
      landmark: draft.landmark,
      address: draft.address,
      area: draft.area,
      contactNumber: draft.contactNumber,
      website: draft.website,
      totalRooms: draft.totalRooms,
      availableRooms: draft.availableRooms,
      roomTypes: draft.roomTypes,
      status: draft.status,
      sourceLabel: draft.sourceLabel,
      ownerUserId: editingHospital?.ownerUserId ?? currentUser.id,
      ownerDisplayName: editingHospital?.ownerDisplayName ?? currentUser.displayName,
      updatedAt: serverTimestamp(),
    } satisfies Record<string, unknown>;

    try {
      if (editingHospital) {
        await this.firestoreService.updateDocument(editingHospital.collectionPath, editingHospital.id, payload);
        this.setSuccessFeedback('Facility updated', 'Listing updated. The map and directory refresh automatically.');
        return editingHospital.id;
      }

      const hospitalId = await this.firestoreService.addDocument('facilities', {
        ...payload,
        createdAt: serverTimestamp(),
      });

      this.setSuccessFeedback('Facility added', 'Listing created. Visitors can now see it on the map and in the directory.');
      return hospitalId;
    } catch (error) {
      this.setErrorFeedback('Firestore save failed', this.humanizeFirestoreError(error));
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
      this.setErrorFeedback('Authentication required', 'Sign in before deleting a facility listing.');
      return false;
    }

    if (!hospital || !this.canCurrentUserManage(hospital)) {
      this.saving.set(false);
      this.setErrorFeedback('Permission denied', 'Only the user who created this facility can delete it.');
      return false;
    }

    try {
      await this.firestoreService.updateDocument(hospital.collectionPath, hospital.id, {
        updatedAt: serverTimestamp(),
        deletedAt: serverTimestamp(),
        deletedByUserId: currentUser.id,
      });

      this.setSuccessFeedback('Facility deleted', 'It has been removed from the public directory.');
      return true;
    } catch (error) {
      this.setErrorFeedback('Firestore delete failed', this.humanizeFirestoreError(error));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  private setErrorFeedback(summary: string, message: string): void {
    this.errorMessage.set(message);
    this.feedbackService.error(summary, message);
  }

  private setSuccessFeedback(summary: string, message: string): void {
    this.saveMessage.set(message);
    this.feedbackService.success(summary, message);
  }

  private createDraft(
    formValue: HospitalFormValue,
    roomTypes: string[],
    editingHospital: HospitalRecord | null,
  ): HospitalDraft {
    return {
      name: formValue.name.trim(),
      category: formValue.category.trim() || 'Medical Facility',
      description: formValue.description.trim(),
      location: formValue.location!,
      landmark: formValue.landmark.trim(),
      address: formValue.address.trim(),
      area: formValue.area.trim(),
      contactNumber: formValue.contactNumber.trim(),
      website: this.normalizeWebsite(formValue.website),
      totalRooms: formValue.totalRooms,
      availableRooms: formValue.availableRooms,
      roomTypes,
      status: deriveHospitalStatus(
        formValue.availableRooms,
        formValue.totalRooms,
        formValue.status,
      ),
      sourceLabel: this.resolveSourceLabel(editingHospital),
    };
  }

  private mapHospital(
    id: string,
    collectionPath: HospitalCollectionPath,
    data: DocumentData,
  ): HospitalRecord {
    const totalRooms = this.readNumber(data['totalRooms'], 0);
    const availableRooms = this.readNumber(data['availableRooms'], 0);

    return {
      id,
      collectionPath,
      name: this.readString(data['name']) || 'Unnamed Medical Facility',
      category: this.readString(data['category']) || 'Medical Facility',
      description: this.readString(data['description']) || 'No description provided yet.',
      location: this.readLocation(data['location'] ?? data['coordinates']),
      landmark: this.readString(data['landmark']),
      address: this.readString(data['address']),
      area: this.readString(data['area']) || 'Iloilo City',
      contactNumber: this.readString(data['contactNumber']) || 'Contact number unavailable',
      website: this.normalizeWebsite(this.readString(data['website'])),
      totalRooms,
      availableRooms,
      roomTypes: this.normalizeRoomTypes(this.readStringArray(data['roomTypes'])),
      status: deriveHospitalStatus(availableRooms, totalRooms, data['status']),
      createdAt: this.readTimestamp(data['createdAt']),
      updatedAt: this.readTimestamp(data['updatedAt']),
      ownerUserId: this.readString(data['ownerUserId']),
      ownerDisplayName: this.readString(data['ownerDisplayName']) || this.readString(data['ownerName']),
      deletedAt: this.readTimestamp(data['deletedAt']),
      sourceLabel:
        this.readString(data['sourceLabel']) ||
        this.readString(data['ownerDisplayName']) ||
        this.readString(data['ownerName']) ||
        (collectionPath === 'hospitals' ? 'Medical team update' : 'Directory update'),
    };
  }

  private resolveSourceLabel(editingHospital: HospitalRecord | null): string {
    if (editingHospital?.sourceLabel.trim()) {
      return editingHospital.sourceLabel;
    }

    const displayName = this.authService.displayName().trim();

    return displayName.length > 0 ? `${displayName} update` : 'Medical team update';
  }

  private readLocation(value: unknown): Coordinates {
    if (
      typeof value === 'object' &&
      value !== null &&
      'lat' in value &&
      'lng' in value &&
      typeof value['lat'] === 'number' &&
      typeof value['lng'] === 'number'
    ) {
      return {
        lat: value['lat'],
        lng: value['lng'],
      };
    }

    return {
      lat: 10.7202,
      lng: 122.5621,
    };
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  private readNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private readTimestamp(value: unknown): Date | null {
    if (value instanceof Timestamp) {
      return value.toDate();
    }

    return value instanceof Date ? value : null;
  }

  private normalizeRoomTypes(roomTypes: string[]): string[] {
    return Array.from(
      new Set(
        roomTypes
          .map((roomType) => roomType.trim())
          .filter((roomType) => roomType.length > 0),
      ),
    );
  }

  private normalizeWebsite(website: string): string {
    const trimmedWebsite = website.trim();

    if (trimmedWebsite.length === 0) {
      return '';
    }

    return /^https?:\/\//i.test(trimmedWebsite) ? trimmedWebsite : `https://${trimmedWebsite}`;
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
        return 'Firestore rejected this write. Check your Firestore rules for facilities and hospitals.';
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
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}