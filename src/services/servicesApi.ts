import { db, auth } from '@/lib/firebase';
import { getIdToken, signInWithEmailAndPassword } from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChecklistItem = {
  name: string;
  description: string;
  done: boolean;      // false by default — toggled by staff during bookings
  imageUrl: string;   // staff uploads image after task completion
};

export type WorkshopService = {
  id: string;
  ownerUid: string;
  name: string;
  price: number;
  duration: number;   // minutes
  icon?: string | null;
  imageUrl?: string | null;
  reviews?: number | null;
  branches: string[];
  staffIds: string[];
  checklist: ChecklistItem[];
  completionImageUrl?: string | null;
};

export type ServiceInput = {
  name: string;
  price: number;
  duration: number;   // minutes
  icon?: string;
  imageUrl?: string;
  reviews?: number;
  branches: string[];
  staffIds: string[];
  checklist?: ChecklistItem[];
  completionImageUrl?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const normalizeChecklist = (raw: unknown[]): ChecklistItem[] =>
  (raw ?? []).map((item) => {
    if (typeof item === 'string') return { name: item, description: '', done: false, imageUrl: '' };
    const i = item as Record<string, unknown>;
    return {
      name: String(i.name ?? ''),
      description: String(i.description ?? ''),
      done: !!i.done,
      imageUrl: String(i.imageUrl ?? ''),
    };
  });

async function addServiceToBranch(branchId: string, serviceId: string) {
  await updateDoc(doc(db, 'branches', branchId), {
    serviceIds: arrayUnion(serviceId),
    updatedAt: serverTimestamp(),
  });
}

async function removeServiceFromBranch(branchId: string, serviceId: string) {
  await updateDoc(doc(db, 'branches', branchId), {
    serviceIds: arrayRemove(serviceId),
    updatedAt: serverTimestamp(),
  });
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createService(ownerUid: string, data: ServiceInput): Promise<string> {
  const ref = await addDoc(collection(db, 'services'), {
    ownerUid,
    ...data,
    checklist: data.checklist ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (data.branches.length > 0) {
    await Promise.all(data.branches.map((id) => addServiceToBranch(id, ref.id)));
  }

  return ref.id;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateService(serviceId: string, data: Partial<ServiceInput>): Promise<void> {
  const serviceRef = doc(db, 'services', serviceId);
  const snap = await getDoc(serviceRef);
  const current = snap.data();

  const oldBranches: string[] = current?.branches ?? [];
  const newBranches: string[] = data.branches ?? oldBranches;
  const toAdd    = newBranches.filter((b) => !oldBranches.includes(b));
  const toRemove = oldBranches.filter((b) => !newBranches.includes(b));

  await updateDoc(serviceRef, { ...data, updatedAt: serverTimestamp() });

  await Promise.all([
    ...toAdd.map((id) => addServiceToBranch(id, serviceId)),
    ...toRemove.map((id) => removeServiceFromBranch(id, serviceId)),
  ]);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteService(serviceId: string): Promise<void> {
  const serviceRef = doc(db, 'services', serviceId);
  const snap = await getDoc(serviceRef);
  const branches: string[] = snap.data()?.branches ?? [];

  if (branches.length > 0) {
    await Promise.all(branches.map((id) => removeServiceFromBranch(id, serviceId)));
  }

  await deleteDoc(serviceRef);
}

// ─── Subscribe (real-time) ────────────────────────────────────────────────────

export function subscribeServices(
  ownerUid: string,
  onChange: (rows: WorkshopService[]) => void,
): () => void {
  const q = query(collection(db, 'services'), where('ownerUid', '==', ownerUid));

  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs.map((d) => {
          const raw = d.data() as DocumentData;
          return {
            id: d.id,
            ownerUid: String(raw.ownerUid ?? ''),
            name: String(raw.name ?? ''),
            price: Number(raw.price ?? 0),
            duration: Number(raw.duration ?? 0),
            icon: raw.icon ?? null,
            imageUrl: raw.imageUrl ?? null,
            reviews: raw.reviews != null ? Number(raw.reviews) : null,
            branches: Array.isArray(raw.branches) ? raw.branches : [],
            staffIds: Array.isArray(raw.staffIds) ? raw.staffIds : [],
            checklist: normalizeChecklist(Array.isArray(raw.checklist) ? raw.checklist : []),
            completionImageUrl: raw.completionImageUrl ?? null,
          } satisfies WorkshopService;
        }),
      );
    },
    (error) => {
      if (error.code === 'permission-denied') {
        console.warn('[servicesApi] permission denied — user may not be authenticated');
        onChange([]);
      } else {
        console.error('[servicesApi] snapshot error:', error);
        onChange([]);
      }
    },
  );
}

// ─── REST API helpers ─────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_BMS_API_URL as string ?? 'https://black.bmspros.com.au/api/call-center';
const STATIC_TOKEN = import.meta.env.VITE_BMS_BEARER_TOKEN as string ?? '';

async function apiHeaders(ownerUid: string): Promise<HeadersInit> {
  let user = auth.currentUser;

  // Auto-login fallback if the dashboard user is not logged in directly to Firebase
  if (!user) {
    const email = import.meta.env.VITE_FIREBASE_AGENT_EMAIL as string;
    const password = import.meta.env.VITE_FIREBASE_AGENT_PASSWORD as string;
    if (email && password) {
      try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        user = cred.user;
      } catch (err) {
        console.error('[servicesApi] Auto-login failed:', err);
      }
    }
  }

  const token = user ? await getIdToken(user) : STATIC_TOKEN;
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Tenant-Id': ownerUid,
  };
}

/** GET /services — all services for a workshop */
export async function getServices(ownerUid: string): Promise<WorkshopService[]> {
  const res = await fetch(`${BASE_URL}/services`, { headers: await apiHeaders(ownerUid) });
  if (!res.ok) throw new Error(`getServices failed: ${res.status}`);
  const json = await res.json();
  return json.services ?? [];
}

/** GET /services?branchId=X — services filtered to a specific branch */
export async function getServicesByBranch(ownerUid: string, branchId: string): Promise<WorkshopService[]> {
  const url = `${BASE_URL}/services?branchId=${encodeURIComponent(branchId)}`;
  const res = await fetch(url, { headers: await apiHeaders(ownerUid) });
  if (!res.ok) throw new Error(`getServicesByBranch failed: ${res.status}`);
  const json = await res.json();
  return json.services ?? [];
}

/** GET /services/:id — full service detail with checklist, branches, staff */
export async function getServiceById(ownerUid: string, serviceId: string): Promise<WorkshopService | null> {
  const res = await fetch(`${BASE_URL}/services/${encodeURIComponent(serviceId)}`, { headers: await apiHeaders(ownerUid) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getServiceById failed: ${res.status}`);
  const json = await res.json();
  return json.service ?? null;
}
