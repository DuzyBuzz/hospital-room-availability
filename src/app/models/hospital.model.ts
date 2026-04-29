export type HospitalStatus = 'available' | 'fewBeds' | 'full';

export type FacilityType = 'hospital' | 'clinic' | 'facility';

/** 'hospitals' kept for legacy read-only seed data; user-submitted records always go to 'facilities' */
export type HospitalCollectionPath = 'hospitals' | 'facilities';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface HospitalRecord {
  id: string;
  collectionPath: HospitalCollectionPath;
  name: string;
  /** facility type per new schema: hospital | clinic | facility */
  type: FacilityType;
  category: string;
  description: string;
  /** Stored as flat fields in Firestore per new schema */
  latitude: number;
  longitude: number;
  /** Derived from latitude/longitude for map compatibility */
  location: Coordinates;
  landmark: string;
  address: string;
  area: string;
  contactNumber: string;
  website: string;
  sourceLabel: string;
  isVerified: boolean;
  ownerUserId: string;
  ownerDisplayName: string;
  deletedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** Derived from rooms collection */
  totalRooms: number;
  availableRooms: number;
  roomTypes: string[];
  status: HospitalStatus;
}

export interface FacilityDraft {
  name: string;
  type: FacilityType;
  category: string;
  description: string;
  latitude: number;
  longitude: number;
  landmark: string;
  address: string;
  area: string;
  contactNumber: string;
  website: string;
  sourceLabel: string;
}

/** @deprecated use FacilityDraft */
export type HospitalDraft = FacilityDraft;