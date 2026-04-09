import { db, auth } from "@/lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit as firestoreLimit,
  type DocumentData,
} from "firebase/firestore";
import { buildPhoneLookupVariants } from "./dashboardApi";
import type {
  CallerContext,
  CustomerRecord,
  VehicleRecord,
  ServiceRecord,
} from "./types";

// ─── Ensure Firebase Auth ────────────────────────────────────────────────────

async function ensureFirebaseAuth(): Promise<void> {
  if (auth.currentUser) return;
  const email = import.meta.env.VITE_FIREBASE_AGENT_EMAIL as string;
  const password = import.meta.env.VITE_FIREBASE_AGENT_PASSWORD as string;
  if (email && password) {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error("[customersApi] Auto-login failed:", err);
    }
  }
}

// ─── Main: Fetch Caller Context from Firebase ────────────────────────────────

/**
 * Look up a customer in Firebase Firestore by owner UID and phone number.
 * Returns the customer profile, their vehicles, and past service history
 * (derived from completed bookings).
 */
export async function fetchFirebaseCallerContext(
  ownerUid: string,
  callerNumber: string,
): Promise<CallerContext | null> {
  const variants = buildPhoneLookupVariants(callerNumber);
  if (!ownerUid || variants.length === 0) return null;

  await ensureFirebaseAuth();

  // 1. Find customer by phone number
  const customer = await findCustomerByPhone(ownerUid, variants);
  if (!customer) {
    console.info(
      `[customersApi] No Firebase customer found for owner=${ownerUid}, phone variants=`,
      variants,
    );
    return null;
  }

  console.info(
    `[customersApi] Found Firebase customer: ${customer.name} (${customer.id})`,
  );

  // 2. Fetch vehicles for this customer
  const vehicles = await fetchCustomerVehicles(ownerUid, customer.id);

  // 3. Fetch past service history (completed bookings)
  const services = await fetchCustomerServiceHistory(
    ownerUid,
    customer.id,
    customer.primaryPhone,
    vehicles,
  );

  return { customer, vehicles, services };
}

// ─── Customer Lookup ─────────────────────────────────────────────────────────

/**
 * Searches the `customers` Firestore collection for a matching phone number.
 * Tries multiple phone field names to handle schema variations.
 */
async function findCustomerByPhone(
  ownerUid: string,
  phoneVariants: string[],
): Promise<CustomerRecord | null> {
  const customersRef = collection(db, "customers");
  // Firestore 'in' supports max 30 values
  const variants = phoneVariants.slice(0, 30);

  // Try common phone field names in priority order
  for (const field of ["phone", "mobile", "phoneNumber", "contactNumber"]) {
    try {
      const q = query(
        customersRef,
        where(field, "in", variants),
      );
      const snap = await getDocs(q);
      
      // Client-side filter to resolve missing composite index
      const matchedDoc = snap.docs.find(
        (d) => String(d.data().ownerUid) === ownerUid || String(d.data().tenantId) === ownerUid
      );
      
      if (matchedDoc) {
        return mapFirebaseCustomer(matchedDoc.id, matchedDoc.data());
      }
    } catch (error) {
      console.error(`[customersApi] Error querying customers by ${field}:`, error);
      // Field may not exist or have no index — silently try next
    }
  }

  return null;
}

function mapFirebaseCustomer(
  docId: string,
  data: DocumentData,
): CustomerRecord {
  const phone = String(
    data.phone ?? data.mobile ?? data.phoneNumber ?? data.contactNumber ?? "",
  );
  return {
    id: docId,
    tenantId: String(data.ownerUid ?? ""),
    name: String(data.name ?? data.customerName ?? ""),
    primaryPhone: phone,
    phoneNormalized: phone.replace(/\D/g, ""),
    email: data.email ? String(data.email) : null,
    address: data.address ? String(data.address) : null,
    notes: data.notes ? String(data.notes) : null,
  };
}

// ─── Vehicles (subcollection: customers/{customerId}/vehicles) ───────────────

async function fetchCustomerVehicles(
  ownerUid: string,
  customerId: string,
): Promise<VehicleRecord[]> {
  try {
    // Vehicles are a subcollection under the customer document
    const vehiclesRef = collection(db, "customers", customerId, "vehicles");
    const snap = await getDocs(vehiclesRef);

    if (snap.empty) {
      console.info(
        `[customersApi] No vehicles found in subcollection for customer=${customerId}`,
      );
      return [];
    }

    console.info(
      `[customersApi] Found ${snap.size} vehicle(s) for customer=${customerId}`,
    );

    return snap.docs.map((d) =>
      mapFirebaseVehicle(d.id, d.data(), ownerUid, customerId),
    );
  } catch (err) {
    console.warn("[customersApi] Failed to fetch vehicles:", err);
    return [];
  }
}

function mapFirebaseVehicle(
  docId: string,
  data: DocumentData,
  ownerUid: string,
  customerId: string,
): VehicleRecord {
  return {
    id: docId,
    tenantId: ownerUid,
    customerId: customerId,
    rego: String(data.registrationNumber ?? ""),
    make: String(data.make ?? ""),
    model: String(data.model ?? ""),
    year: data.year ? Number(data.year) : null,
    color: data.colour ? String(data.colour) : null,
    vin: data.vinChassis ? String(data.vinChassis) : null,
    notes: data.notes ? String(data.notes) : null,
  };
}

// ─── Service History (from completed bookings) ───────────────────────────────

/**
 * Fetches the customer's past bookings and maps them to ServiceRecord[].
 * Queries by customerId first, then falls back to phone-based lookup.
 */
async function fetchCustomerServiceHistory(
  ownerUid: string,
  customerId: string,
  customerPhone: string,
  vehicles: VehicleRecord[],
): Promise<ServiceRecord[]> {
  const bookingsRef = collection(db, "bookings");

  // 1. Try by customerId
  let records = await queryBookingsAsServices(
    bookingsRef,
    ownerUid,
    "customerId",
    customerId,
    vehicles,
  );

  // 2. Fallback: query by phone if no results by customerId
  if (records.length === 0 && customerPhone) {
    const variants = buildPhoneLookupVariants(customerPhone).slice(0, 30);
    for (const variant of variants) {
      records = await queryBookingsAsServices(
        bookingsRef,
        ownerUid,
        "clientPhone",
        variant,
        vehicles,
      );
      if (records.length > 0) break;
    }
  }

  return records;
}

async function queryBookingsAsServices(
  bookingsRef: ReturnType<typeof collection>,
  ownerUid: string,
  filterField: string,
  filterValue: string,
  vehicles: VehicleRecord[],
): Promise<ServiceRecord[]> {
  try {
    const q = query(
      bookingsRef,
      where(filterField, "==", filterValue),
    );
    const snap = await getDocs(q);
    
    // Client-side filter and sort to prevent composite index errors
    const validDocs = snap.docs.filter((d) => {
      const data = d.data();
      return String(data.ownerUid) === ownerUid || String(data.tenantId) === ownerUid;
    });

    validDocs.sort((a, b) => {
      const dateA = String(a.data().date ?? "");
      const dateB = String(b.data().date ?? "");
      return dateB.localeCompare(dateA); // Descending
    });

    return validDocs.slice(0, 20).map((d) =>
      mapBookingToServiceRecord(d.id, d.data(), vehicles),
    );
  } catch (err) {
    console.warn(`[customersApi] queryBookingsAsServices failed:`, err);
    return [];
  }
}

function mapBookingToServiceRecord(
  docId: string,
  data: DocumentData,
  vehicles: VehicleRecord[],
): ServiceRecord {
  // Match vehicle by rego
  const vehicleNumber = String(
    data.vehicleNumber ?? data.vehicleRego ?? "",
  ).toLowerCase();
  const matchedVehicle = vehicles.find(
    (v) => v.rego && v.rego.toLowerCase() === vehicleNumber,
  );

  // Build service name from booking services array or service type
  const serviceNames = Array.isArray(data.services)
    ? data.services
        .map((s: Record<string, unknown>) =>
          String(s.serviceName ?? s.name ?? ""),
        )
        .filter(Boolean)
        .join(", ")
    : String(data.serviceType ?? "General Service");

  // Calculate total amount from services
  const totalAmount = Array.isArray(data.services)
    ? data.services.reduce(
        (sum: number, s: Record<string, unknown>) => sum + Number(s.price ?? 0),
        0,
      )
    : data.totalPrice
      ? Number(data.totalPrice)
      : null;

  return {
    id: docId,
    tenantId: String(data.ownerUid ?? ""),
    customerId: String(data.customerId ?? ""),
    vehicleId: matchedVehicle?.id ?? "",
    serviceDate: String(data.date ?? ""),
    serviceType: serviceNames,
    odometerKm: data.mileage ? Number(data.mileage) : null,
    amount: totalAmount,
    advisorNotes: data.notes ? String(data.notes) : null,
  };
}
