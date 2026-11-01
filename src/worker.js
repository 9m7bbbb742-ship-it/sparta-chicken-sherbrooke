const COOKIE = "__Host-sparta_admin";
const SESSION_SECONDS = 8 * 60 * 60;
const ITERATIONS = 310000;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}
function b64u(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function fromB64u(s) { return Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0)); }
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign","verify"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}
async function passwordMatches(password, stored) {
  const [saltHex, expectedHex] = (stored || "").split(":");
  if (!/^[a-f0-9]{32}$/i.test(saltHex || "") || !/^[a-f0-9]{64}$/i.test(expectedHex || "")) return false;
  const salt = Uint8Array.from(saltHex.match(/../g), x => parseInt(x,16));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:ITERATIONS,hash:"SHA-256"}, material, 256));
  const actual = [...bits].map(x=>x.toString(16).padStart(2,"0")).join("");
  return actual === expectedHex.toLowerCase();
}
async function makeSession(secret) {
  const payload = b64u(new TextEncoder().encode(JSON.stringify({ exp: Math.floor(Date.now()/1000)+SESSION_SECONDS })));
  return payload + "." + b64u(await hmac(secret,payload));
}
async function validSession(request, secret) {
  const raw = request.headers.get("Cookie") || "";
  const token = raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="))?.slice(COOKIE.length+1);
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  try {
    const expected = await hmac(secret,payload);
    const given = fromB64u(sig);
    if (expected.length !== given.length || !await crypto.subtle.verify("HMAC", await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]), given, new TextEncoder().encode(payload))) return false;
    return JSON.parse(new TextDecoder().decode(fromB64u(payload))).exp > Math.floor(Date.now()/1000);
  } catch { return false; }
}
const cookie = value => `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
const clearCookie = `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
async function body(request) { try { return await request.json(); } catch { return null; } }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") return new Response(null,{status:204,headers:{"Allow":"GET,POST,PATCH,DELETE,OPTIONS"}});
      if (url.pathname === "/api/health" && request.method === "GET") return json({ok:true, service:"sparta-api", database:!!env.DB});
      if (url.pathname === "/api/admin/login" && request.method === "POST") {
        if (!env.ADMIN_PASSWORD_HASH || !env.SESSION_SECRET) return json({error:"Configuration administrateur incomplète."},503);
        const data = await body(request);
        if (!data || typeof data.username !== "string" || typeof data.password !== "string" || data.username !== env.ADMIN_USERNAME || data.password.length < 1 || data.password.length > 200) return json({error:"Identifiants invalides."},401);
        if (!await passwordMatches(data.password,env.ADMIN_PASSWORD_HASH)) return json({error:"Identifiants invalides."},401);
        return json({ok:true,username:env.ADMIN_USERNAME},200,{"set-cookie":cookie(await makeSession(env.SESSION_SECRET))});
      }
      if (url.pathname === "/api/admin/logout" && request.method === "POST") return json({ok:true},200,{"set-cookie":clearCookie});
      if (!env.SESSION_SECRET || !await validSession(request,env.SESSION_SECRET)) return json({error:"Authentification requise."},401);
      if (!env.DB) return json({error:"Base de données non configurée."},503);
      if (url.pathname === "/api/admin/session" && request.method === "GET") return json({ok:true,username:env.ADMIN_USERNAME});
      if (url.pathname === "/api/admin/products" && request.method === "GET") {
        const {results=[]} = await env.DB.prepare("SELECT id,name,description,price_cents,category,available,created_at FROM products ORDER BY category,name").all();
        return json({products:results});
      }
      if (url.pathname === "/api/admin/products" && request.method === "POST") {
        const d=await body(request);
        if (!d || typeof d.name!=="string" || !d.name.trim() || !Number.isInteger(d.price_cents) || d.price_cents<0 || d.price_cents>10000000) return json({error:"Nom et prix en cents valides requis."},400);
        const result=await env.DB.prepare("INSERT INTO products(name,description,price_cents,category,available) VALUES(?,?,?,?,?)").bind(d.name.trim(),String(d.description||""),d.price_cents,String(d.category||"Autres"),d.available===false?0:1).run();
        return json({ok:true,id:result.meta.last_row_id},201);
      }
      if (url.pathname === "/api/admin/orders" && request.method === "GET") {
        const {results=[]}=await env.DB.prepare("SELECT id,customer_name,customer_phone,status,total_cents,created_at FROM orders ORDER BY created_at DESC LIMIT 100").all();
        return json({orders:results});
      }
      if (url.pathname === "/api/admin/reservations" && request.method === "GET") {
        const {results=[]}=await env.DB.prepare("SELECT id,customer_name,customer_phone,party_size,reservation_at,status,created_at FROM reservations ORDER BY reservation_at DESC LIMIT 100").all();
        return json({reservations:results});
      }
      return json({error:"Route introuvable."},404);
    }
    return env.ASSETS.fetch(request);
  }
};