// Team Gemini backend — key stored once as a Supabase secret (never in the browser).
// Deploy: supabase secrets set GEMINI_API_KEY=... && supabase functions deploy gemini

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: { message: 'Sign in required.' } }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return json({ error: { message: 'Unauthorized.' } }, 401);
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return json(
        {
          error: {
            message:
              'GEMINI_API_KEY not set on server. Admin: supabase secrets set GEMINI_API_KEY=...',
          },
        },
        500,
      );
    }

    const body = await req.json();
    const model = body.model || 'gemini-2.0-flash';
    const parts = body.parts || [{ text: 'OK' }];
    const payload: Record<string, unknown> = {
      contents: [{ parts }],
    };
    if (body.jsonMode) {
      payload.generationConfig = { responseMimeType: 'application/json' };
    }

    const url = `${GEMINI_BASE}/${model}:generateContent?key=${geminiKey}`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
      return json(geminiData, geminiRes.status);
    }

    let text = '';
    try {
      text = geminiData.candidates[0].content.parts[0].text;
    } catch {
      text = '';
    }
    return json({ text, raw: geminiData }, 200);
  } catch (e) {
    return json({ error: { message: String(e) } }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
