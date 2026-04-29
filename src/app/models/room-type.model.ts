export interface RoomType {
  id: string;
  name: string;
  description: string;
  createdAt: Date | null;
}

/** Seeded room type names shown in the facility form */
export const DEFAULT_ROOM_TYPES = ['ICU', 'Private Room', 'Ward'] as const;

export type DefaultRoomTypeName = (typeof DEFAULT_ROOM_TYPES)[number];

/** Static seed used when room_types collection is empty */
export const STATIC_ROOM_TYPES: RoomType[] = [
  { id: '1', name: 'ICU', description: 'Intensive Care Unit', createdAt: null },
  { id: '2', name: 'Private Room', description: 'Private patient room', createdAt: null },
  { id: '3', name: 'Ward', description: 'General ward for multiple patients', createdAt: null },
];