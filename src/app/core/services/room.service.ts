import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { serverTimestamp, Timestamp, type DocumentData } from 'firebase/firestore';
import { catchError, map, of } from 'rxjs';
import type { Room, RoomDraft, RoomStatus } from '../../models/room.model';
import { FeedbackService } from './feedback.service';
import { FirestoreService } from './firestore.service';
import { RoomTypeService } from './room-type.service';

@Injectable({
  providedIn: 'root',
})
export class RoomService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly roomTypeService = inject(RoomTypeService);
  private readonly feedbackService = inject(FeedbackService);

  readonly saving = signal(false);

  private readonly allRooms = toSignal(
    this.firestoreService.streamCollection('rooms', (id, data) => this.mapRoom(id, data)).pipe(
      catchError(() => of([] as Room[])),
    ),
    { initialValue: [] as Room[] },
  );

  /** All non-soft-deleted rooms keyed by facilityId */
  readonly roomsByFacility = computed(() => {
    const map = new Map<string, Room[]>();
    for (const room of this.allRooms()) {
      const list = map.get(room.facilityId) ?? [];
      list.push(room);
      map.set(room.facilityId, list);
    }
    return map;
  });

  getRoomsForFacility(facilityId: string): Room[] {
    return this.roomsByFacility().get(facilityId) ?? [];
  }

  countAvailable(facilityId: string): number {
    return this.getRoomsForFacility(facilityId).filter((r) => r.status === 'available').length;
  }

  async saveRoomsForFacility(facilityId: string, drafts: RoomDraft[], existingRooms: Room[]): Promise<void> {
    this.saving.set(true);

    try {
      // Delete rooms not in the new draft list (by room id that were loaded)
      const draftNumbers = new Set(drafts.map((d) => d.roomNumber));
      const toDelete = existingRooms.filter((r) => !draftNumbers.has(r.roomNumber));

      for (const room of toDelete) {
        await this.firestoreService.updateDocument('rooms', room.id, {
          status: 'maintenance' as RoomStatus,
          remarks: 'Removed from facility',
          updatedAt: serverTimestamp(),
        });
      }

      // Upsert drafts
      const existingByNumber = new Map(existingRooms.map((r) => [r.roomNumber, r]));

      for (const draft of drafts) {
        const existing = existingByNumber.get(draft.roomNumber);
        const payload = {
          facilityId,
          roomTypeId: draft.roomTypeId,
          roomNumber: draft.roomNumber,
          status: draft.status,
          remarks: draft.remarks,
          updatedAt: serverTimestamp(),
        };

        if (existing) {
          await this.firestoreService.updateDocument('rooms', existing.id, payload);
        } else {
          await this.firestoreService.addDocument('rooms', {
            ...payload,
            createdAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      this.feedbackService.error('Room save failed', 'Could not save room data. Please try again.');
      throw error;
    } finally {
      this.saving.set(false);
    }
  }

  private mapRoom(id: string, data: DocumentData): Room {
    return {
      id,
      facilityId: typeof data['facilityId'] === 'string' ? data['facilityId'] : '',
      roomTypeId: typeof data['roomTypeId'] === 'string' ? data['roomTypeId'] : '',
      roomTypeName: this.roomTypeService.getRoomTypeName(typeof data['roomTypeId'] === 'string' ? data['roomTypeId'] : ''),
      roomNumber: typeof data['roomNumber'] === 'string' ? data['roomNumber'] : '',
      status: this.parseRoomStatus(data['status']),
      remarks: typeof data['remarks'] === 'string' ? data['remarks'] : '',
      createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : null,
      updatedAt: data['updatedAt'] instanceof Timestamp ? data['updatedAt'].toDate() : null,
    };
  }

  private parseRoomStatus(value: unknown): RoomStatus {
    if (value === 'available' || value === 'occupied' || value === 'maintenance') {
      return value;
    }
    return 'available';
  }
}
