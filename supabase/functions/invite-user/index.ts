const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = "https://projekt.jkprojekt.se";
const ALLOWED_ORIGINS = new Set([APP_URL, "http://127.0.0.1:5173", "http://localhost:5173"]);
const INTERNAL_ROLES = new Set(["admin", "projektledare", "ekonomi", "lasare"]);

type InviteRequest = {
  account_type?: "internal" | "customer";
  full_name?: string;
  email?: string;
  role?: string;
  customer_id?: string;
  contact_person_id?: string | null;
};

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : APP_URL;
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

async function api(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

async function rowExists(table: string, query: string) {
  const response = await api(`/rest/v1/${table}?${query}&select=id&limit=1`);
  if (!response.ok) throw new Error(`Could not validate ${table}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origin not allowed" }, 403, origin);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return json({ error: "Invitation service is not configured" }, 500, origin);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401, origin);

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: authorization },
  });
  if (!userResponse.ok) return json({ error: "Invalid session" }, 401, origin);
  const requester = await userResponse.json();

  const adminResponse = await api(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(requester.id)}&role=eq.admin&status=eq.aktiv&select=id,org_id`
  );
  const admins = adminResponse.ok ? await adminResponse.json() : [];
  const admin = Array.isArray(admins) ? admins[0] : null;
  if (!admin) return json({ error: "Only an active administrator can invite users" }, 403, origin);

  let body: InviteRequest;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400, origin);
  }

  const accountType = body.account_type;
  const fullName = body.full_name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!accountType || !["internal", "customer"].includes(accountType)) {
    return json({ error: "Invalid account type" }, 400, origin);
  }
  if (fullName.length < 2 || fullName.length > 120) return json({ error: "Invalid name" }, 400, origin);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ error: "Invalid email address" }, 400, origin);
  }

  const encodedEmail = encodeURIComponent(email);
  if (
    await rowExists("profiles", `email=ilike.${encodedEmail}`) ||
    await rowExists("customer_users", `email=ilike.${encodedEmail}`)
  ) {
    return json({ error: "Det finns redan ett konto med den e-postadressen." }, 409, origin);
  }

  let profilePayload: Record<string, unknown>;
  if (accountType === "internal") {
    if (!body.role || !INTERNAL_ROLES.has(body.role)) return json({ error: "Invalid role" }, 400, origin);
    profilePayload = {
      org_id: admin.org_id,
      full_name: fullName,
      email,
      role: body.role,
      status: "inbjuden",
      initials: initials(fullName),
      invited_at: new Date().toISOString(),
    };
  } else {
    if (!body.customer_id) return json({ error: "Customer is required" }, 400, origin);
    const customerId = encodeURIComponent(body.customer_id);
    const customerResponse = await api(
      `/rest/v1/customers?id=eq.${customerId}&org_id=eq.${encodeURIComponent(admin.org_id)}&select=id`
    );
    const customers = customerResponse.ok ? await customerResponse.json() : [];
    if (!Array.isArray(customers) || customers.length !== 1) return json({ error: "Customer not found" }, 404, origin);

    if (body.contact_person_id) {
      const contactResponse = await api(
        `/rest/v1/contact_persons?id=eq.${encodeURIComponent(body.contact_person_id)}&customer_id=eq.${customerId}&select=id`
      );
      const contacts = contactResponse.ok ? await contactResponse.json() : [];
      if (!Array.isArray(contacts) || contacts.length !== 1) return json({ error: "Contact not found" }, 404, origin);
    }

    profilePayload = {
      org_id: admin.org_id,
      customer_id: body.customer_id,
      contact_person_id: body.contact_person_id || null,
      full_name: fullName,
      email,
      status: "inbjuden",
      initials: initials(fullName),
      invited_at: new Date().toISOString(),
    };
  }

  const inviteResponse = await api(
    `/auth/v1/invite?redirect_to=${encodeURIComponent(`${APP_URL}/set-password`)}`,
    {
      method: "POST",
      body: JSON.stringify({
        email,
        data: { full_name: fullName, account_type: accountType, org_id: admin.org_id },
      }),
    }
  );
  const invitedUser = await inviteResponse.json().catch(() => null);
  if (!inviteResponse.ok || !invitedUser?.id) {
    console.error("Auth invitation failed", inviteResponse.status, invitedUser);
    return json({ error: "Inbjudan kunde inte skickas. Kontrollera e-postinställningarna." }, 502, origin);
  }

  const table = accountType === "internal" ? "profiles" : "customer_users";
  const insertResponse = await api(`/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ id: invitedUser.id, ...profilePayload }),
  });
  if (!insertResponse.ok) {
    const insertError = await insertResponse.text();
    console.error("Invited profile insert failed", insertResponse.status, insertError);
    await api(`/auth/v1/admin/users/${encodeURIComponent(invitedUser.id)}`, { method: "DELETE" });
    return json({ error: "Kontot kunde inte kopplas till organisationen." }, 500, origin);
  }

  return json(
    {
      ok: true,
      user: { id: invitedUser.id, account_type: accountType, full_name: fullName, email, ...profilePayload },
    },
    201,
    origin
  );
});
