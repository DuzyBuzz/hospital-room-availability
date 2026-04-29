export type RoomStatus = 'available' | 'occupied' | 'maintenance';

export interface Room {
  id: string;
  facilityId: string;
  roomTypeId: string;
  roomTypeName: string;
  roomNumber: string;
  status: RoomStatus;
  remarks: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface RoomDraft {
  facilityId: string;
  roomTypeId: string;
  roomNumber: string;
  status: RoomStatus;
  remarks: string;
}
