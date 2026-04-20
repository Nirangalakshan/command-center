/**
 * didMappingsApi.ts — DID ↔ Workshop/Branch mapping (super-admin only)
 *
 *  • Fetches workshops + branches from BMS Pro (Firebase) so super-admins can
 *    pick the correct ownerUid + branchId when creating a mapping.
 *  • Persists mappings in Supabase (`did_mappings`) which the Yeastar webhook
 *    already reads during incoming-call screen pop.
 */

import { supabase } from '@/integrations/supabase/client';
import { getBmsBearerToken } from '@/services/bmsAuth';
import type { DIDMapping } from './types';

const BASE_URL =
  (import.meta.env.VITE_BMS_API_URL as string) ??
  'https://black.bmspros.com.au/api/call-center';

/* ─── Types ─── */

export interface BmsBranchOption {
  id: string;
  name: string;
  ownerUid: string;
  workshopName: string;
  phone?: string;
  address?: string;
}

export interface BmsWorkshopOption {
  ownerUid: string;
  name: string;
  branches: BmsBranchOption[];
}

export interface DIDMappingInput {
  did: string;
  label: string;
  tenantId: string;
  queueId: string;
  ownerUid: string;
  workshopName: string;
  branchId: string;
  branchName: string;
}

/* ─── BMS API helpers ─── */

async function bmsHeaders(): Promise<HeadersInit> {
  const token = await getBmsBearerToken({
    waitForFirebaseInit: true,
    forceRefreshFirebase: true,
  });
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

interface RawWorkshop {
  ownerUid?: string;
  id?: string;
  uid?: string;
  name?: string;
  businessName?: string;
  workshopName?: string;
}

interface RawBranch {
  id?: string;
  branchId?: string;
  name?: string;
  branchName?: string;
  phone?: string;
  address?: string;
}

function extractOwnerUid(w: RawWorkshop): string {
  return String(w.ownerUid ?? w.uid ?? w.id ?? '');
}

function extractWorkshopName(w: RawWorkshop): string {
  return String(w.name ?? w.businessName ?? w.workshopName ?? '');
}

/** List all workshops the current Firebase user can access (CC-admin = all). */
export async function fetchBmsWorkshops(): Promise<
  Array<{ ownerUid: string; name: string }>
> {
  const res = await fetch(`${BASE_URL}/workshops`, { headers: await bmsHeaders() });
  if (!res.ok) {
    throw new Error(`Failed to load workshops (${res.status})`);
  }
  const json = await res.json();
  const list: RawWorkshop[] = Array.isArray(json)
    ? json
    : Array.isArray(json?.workshops)
      ? json.workshops
      : [];
  return list
    .map((w) => ({
      ownerUid: extractOwnerUid(w),
      name: extractWorkshopName(w) || extractOwnerUid(w),
    }))
    .filter((w) => w.ownerUid);
}

/** Fetch a single workshop's detail incl. branches. */
export async function fetchBmsWorkshopBranches(
  ownerUid: string,
): Promise<BmsBranchOption[]> {
  const res = await fetch(
    `${BASE_URL}/workshops/${encodeURIComponent(ownerUid)}`,
    { headers: await bmsHeaders() },
  );
  if (!res.ok) {
    throw new Error(`Failed to load branches (${res.status})`);
  }
  const json = await res.json();
  const workshopName =
    extractWorkshopName(json?.workshop ?? {}) ||
    extractWorkshopName(json ?? {}) ||
    ownerUid;
  const rawBranches: RawBranch[] = Array.isArray(json?.branches)
    ? json.branches
    : Array.isArray(json?.workshop?.branches)
      ? json.workshop.branches
      : [];
  return rawBranches
    .map((b) => ({
      id: String(b.id ?? b.branchId ?? ''),
      name: String(b.name ?? b.branchName ?? ''),
      ownerUid,
      workshopName,
      phone: b.phone ? String(b.phone) : undefined,
      address: b.address ? String(b.address) : undefined,
    }))
    .filter((b) => b.id);
}

/** Convenience: load every workshop + its branches in one pass (super-admin UI). */
export async function fetchBmsWorkshopOptions(): Promise<BmsWorkshopOption[]> {
  const workshops = await fetchBmsWorkshops();
  const results = await Promise.all(
    workshops.map(async (w) => {
      try {
        const branches = await fetchBmsWorkshopBranches(w.ownerUid);
        // fallback if workshop detail exposed a better display name
        const workshopName = branches[0]?.workshopName || w.name;
        return {
          ownerUid: w.ownerUid,
          name: workshopName,
          branches: branches.map((b) => ({ ...b, workshopName })),
        };
      } catch {
        return { ownerUid: w.ownerUid, name: w.name, branches: [] };
      }
    }),
  );
  return results
    .filter((w) => w.branches.length > 0 || w.ownerUid)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ─── Supabase CRUD ─── */

type UntypedSupabase = {
  from: (table: string) => {
    select: (...args: unknown[]) => any;
    insert: (...args: unknown[]) => any;
    update: (...args: unknown[]) => any;
    upsert: (...args: unknown[]) => any;
    delete: (...args: unknown[]) => any;
  };
};

const dynamicSupabase = supabase as unknown as UntypedSupabase;

function rowToMapping(d: Record<string, unknown>): DIDMapping {
  return {
    did: String(d.did ?? ''),
    tenantId: String(d.tenant_id ?? ''),
    queueId: String(d.queue_id ?? ''),
    label: String(d.label ?? ''),
    branchId: String(d.branch_id ?? ''),
    branchName: String(d.branch_name ?? ''),
    mappingWorkshopName: String(d.workshop_name ?? ''),
    ownerId: String(d.owner_id ?? ''),
  };
}

export async function listDIDMappings(): Promise<DIDMapping[]> {
  const { data, error } = await dynamicSupabase
    .from('did_mappings')
    .select('*')
    .order('did', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((row: Record<string, unknown>) => rowToMapping(row));
}

function toRow(input: DIDMappingInput) {
  return {
    did: input.did.trim(),
    label: input.label.trim(),
    tenant_id: input.tenantId,
    queue_id: input.queueId,
    owner_id: input.ownerUid,
    workshop_name: input.workshopName,
    branch_id: input.branchId,
    branch_name: input.branchName,
  };
}

export async function createDIDMapping(input: DIDMappingInput): Promise<DIDMapping> {
  const { data, error } = await dynamicSupabase
    .from('did_mappings')
    .insert(toRow(input))
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToMapping(data as Record<string, unknown>);
}

/** The DID is the PK — upsert makes "edit" idempotent without extra plumbing. */
export async function upsertDIDMapping(input: DIDMappingInput): Promise<DIDMapping> {
  const { data, error } = await dynamicSupabase
    .from('did_mappings')
    .upsert(toRow(input), { onConflict: 'did' })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToMapping(data as Record<string, unknown>);
}

export async function deleteDIDMapping(did: string): Promise<void> {
  const { error } = await dynamicSupabase.from('did_mappings').delete().eq('did', did);
  if (error) throw new Error(error.message);
}
