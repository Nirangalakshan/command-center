declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

// ═══════════════════════════════════════════════════════════
// get-sdk-sign — Supabase Edge Function
// Generates a Yeastar Linkus SDK login signature for a given
// agent email. The sign is required to initialise the
// ys-webrtc-sdk-core WebRTC softphone in the browser.
//
// Secrets to set (npx supabase secrets set):
//   YEASTAR_PBX_URL         e.g. https://mypbx.ras.yeastar.com
//   YEASTAR_SDK_ACCESS_ID   Linkus SDK → AccessID
//   YEASTAR_SDK_ACCESS_KEY  Linkus SDK → AccessKey
// ═══════════════════════════════════════════════════════════

const PBX_URL = (Deno.env.get('YEASTAR_PBX_URL') ?? '').replace(/\/$/, '');
const SDK_ACCESS_ID = Deno.env.get('YEASTAR_SDK_ACCESS_ID') ?? '';
const SDK_ACCESS_KEY = Deno.env.get('YEASTAR_SDK_ACCESS_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  let email: string;
  try {
    const body = await req.json();
    email = body?.email;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return json({ error: 'A valid agent email is required' }, 400);
  }

  if (!PBX_URL || !SDK_ACCESS_ID || !SDK_ACCESS_KEY) {
    console.error('[get-sdk-sign] Missing Yeastar SDK secrets');
    return json({ error: 'Yeastar Linkus SDK not configured on server' }, 500);
  }

  try {
    // ── Step 1: Obtain PBX access token ──────────────────────
    const tokenRes = await fetch(`${PBX_URL}/openapi/v1.0/get_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: SDK_ACCESS_ID,
        password: SDK_ACCESS_KEY,
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`PBX token endpoint returned HTTP ${tokenRes.status}`);
    }

    const tokenData: { errcode: number; errmsg: string; access_token?: string } =
      await tokenRes.json();

    if (tokenData.errcode !== 0 || !tokenData.access_token) {
      throw new Error(`PBX token error ${tokenData.errcode}: ${tokenData.errmsg}`);
    }

    const accessToken = tokenData.access_token;

    // ── Step 2: Create SDK sign for the agent's email ─────────
    const signRes = await fetch(
      `${PBX_URL}/openapi/v1.0/sign/create?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: email,
          sign_type: 'sdk',
          expire_time: 0,
        }),
      }
    );

    if (!signRes.ok) {
      throw new Error(`PBX sign endpoint returned HTTP ${signRes.status}`);
    }

    const signData: {
      errcode: number;
      errmsg: string;
      data?: { sign?: string };
    } = await signRes.json();

    if (signData.errcode !== 0 || !signData.data?.sign) {
      throw new Error(`PBX sign error ${signData.errcode}: ${signData.errmsg}`);
    }

    return json({ sign: signData.data.sign });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[get-sdk-sign] ${msg}`);
    return json({ error: msg }, 500);
  }
});
