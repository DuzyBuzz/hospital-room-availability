import type { HospitalStatus } from '../../models/hospital.model';

export interface HospitalStatusOption {
  status: HospitalStatus;
  label: string;
  accent: string;
  chipBackground: string;
  chipText: string;
  chipBorder: string;
}

export const HOSPITAL_STATUS_OPTIONS: readonly HospitalStatusOption[] = [
  {
    status: 'available',
    label: 'Available',
    accent: '#16a34a',
    chipBackground: '#ecfdf3',
    chipText: '#166534',
    chipBorder: '#bbf7d0',
  },
  {
    status: 'fewBeds',
    label: 'Few Beds',
    accent: '#f59e0b',
    chipBackground: '#fff7ed',
    chipText: '#b45309',
    chipBorder: '#fed7aa',
  },
  {
    status: 'full',
    label: 'Full',
    accent: '#dc2626',
    chipBackground: '#fef2f2',
    chipText: '#b91c1c',
    chipBorder: '#fecaca',
  },
] as const;

export function deriveHospitalStatus(
  availableRooms: number,
  totalRooms: number,
  requestedStatus?: unknown,
): HospitalStatus {
  if (
    requestedStatus === 'available' ||
    requestedStatus === 'fewBeds' ||
    requestedStatus === 'full'
  ) {
    return requestedStatus;
  }

  return deriveHospitalStatusFromRooms(availableRooms, totalRooms);
}

/** Derives facility status from live room counts (no stored status override) */
export function deriveHospitalStatusFromRooms(
  availableRooms: number,
  totalRooms: number,
): HospitalStatus {
  if (totalRooms === 0) return 'available';
  if (availableRooms <= 0) return 'full';
  if (availableRooms / totalRooms <= 0.3) return 'fewBeds';
  return 'available';
}

export function getHospitalStatusMeta(status: HospitalStatus): HospitalStatusOption {
  return HOSPITAL_STATUS_OPTIONS.find((option) => option.status === status) ?? HOSPITAL_STATUS_OPTIONS[0];
}