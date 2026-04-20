import type { HospitalStatus } from '../../models/hospital.model';

export type StatusFilterState = Record<HospitalStatus, boolean>;

export interface HospitalFilters {
  searchTerm: string;
  roomType: string;
  area: string;
  statuses: StatusFilterState;
}

export const DEFAULT_STATUS_FILTERS: StatusFilterState = {
  available: true,
  fewBeds: true,
  full: true,
};