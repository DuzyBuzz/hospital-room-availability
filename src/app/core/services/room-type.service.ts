import { computed, Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Timestamp, type DocumentData } from 'firebase/firestore';
import { catchError, of } from 'rxjs';
import { STATIC_ROOM_TYPES, type RoomType } from '../../models/room-type.model';
import { FirestoreService } from './firestore.service';

@Injectable({
  providedIn: 'root',
})
export class RoomTypeService {
  private readonly firestoreService = inject(FirestoreService);

  private readonly liveRoomTypes = toSignal(
    this.firestoreService.streamCollection('room_types', (id, data) => this.mapRoomType(id, data)).pipe(
      catchError(() => of([] as RoomType[])),
    ),
    { initialValue: [] as RoomType[] },
  );

  /** Falls back to static seed data when the Firestore collection is empty */
  readonly roomTypes = computed(() => {
    const live = this.liveRoomTypes();
    return live.length > 0 ? live : STATIC_ROOM_TYPES;
  });

  readonly roomTypeNames = computed(() => this.roomTypes().map((rt) => rt.name));

  readonly roomTypeMap = computed(() => {
    const map = new Map<string, RoomType>();
    for (const rt of this.roomTypes()) {
      map.set(rt.id, rt);
    }
    return map;
  });

  getRoomTypeName(roomTypeId: string): string {
    return this.roomTypeMap().get(roomTypeId)?.name ?? roomTypeId;
  }

  private mapRoomType(id: string, data: DocumentData): RoomType {
    return {
      id,
      name: typeof data['name'] === 'string' ? data['name'] : id,
      description: typeof data['description'] === 'string' ? data['description'] : '',
      createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : null,
    };
  }
}
