export type RoomType = string;

export const DEFAULT_ROOM_TYPES = [
  'ICU',
  'Emergency',
  'Private Room',
  'Semi-Private',
  'Ward',
  'Isolation',
  'Maternity',
  'Pediatric',
  'Operating Room',
] as const satisfies readonly RoomType[];