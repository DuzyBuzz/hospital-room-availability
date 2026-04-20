import type { Coordinates, HospitalStatus } from '../../models/hospital.model';

export interface HospitalFormValue {
  name: string;
  category: string;
  description: string;
  landmark: string;
  address: string;
  area: string;
  contactNumber: string;
  website: string;
  totalRooms: number;
  availableRooms: number;
  roomTypes: string[];
  customRoomTypes: string;
  status: HospitalStatus;
  location: Coordinates | null;
}