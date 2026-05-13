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
