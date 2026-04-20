/**
 * staffApi.ts — Fetch workshop staff from the BMS API
 *
 * Endpoint: GET /staff?branchId=xxx  (via BMS call-center API)
 *
 * Falls back to collecting staff from selected services if the
 * dedicated endpoint is unavailable.
 */

import { getBmsBearerToken } from '@/services/bmsAuth';

const BASE_URL =
  (import.meta.env.VITE_BMS_API_URL as string) ??
  'https://black.bmspros.com.au/api/call-center';

export interface StaffMember {
  id: string;
  name: string;
}

async function apiHeaders(ownerUid: string): Promise<HeadersInit> {
  const token = await getBmsBearerToken({ waitForFirebaseInit: true });
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Tenant-Id': ownerUid,
  };
}

/**
 * Fetch all staff for a branch from the BMS API.
 * Falls back to an empty array if the endpoint isn't available.
 */
export async function getStaffByBranch(
  ownerUid: string,
  branchId: string,
): Promise<StaffMember[]> {
  try {
    const url = `${BASE_URL}/staff?branchId=${encodeURIComponent(branchId)}`;
    const res = await fetch(url, { headers: await apiHeaders(ownerUid) });
    if (!res.ok) return [];
    const json = await res.json();
    const raw: unknown[] = json.staff ?? json ?? [];
    return raw.map((s: any) => ({
      id: String(s.id ?? ''),
      name: String(s.name ?? ''),
    })).filter((s) => s.id && s.name);
  } catch {
    return [];
  }
}
