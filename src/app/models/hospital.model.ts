export type HospitalStatus = 'available' | 'fewBeds' | 'full';

export type HospitalCollectionPath = 'hospitals' | 'facilities';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface HospitalRecord {
  id: string;
  collectionPath: HospitalCollectionPath;
  name: string;
  category: string;
  description: string;
  location: Coordinates;
  landmark: string;
  address: string;
  area: string;
  contactNumber: string;
  website: string;
  totalRooms: number;
  availableRooms: number;
  roomTypes: string[];
  status: HospitalStatus;
  createdAt: Date | null;
  updatedAt: Date | null;
  sourceLabel: string;
  ownerUserId: string;
  ownerDisplayName: string;
  deletedAt: Date | null;
}

export interface HospitalDraft {
  name: string;
  category: string;
  description: string;
  location: Coordinates;
  landmark: string;
  address: string;
  area: string;
  contactNumber: string;
  website: string;
  totalRooms: number;
  availableRooms: number;
  roomTypes: string[];
  status: HospitalStatus;
  sourceLabel: string;
}