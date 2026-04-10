declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

// @ts-ignore Supabase Edge Functions resolve this remote ESM import at runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Max-Age": "86400",
};

type AgentColumn = {
  column_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  udt_name: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is super-admin or client-admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!roleData || !["super-admin", "client-admin"].includes(roleData.role)) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      name, email, phone, password,
      extension = "", notes = "",
    } = body;

    if (!name || !email || !password) {
      return new Response(
        JSON.stringify({ error: "name, email, and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create auth user
    const { data: newUser, error: userErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: name },
    });
    if (userErr) {
      return new Response(JSON.stringify({ error: userErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    // 2. Assign agent role
    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: "agent",
    });
    if (roleErr) {
      return new Response(JSON.stringify({ error: `Failed to assign role: ${roleErr.message}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Create agent record using fallback payloads for schema differences
    const agentId = `agent-${Date.now()}`;
    const normalizedPhone = String(phone ?? "").trim();
    const agentBase: Record<string, unknown> = {
      id: agentId,
      user_id: userId,
      name,
      extension: extension || "",
      notes: notes || "",
      email,
      status: "offline",
      role: "agent",
    };
    const insertCandidates: Record<string, unknown>[] = [
      { ...agentBase, phone_number: normalizedPhone, queue_ids: [] },
      { ...agentBase, phone: normalizedPhone, queue_ids: [] },
      { ...agentBase, phone_number: normalizedPhone },
      { ...agentBase, phone: normalizedPhone },
      { id: agentId, user_id: userId, name, queue_ids: [], status: "offline" },
      { id: agentId, user_id: userId, name, status: "offline" },
    ];

    let agentErr: { message: string } | null = null;
    for (const payload of insertCandidates) {
      const result = await supabaseAdmin.from("agents").insert(payload);
      if (!result.error) {
        agentErr = null;
        break;
      }
      const msg = result.error.message || "";
      const unknownColumn = msg.includes("Could not find the") && msg.includes("column");
      if (unknownColumn) {
        agentErr = result.error;
        continue;
      }
      agentErr = result.error;
    }

    if (agentErr) {
      return new Response(JSON.stringify({ error: `Failed to create agent record: ${agentErr.message}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, agentId, userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
