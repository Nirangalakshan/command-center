// Supabase Edge Function: yeastar-api proxy
// Solves CORS and hides PBX credentials from the browser.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const PBX_URL = Deno.env.get('YEASTAR_PBX_URL') || '';
    if (!PBX_URL) {
      console.error('[yeastar-api] ERROR: YEASTAR_PBX_URL secret is missing');
      return new Response(JSON.stringify({ error: 'PBX URL not configured on server' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const bodyData = await req.json();

    /** Stream authenticated PBX `/api/download/…` URLs to the browser (avoids RAS CORS on `<audio>`). */
    const relayFromPbx =
      typeof bodyData.relay_from_pbx === 'string'
        ? bodyData.relay_from_pbx.trim()
        : '';

    if (relayFromPbx) {
      let target: URL;
      try {
        target = new URL(relayFromPbx);
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid relay URL' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const allowedOrigin = new URL(PBX_URL.replace(/\/$/, '')).origin;
      if (target.origin !== allowedOrigin) {
        return new Response(JSON.stringify({ error: 'relay target origin not allowed' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const safeLogged = `${target.pathname}${target.search ? '?…' : ''}`;
      console.log(`[yeastar-api] Relay stream from PBX: ${safeLogged}`);

      const accessToken =
        target.searchParams.get('access_token') ??
        target.searchParams.get('token') ??
        '';

      const upstreamHeaders: Record<string, string> = {
        Accept: 'audio/wav,audio/mpeg,audio/*,*/*',
        'User-Agent': 'CommandCentre/1.0',
      };
      /** RAS often serves HTML login shell unless Bearer is sent — query token alone may be ignored. */
      if (accessToken) {
        upstreamHeaders.Authorization = `Bearer ${accessToken}`;
      }

      const upstream = await fetch(relayFromPbx, {
        method: 'GET',
        headers: upstreamHeaders,
      });

      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => '');
        console.error(`[yeastar-api] Relay PBX HTTP ${upstream.status}: ${detail.slice(0, 400)}`);
        return new Response(
          JSON.stringify({
            error: 'PBX recording fetch failed',
            pbx_status: upstream.status,
            detail: detail.slice(0, 800),
          }),
          {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      const rawCt = upstream.headers.get('content-type') || '';
      const ctLower = rawCt.toLowerCase();
      if (ctLower.includes('application/json') || ctLower.includes('text/html')) {
        const detail = await upstream.text();
        console.error(`[yeastar-api] Relay expected audio, got ${rawCt}: ${detail.slice(0, 400)}`);
        return new Response(
          JSON.stringify({
            error: 'PBX returned non-audio body (bad token or URL?)',
            hint:
              'Enable Recording → Download permission on your Open API app so the app uses /openapi/v1.0/recording/download (temporary /api/download/… link). Raw /cdr_recording/… URLs often require portal session, not only access_token.',
            content_type: rawCt,
            detail: detail.slice(0, 800),
          }),
          {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      const out = new Headers(corsHeaders);
      if (rawCt) out.set('Content-Type', rawCt);
      const cl = upstream.headers.get('content-length');
      if (cl) out.set('Content-Length', cl);

      return new Response(upstream.body, {
        status: upstream.status,
        headers: out,
      });
    }

    const { endpoint, method, body, params, headers: customHeaders } = bodyData;

    if (!endpoint) {
      return new Response(JSON.stringify({ error: 'Missing endpoint' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build URL
    const base = PBX_URL.replace(/\/$/, '');
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    let finalUrl = `${base}${path}`;

    if (params) {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          qs.append(key, String(value))
        }
      });
      const queryString = qs.toString();
      if (queryString) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + queryString;
      }
    }

    console.log(`[yeastar-api] Forwarding to: ${method || 'GET'} ${finalUrl}`);

    const pbxHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'CommandCentre/1.0',
    };

    // IMPORTANT: Only forward Authorization if explicitly provided in the BODY's headers.
    // Supabase.functions.invoke adds its own Authorization header which confuses the PBX.
    if (customHeaders?.Authorization) {
      pbxHeaders['Authorization'] = customHeaders.Authorization;
    } else if (customHeaders?.authorization) {
      pbxHeaders['Authorization'] = customHeaders.authorization;
    }

    const response = await fetch(finalUrl, {
      method: method || 'GET',
      headers: pbxHeaders,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    console.log(`[yeastar-api] PBX response status: ${response.status}`);

    const contentType = response.headers.get('content-type') || '';
    let responseData;
    if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      const text = await response.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        responseData = { text };
      }
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: response.status,
    });
  } catch (error) {
    console.error('[yeastar-api] UNCAUGHT ERROR:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})
