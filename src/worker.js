const COOKIE = "__Host-sparta_admin";
const SESSION_SECONDS = 8 * 60 * 60;
const ITERATIONS = 100000;

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
        if (!env.ADMIN_PASSWORD_HASH || !env.SESSION_SECRET || !env.ADMIN_USERNAME) return json({error:"Configuration administrateur incomplète."},503);
        const data = await body(request);
        if (!data || typeof data.username !== "string" || typeof data.password !== "string" || data.username !== env.ADMIN_USERNAME || data.password.length < 1 || data.password.length > 200) return json({error:"Identifiants invalides."},401);
        try {
          const matches = await passwordMatches(data.password,env.ADMIN_PASSWORD_HASH);
          if (!matches) return json({error:"Identifiants invalides."},401);
          const session = await makeSession(env.SESSION_SECRET);
          return json({ok:true,username:env.ADMIN_USERNAME},200,{"set-cookie":cookie(session)});
        } catch (error) {
          console.error("Échec technique de la connexion administrateur", error);
          return json({error:"Erreur technique pendant la connexion. Vérifie les journaux du Worker Cloudflare."},500);
        }
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

      if (url.pathname === "/api/admin/inventory" && request.method === "GET") {
        const {results=[]}=await env.DB.prepare("SELECT * FROM inventory ORDER BY name").all();
        return json({items:results});
      }
      if (url.pathname === "/api/admin/inventory" && request.method === "POST") {
        const d=await body(request);
        if (!d || typeof d.name!=="string" || !d.name.trim() || !Number.isFinite(d.quantity) || d.quantity<0 || !Number.isFinite(d.unit_cost_cents) || d.unit_cost_cents<0) return json({error:"Données de stock invalides."},400);
        const r=await env.DB.prepare("INSERT INTO inventory(name,quantity,unit,low_stock_threshold,unit_cost_cents) VALUES(?,?,?,?,?)").bind(d.name.trim(),d.quantity,String(d.unit||"unité"),Math.max(0,Number(d.low_stock_threshold)||0),Math.round(d.unit_cost_cents)).run();
        return json({ok:true,id:r.meta.last_row_id},201);
      }
      if (url.pathname.startsWith("/api/admin/inventory/") && request.method === "PATCH") {
        const id=Number(url.pathname.split("/").pop()), d=await body(request);
        if (!Number.isInteger(id) || !d || !Number.isFinite(d.quantity) || d.quantity<0) return json({error:"Quantité invalide."},400);
        await env.DB.prepare("UPDATE inventory SET quantity=?,updated_at=datetime('now') WHERE id=?").bind(d.quantity,id).run();
        return json({ok:true});
      }
      if (url.pathname === "/api/admin/deliveries" && request.method === "GET") {
        const {results=[]}=await env.DB.prepare("SELECT * FROM deliveries ORDER BY created_at DESC LIMIT 200").all();
        const totals=await env.DB.prepare("SELECT COALESCE(SUM(delivery_fee_cents),0) fees,COALESCE(SUM(driver_cost_cents),0) costs,COALESCE(SUM(delivery_fee_cents-driver_cost_cents),0) net FROM deliveries WHERE status='delivered'").first();
        return json({deliveries:results,totals});
      }
      if (url.pathname === "/api/admin/deliveries" && request.method === "POST") {
        const d=await body(request);
        if (!d || typeof d.customer_name!=="string" || !d.customer_name.trim() || typeof d.address!=="string" || !d.address.trim()) return json({error:"Nom et adresse requis."},400);
        const r=await env.DB.prepare("INSERT INTO deliveries(customer_name,address,driver_name,delivery_fee_cents,driver_cost_cents,distance_km) VALUES(?,?,?,?,?,?)").bind(d.customer_name.trim(),d.address.trim(),String(d.driver_name||""),Math.max(0,Math.round(Number(d.delivery_fee_cents)||0)),Math.max(0,Math.round(Number(d.driver_cost_cents)||0)),Math.max(0,Number(d.distance_km)||0)).run();
        return json({ok:true,id:r.meta.last_row_id},201);
      }
      if (url.pathname.startsWith("/api/admin/deliveries/") && request.method === "PATCH") {
        const id=Number(url.pathname.split("/").pop()),d=await body(request);
        if (!Number.isInteger(id) || !d || !["pending","assigned","picked_up","delivered","cancelled"].includes(d.status)) return json({error:"Statut invalide."},400);
        await env.DB.prepare("UPDATE deliveries SET status=?,driver_name=COALESCE(?,driver_name),driver_cost_cents=COALESCE(?,driver_cost_cents),delivered_at=CASE WHEN ?='delivered' THEN datetime('now') ELSE delivered_at END WHERE id=?").bind(d.status,d.driver_name??null,d.driver_cost_cents==null?null:Math.max(0,Math.round(d.driver_cost_cents)),d.status,id).run();
        return json({ok:true});
      }
      if (url.pathname === "/api/admin/expenses" && request.method === "GET") {
        const {results=[]}=await env.DB.prepare("SELECT * FROM expenses ORDER BY expense_date DESC,id DESC LIMIT 300").all();
        return json({expenses:results});
      }
      if (url.pathname === "/api/admin/expenses" && request.method === "POST") {
        const d=await body(request);
        if (!d || typeof d.label!=="string" || !d.label.trim() || !Number.isInteger(d.amount_cents) || d.amount_cents<0) return json({error:"Dépense invalide."},400);
        const r=await env.DB.prepare("INSERT INTO expenses(label,category,amount_cents,expense_date,notes) VALUES(?,?,?,?,?)").bind(d.label.trim(),String(d.category||"Autre"),d.amount_cents,String(d.expense_date||new Date().toISOString().slice(0,10)),String(d.notes||"")).run();
        return json({ok:true,id:r.meta.last_row_id},201);
      }
      if (url.pathname === "/api/admin/settings" && request.method === "GET") {
        const {results=[]}=await env.DB.prepare("SELECT setting_key,setting_value FROM restaurant_settings ORDER BY setting_key").all();
        return json({settings:Object.fromEntries(results.map(x=>[x.setting_key,x.setting_value]))});
      }
      if (url.pathname === "/api/admin/settings" && request.method === "POST") {
        const d=await body(request);
        if (!d || typeof d!=="object" || Array.isArray(d)) return json({error:"Paramètres invalides."},400);
        const batch=Object.entries(d).filter(([k,v])=>/^[a-z0-9_.-]{1,80}$/i.test(k)&&["string","number","boolean"].includes(typeof v)).map(([k,v])=>env.DB.prepare("INSERT INTO restaurant_settings(setting_key,setting_value) VALUES(?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value").bind(k,String(v)));
        if(batch.length) await env.DB.batch(batch);
        return json({ok:true,saved:batch.length});
      }
      if (url.pathname === "/api/admin/profit" && request.method === "GET") {
        const revenue=await env.DB.prepare("SELECT COALESCE(SUM(total_cents),0) value FROM orders WHERE status!='cancelled' AND date(created_at)=date('now')").first();
        const expenses=await env.DB.prepare("SELECT COALESCE(SUM(amount_cents),0) value FROM expenses WHERE expense_date=date('now')").first();
        const delivery=await env.DB.prepare("SELECT COALESCE(SUM(delivery_fee_cents-driver_cost_cents),0) value FROM deliveries WHERE status='delivered' AND date(delivered_at)=date('now')").first();
        return json({revenue_cents:revenue.value,expenses_cents:expenses.value,delivery_net_cents:delivery.value,profit_before_product_cost_cents:revenue.value-expenses.value+delivery.value,notice:"Estimation hors coût matière tant que les coûts des recettes ne sont pas renseignés."});
      }
      return json({error:"Route introuvable."},404);
    }
    return env.ASSETS.fetch(request);
  }
};