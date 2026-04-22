import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  type DocumentData,
} from "firebase/firestore";
import { buildPhoneLookupVariants } from "./dashboardApi";
import type {
  CallerContext,
  CustomerRecord,
  VehicleRecord,
  ServiceRecord,
} from "./types";

// ─── Main: Fetch Caller Context from Firebase ────────────────────────────────

/**
 * Look up a customer in Firebase Firestore by owner UID and phone number.
 *
 * Strategy:
 * 1. Query the root `bookings` collection by phone (all format variants).
 * 2. Filter results by ownerUid client-side (avoids composite Firestore index).
 * 3. Derive customer info, vehicles, and service history directly from those
 *    booking documents — no separate customers subcollection needed.
 */
export async function fetchFirebaseCallerContext(
  ownerUid: string,
  callerNumber: string,
): Promise<CallerContext | null> {
  const variants = buildPhoneLookupVariants(callerNumber);
  if (!ownerUid || variants.length === 0) return null;

  const allBookings = await fetchBookingsByPhone(ownerUid, variants);
  if (allBookings.length === 0) return null;

  // Sort descending by date — most recent booking first
  allBookings.sort((a, b) => {
    const da = String(a.data.date ?? a.data.bookingDate ?? "");
    const db2 = String(b.data.date ?? b.data.bookingDate ?? "");
    return db2.localeCompare(da);
  });

  // Derive customer from the most recent booking
  const latest = allBookings[0];
  const customer = mapBookingToCustomer(latest.id, latest.data, ownerUid);

  // Derive unique vehicles by rego from all bookings
  const vehicles = deriveVehiclesFromBookings(allBookings, ownerUid, customer.id);

  // Map every booking → ServiceRecord and link to matched vehicle by rego
  const services = allBookings
    .map((b) => mapBookingToServiceRecord(b.id, b.data, vehicles))
    .filter((s) => Boolean(s.serviceType));

  return { customer, vehicles, services };
}

// ─── Internal: fetch all bookings for owner+phone ────────────────────────────

interface RawBooking {
  id: string;
  data: DocumentData;
}

/**
 * Queries the root `bookings` collection for documents where a phone field
 * matches any of the given variants. Results are deduplicated and filtered
 * client-side by ownerUid to avoid composite index requirements.
 */
async function fetchBookingsByPhone(
  ownerUid: string,
  variants: string[],
): Promise<RawBooking[]> {
  const bookingsRef = collection(db, "bookings");
  const safeVariants = variants.slice(0, 30); // Firestore 'in' max = 30

  const results = new Map<string, RawBooking>(); // keyed by doc ID to deduplicate

  for (const field of ["clientPhone", "customerPhone", "phone", "contactNumber"]) {
    try {
      const q = query(bookingsRef, where(field, "in", safeVariants));
      const snap = await getDocs(q);
      if (snap.empty) continue;

      for (const doc of snap.docs) {
        const data = doc.data();
        // Client-side ownerUid filter
        const docOwner = String(
          data.ownerUid ?? data.tenantId ?? data.owner_uid ?? "",
        );
        if (docOwner === ownerUid) {
          results.set(doc.id, { id: doc.id, data });
        }
      }
    } catch {
      // Field doesn't exist or has no single-field index — skip silently
    }
  }

  return Array.from(results.values());
}

// ─── Derive customer info from booking ───────────────────────────────────────

function mapBookingToCustomer(
  bookingDocId: string,
  data: DocumentData,
  ownerUid: string,
): CustomerRecord {
  const phone = String(
    data.clientPhone ?? data.customerPhone ?? data.phone ?? "",
  );
  const name = String(
    data.client ?? data.clientName ?? data.customerName ?? data.name ?? "",
  );
  return {
    id: data.customerId ? String(data.customerId) : bookingDocId,
    tenantId: ownerUid,
    name,
    primaryPhone: phone,
    phoneNormalized: phone.replace(/\D/g, ""),
    email:
      data.clientEmail ?? data.customerEmail ?? data.email
        ? String(data.clientEmail ?? data.customerEmail ?? data.email)
        : null,
    address: data.address ? String(data.address) : null,
    notes: data.customerNotes ? String(data.customerNotes) : null,
  };
}

// ─── Derive unique vehicles from bookings ─────────────────────────────────────

/**
 * Builds a deduplicated VehicleRecord list from booking documents.
 * Each unique registration number (vehicleNumber/registrationNumber) becomes
 * one vehicle entry. No subcollection needed.
 */
function deriveVehiclesFromBookings(
  bookings: RawBooking[],
  ownerUid: string,
  customerId: string,
): VehicleRecord[] {
  const seen = new Map<string, VehicleRecord>(); // keyed by normalised rego

  for (const { data } of bookings) {
    const rawRego = String(
      data.vehicleNumber ?? data.registrationNumber ?? data.vehicleRego ?? "",
    ).trim();
    if (!rawRego) continue;

    const key = rawRego.toLowerCase();
    if (seen.has(key)) continue;

    seen.set(key, {
      id: `${customerId}__${key}`,
      tenantId: ownerUid,
      customerId,
      rego: rawRego,
      make: String(data.vehicleMake ?? data.make ?? ""),
      model: String(data.vehicleModel ?? data.model ?? ""),
      year: data.vehicleYear ? Number(data.vehicleYear) : null,
      color:
        data.vehicleColor ?? data.colour
          ? String(data.vehicleColor ?? data.colour)
          : null,
      vin:
        data.vinChassis ?? data.vin
          ? String(data.vinChassis ?? data.vin)
          : null,
      notes: null,
    });
  }

  return Array.from(seen.values());
}

// ─── Map booking → ServiceRecord ─────────────────────────────────────────────

function mapBookingToServiceRecord(
  docId: string,
  data: DocumentData,
  vehicles: VehicleRecord[],
): ServiceRecord {
  const rawRego = String(
    data.vehicleNumber ?? data.registrationNumber ?? data.vehicleRego ?? "",
  ).toLowerCase();
  const matchedVehicle = vehicles.find(
    (v) => v.rego && v.rego.toLowerCase() === rawRego,
  );

  const serviceNames = Array.isArray(data.services)
    ? data.services
        .map((s: Record<string, unknown>) =>
          String(s.serviceName ?? s.name ?? ""),
        )
        .filter(Boolean)
        .join(", ")
    : String(data.serviceType ?? data.service ?? "General Service");

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
    tenantId: String(data.ownerUid ?? data.tenantId ?? ""),
    customerId: String(data.customerId ?? ""),
    vehicleId: matchedVehicle?.id ?? "",
    serviceDate: String(data.date ?? data.bookingDate ?? ""),
    serviceType: serviceNames,
    odometerKm: data.mileage ? Number(data.mileage) : null,
    amount: totalAmount,
    advisorNotes: data.notes ? String(data.notes) : null,
  };
}

// ─── Lightweight name-only lookup (for batch/table use) ──────────────────────

/**
 * Look up just the customer name from Firebase bookings by owner UID and phone.
 * Much cheaper than fetchFirebaseCallerContext — skips vehicles & service history.
 */
export async function fetchCallerNameByPhone(
  _ownerUid: string,
  callerNumber: string,
): Promise<string | null> {
  const variants = buildPhoneLookupVariants(callerNumber);
  if (variants.length === 0) {
    console.warn("[CallerName] Skipped — no phone variants", { callerNumber });
    return null;
  }

  console.log("[CallerName] Looking up", {
    callerNumber,
    variantCount: variants.length,
  });
  try {
    // For name-only lookups we query by phone number alone (no ownerUid filter).
    // The ownerUid passed from CallsTab is typically a Supabase tenant ID
    // (e.g. "t-xxx") which doesn't match the Firebase document's ownerUid field,
    // so filtering by it would return zero results. The phone number is sufficient
    // to identify the customer for display-name purposes.
    const bookings = await fetchBookingsByPhoneOnly(variants);
    if (bookings.length === 0) {
      console.log("[CallerName] Result:", { callerNumber, name: "(no bookings)" });
      return null;
    }

    // Sort descending by date — most recent booking first
    bookings.sort((a, b) => {
      const da = String(a.data.date ?? a.data.bookingDate ?? "");
      const db2 = String(b.data.date ?? b.data.bookingDate ?? "");
      return db2.localeCompare(da);
    });

    // Find the first booking that has a valid name
    const bookingWithName = bookings.find((b) => {
      const d = b.data;
      const n = String(
        d.client ?? d.clientName ?? d.customerName ?? d.name ?? "",
      ).trim();
      return n.length > 0;
    });

    if (!bookingWithName) {
      console.log("[CallerName] Result:", {
        callerNumber,
        name: "(not found)",
      });
      return null;
    }

    const data = bookingWithName.data;
    const name = String(
      data.client ?? data.clientName ?? data.customerName ?? data.name ?? "",
    ).trim();

    console.log("[CallerName] Result:", {
      callerNumber,
      name,
    });
    return name;
  } catch (err) {
    console.error("[CallerName] Error:", err);
    return null;
  }
}

// ─── Phone-only booking lookup (no ownerUid filter) ──────────────────────────

/**
 * Queries the root `bookings` collection for documents where a phone field
 * matches any of the given variants. No ownerUid filtering — used for
 * lightweight name resolution where the phone number alone is sufficient.
 */
async function fetchBookingsByPhoneOnly(
  variants: string[],
): Promise<RawBooking[]> {
  const bookingsRef = collection(db, "bookings");
  const safeVariants = variants.slice(0, 30); // Firestore 'in' max = 30

  const results = new Map<string, RawBooking>(); // keyed by doc ID to deduplicate

  for (const field of ["clientPhone", "customerPhone", "phone", "contactNumber"]) {
    try {
      const q = query(bookingsRef, where(field, "in", safeVariants));
      const snap = await getDocs(q);
      if (snap.empty) continue;

      for (const doc of snap.docs) {
        results.set(doc.id, { id: doc.id, data: doc.data() });
      }
    } catch {
      // Field doesn't exist or has no single-field index — skip silently
    }
  }

  return Array.from(results.values());
}
