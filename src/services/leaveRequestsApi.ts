import { supabase } from "@/integrations/supabase/client";

export const LEAVE_DURATION_TYPES = ["full_day", "half_day"] as const;
export type LeaveDurationType = (typeof LEAVE_DURATION_TYPES)[number];

export const LEAVE_HALF_DAY_PARTS = ["am", "pm"] as const;
export type LeaveHalfDayPart = (typeof LEAVE_HALF_DAY_PARTS)[number];

export const LEAVE_REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

export type AgentLeaveRequestRow = {
  id: string;
  user_id: string;
  tenant_id: string | null;
  agent_display_name: string | null;
  start_date: string;
  end_date: string;
  duration_type: string;
  half_day_part: string | null;
  reason: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  attachment_storage_path: string | null;
  created_at: string;
};

export const LEAVE_ATTACHMENTS_BUCKET = "leave-request-attachments";

export const LEAVE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

function normalizeLeaveAttachmentExt(file: File): string {
  if (file.type && ALLOWED_IMAGE_TYPES.has(file.type)) {
    if (file.type === "image/jpeg") return "jpg";
    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";
    if (file.type === "image/gif") return "gif";
    if (file.type === "image/heic" || file.type === "image/heif") return "heic";
  }
  const tail = file.name.split(".").pop()?.toLowerCase();
  if (tail && ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(tail)) {
    return tail === "jpeg" ? "jpg" : tail;
  }
  throw new Error("Please choose a JPEG, PNG, WebP, GIF, or HEIC image.");
}

function assertValidLeaveAttachment(file: File): void {
  if (!file.size) throw new Error("Image is empty.");
  if (file.size > LEAVE_ATTACHMENT_MAX_BYTES) throw new Error("Image must be 5 MB or smaller.");
  if (file.type && !ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Please choose a JPEG, PNG, WebP, GIF, or HEIC image.");
  }
  normalizeLeaveAttachmentExt(file);
}

const SELECT_FIELDS =
  "id,user_id,tenant_id,agent_display_name,start_date,end_date,duration_type,half_day_part,reason,status,reviewed_by,reviewed_at,review_comment,attachment_storage_path,created_at";

/** Signed URL for agents or super-admins (storage RLS allows both). */
export async function getLeaveRequestAttachmentSignedUrl(
  storagePath: string,
  expiresSec = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(LEAVE_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresSec);
  if (error) throw new Error(error.message);
  if (!data?.signedUrl) throw new Error("Could not create link for this image.");
  return data.signedUrl;
}

export function formatLeaveDurationLabel(row: Pick<AgentLeaveRequestRow, "duration_type" | "half_day_part">): string {
  if (row.duration_type === "full_day") return "Full day";
  return row.half_day_part === "am" ? "Half day (AM)" : "Half day (PM)";
}

export function formatLeaveDateRange(row: Pick<AgentLeaveRequestRow, "start_date" | "end_date">): string {
  if (row.start_date === row.end_date) return row.start_date;
  return `${row.start_date} → ${row.end_date}`;
}

export async function fetchMyLeaveRequests(userId: string): Promise<AgentLeaveRequestRow[]> {
  const { data, error } = await supabase
    .from("agent_leave_requests")
    .select(SELECT_FIELDS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as AgentLeaveRequestRow[];
}

export async function fetchAllLeaveRequests(): Promise<AgentLeaveRequestRow[]> {
  const { data, error } = await supabase
    .from("agent_leave_requests")
    .select(SELECT_FIELDS)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return (data || []) as AgentLeaveRequestRow[];
}

export async function insertLeaveRequest(opts: {
  userId: string;
  tenantId: string | null;
  displayName: string;
  startDate: string;
  endDate: string;
  durationType: LeaveDurationType;
  halfDayPart: LeaveHalfDayPart | null;
  reason: string | null;
  attachmentFile?: File | null;
}): Promise<void> {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData.user || authData.user.id !== opts.userId) {
    throw new Error("Sign in with your dashboard account to submit leave.");
  }

  if (opts.endDate < opts.startDate) {
    throw new Error("End date must be on or after the start date.");
  }

  const maxSpanDays = 60;
  const start = new Date(`${opts.startDate}T12:00:00`);
  const end = new Date(`${opts.endDate}T12:00:00`);
  const span = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (span > maxSpanDays) {
    throw new Error(`Leave cannot exceed ${maxSpanDays} days per request.`);
  }

  if (opts.durationType === "half_day" && !opts.halfDayPart) {
    throw new Error("Choose morning or afternoon for a half-day leave.");
  }

  const requestId = crypto.randomUUID();
  let attachment_storage_path: string | null = null;

  if (opts.attachmentFile && opts.attachmentFile.size > 0) {
    assertValidLeaveAttachment(opts.attachmentFile);
    const ext = normalizeLeaveAttachmentExt(opts.attachmentFile);
    attachment_storage_path = `${opts.userId}/${requestId}.${ext}`;
    const contentType =
      opts.attachmentFile.type ||
      (ext === "jpg"
        ? "image/jpeg"
        : ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : ext === "gif"
              ? "image/gif"
              : ext === "heic"
                ? "image/heic"
                : `image/${ext}`);
    const { error: upErr } = await supabase.storage
      .from(LEAVE_ATTACHMENTS_BUCKET)
      .upload(attachment_storage_path, opts.attachmentFile, {
        cacheControl: "3600",
        upsert: false,
        contentType,
      });
    if (upErr) throw new Error(upErr.message);
  }

  const { error } = await supabase.from("agent_leave_requests").insert({
    id: requestId,
    user_id: opts.userId,
    tenant_id: opts.tenantId,
    agent_display_name: opts.displayName || null,
    start_date: opts.startDate,
    end_date: opts.endDate,
    duration_type: opts.durationType,
    half_day_part: opts.durationType === "full_day" ? null : opts.halfDayPart,
    reason: opts.reason?.trim() || null,
    attachment_storage_path,
  });

  if (error) {
    if (attachment_storage_path) {
      await supabase.storage.from(LEAVE_ATTACHMENTS_BUCKET).remove([attachment_storage_path]);
    }
    throw new Error(error.message);
  }
}

export async function deleteMyPendingLeaveRequest(userId: string, requestId: string): Promise<void> {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData.user || authData.user.id !== userId) {
    throw new Error("Sign in with your dashboard account.");
  }

  const { data: row, error: selErr } = await supabase
    .from("agent_leave_requests")
    .select("attachment_storage_path")
    .eq("id", requestId)
    .eq("user_id", userId)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);

  if (row?.attachment_storage_path) {
    await supabase.storage.from(LEAVE_ATTACHMENTS_BUCKET).remove([row.attachment_storage_path]);
  }

  const { error } = await supabase.from("agent_leave_requests").delete().eq("id", requestId).eq("user_id", userId);

  if (error) throw new Error(error.message);
}

export async function reviewLeaveRequest(opts: {
  requestId: string;
  decision: Exclude<LeaveRequestStatus, "pending">;
  reviewComment: string | null;
}): Promise<void> {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData.user) {
    throw new Error("Sign in as super-admin to review leave.");
  }

  const { error } = await supabase
    .from("agent_leave_requests")
    .update({
      status: opts.decision,
      reviewed_by: authData.user.id,
      reviewed_at: new Date().toISOString(),
      review_comment: opts.reviewComment?.trim() || null,
    })
    .eq("id", opts.requestId)
    .eq("status", "pending");

  if (error) throw new Error(error.message);
}

export function subscribeToMyLeaveRequests(
  userId: string,
  onChange: (row: AgentLeaveRequestRow, event: "INSERT" | "UPDATE" | "DELETE") => void,
): () => void {
  const channel = supabase
    .channel(`leave-requests-self-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "agent_leave_requests",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const ev = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
        if (ev === "DELETE") {
          const oldRow = payload.old as AgentLeaveRequestRow | undefined;
          if (oldRow?.id) onChange(oldRow, "DELETE");
          return;
        }
        const row = payload.new as AgentLeaveRequestRow;
        if (row) onChange(row, ev);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToAllLeaveRequestChanges(
  onChange: (row: AgentLeaveRequestRow, event: "INSERT" | "UPDATE" | "DELETE") => void,
): () => void {
  const channel = supabase
    .channel("leave-requests-super-admin")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "agent_leave_requests",
      },
      (payload) => {
        const ev = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
        if (ev === "DELETE") {
          const oldRow = payload.old as AgentLeaveRequestRow | undefined;
          if (oldRow?.id) onChange(oldRow, "DELETE");
          return;
        }
        const row = payload.new as AgentLeaveRequestRow;
        if (row) onChange(row, ev);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
