import type { FacilityType } from '../../models/hospital.model';
import type { RoomDraft } from '../../models/room.model';

export interface FacilityFormValue {
  name: string;
  type: FacilityType;
  category: string;
  description: string;
  landmark: string;
  address: string;
  area: string;
  contactNumber: string;
  website: string;
  location: { lat: number; lng: number } | null;
  /** Individual rooms managed inline in the form */
  rooms: RoomDraft[];
}

/** @deprecated use FacilityFormValue */
export type HospitalFormValue = FacilityFormValue;