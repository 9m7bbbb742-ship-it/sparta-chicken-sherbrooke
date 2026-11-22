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
function validProductImage(value) { const image=String(value||""); return image.length<=1500000 && (image==="" || /^https:\/\//i.test(image) || /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image)); }
async function ensureProductImageColumn(env) {
  const {results=[]}=await env.DB.prepare("PRAGMA table_info(products)").all();
  if(!results.some(column=>column.name==="image_url")) {
    await env.DB.prepare("ALTER TABLE products ADD COLUMN image_url TEXT NOT NULL DEFAULT ''").run();
  }
}
async function makeStaffSession(secret, account) {
  const payload=b64u(new TextEncoder().encode(JSON.stringify({exp:Math.floor(Date.now()/1000)+SESSION_SECONDS,uid:account.id,username:account.username,role:account.role})));
  return payload+"."+b64u(await hmac(secret,payload));
}
async function readStaffSession(request,secret) {
  const raw=request.headers.get("Cookie")||"";
  const token=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("__Host-sparta_staff="))?.slice("__Host-sparta_staff=".length);
  if(!token)return null;
  const [payload,sig]=token.split(".");
  try {
    const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
    if(!await crypto.subtle.verify("HMAC",key,fromB64u(sig),new TextEncoder().encode(payload)))return null;
    const s=JSON.parse(new TextDecoder().decode(fromB64u(payload)));
    return s.exp>Math.floor(Date.now()/1000)&&["employee","driver"].includes(s.role)?s:null;
  } catch{return null;}
}
const staffCookie=value=>`__Host-sparta_staff=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
const clearStaffCookie="__Host-sparta_staff=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";




const DELIVERY_ORIGIN={lat:45.5170765,lon:-73.5675137};
const DELIVERY_RADIUS_KM=15;
const DELIVERY_FEE_CENTS=699;
async function deliveryQuote(env,address){
  if(typeof address!=="string"||address.trim().length<8||address.trim().length>300)return {ok:false,status:400,error:"Entre une adresse complète à Montréal."};
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS delivery_geocodes (address_key TEXT PRIMARY KEY,lat REAL NOT NULL,lon REAL NOT NULL,cached_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
  const key=address.trim().toLowerCase().replace(/\s+/g," ");
  let point=await env.DB.prepare("SELECT lat,lon FROM delivery_geocodes WHERE address_key=?").bind(key).first();
  if(!point){
    const q=encodeURIComponent(key+", Montréal, Québec, Canada");
    const response=await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&country=ca&q="+q,{headers:{"accept":"application/json","user-agent":"SpartaChickenSherbrooke/1.0 (delivery address validation)"}});
    if(!response.ok)return {ok:false,status:503,error:"Le service de vérification d’adresse est temporairement indisponible."};
    const found=await response.json();
    if(!Array.isArray(found)||!found.length)return {ok:false,status:422,error:"Adresse introuvable. Vérifie le numéro, la rue et le code postal."};
    point={lat:Number(found[0].lat),lon:Number(found[0].lon)};
    if(!Number.isFinite(point.lat)||!Number.isFinite(point.lon))return {ok:false,status:503,error:"Impossible de localiser cette adresse."};
    await env.DB.prepare("INSERT OR REPLACE INTO delivery_geocodes(address_key,lat,lon) VALUES(?,?,?)").bind(key,point.lat,point.lon).run();
  }
  const rad=x=>x*Math.PI/180,lat1=rad(DELIVERY_ORIGIN.lat),lat2=rad(point.lat),dlat=lat2-lat1,dlon=rad(point.lon-DELIVERY_ORIGIN.lon);
  const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
  const distance=6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  if(distance>DELIVERY_RADIUS_KM)return {ok:false,status:422,error:"Cette adresse est à "+distance.toFixed(1)+" km du restaurant. La livraison est limitée à 15 km."};
  return {ok:true,distance_km:Number(distance.toFixed(2)),delivery_fee_cents:DELIVERY_FEE_CENTS,radius_km:DELIVERY_RADIUS_KM};
}

async function ensureOperationalSchema(env) {
  const definitions = {
    customers: { create:"CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, phone TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))", columns:{name:"TEXT NOT NULL DEFAULT ''",email:"TEXT",phone:"TEXT",created_at:"TEXT NOT NULL DEFAULT (datetime('now'))"} },
    orders: { create:"CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL DEFAULT '', customer_email TEXT, fulfillment TEXT NOT NULL DEFAULT 'pickup', delivery_address TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', items_json TEXT NOT NULL DEFAULT '[]', subtotal_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', payment_status TEXT NOT NULL DEFAULT 'unpaid', created_at TEXT NOT NULL DEFAULT (datetime('now')))", columns:{customer_id:"INTEGER",customer_name:"TEXT NOT NULL DEFAULT ''",customer_phone:"TEXT NOT NULL DEFAULT ''",customer_email:"TEXT",fulfillment:"TEXT NOT NULL DEFAULT 'pickup'",delivery_address:"TEXT NOT NULL DEFAULT ''",notes:"TEXT NOT NULL DEFAULT ''",items_json:"TEXT NOT NULL DEFAULT '[]'",subtotal_cents:"INTEGER NOT NULL DEFAULT 0",total_cents:"INTEGER NOT NULL DEFAULT 0",status:"TEXT NOT NULL DEFAULT 'pending'",payment_status:"TEXT NOT NULL DEFAULT 'unpaid'",created_at:"TEXT NOT NULL DEFAULT (datetime('now'))"} },
    reservations: { create:"CREATE TABLE IF NOT EXISTS reservations (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, customer_email TEXT, party_size INTEGER NOT NULL DEFAULT 2, reservation_at TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (datetime('now')))", columns:{customer_name:"TEXT NOT NULL DEFAULT ''",customer_phone:"TEXT NOT NULL DEFAULT ''",customer_email:"TEXT",party_size:"INTEGER NOT NULL DEFAULT 2",reservation_at:"TEXT NOT NULL DEFAULT ''",notes:"TEXT NOT NULL DEFAULT ''",status:"TEXT NOT NULL DEFAULT 'pending'",created_at:"TEXT NOT NULL DEFAULT (datetime('now'))"} },
    deliveries: { create:"CREATE TABLE IF NOT EXISTS deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, customer_name TEXT NOT NULL, address TEXT NOT NULL, driver_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', delivery_fee_cents INTEGER NOT NULL DEFAULT 0, driver_cost_cents INTEGER NOT NULL DEFAULT 0, distance_km REAL NOT NULL DEFAULT 0, customer_phone TEXT NOT NULL DEFAULT '', items_json TEXT NOT NULL DEFAULT '[]', payment_method TEXT NOT NULL DEFAULT 'not_configured', payment_status TEXT NOT NULL DEFAULT 'unpaid', scheduled_at TEXT, eta_minutes INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), delivered_at TEXT)", columns:{order_id:"INTEGER",customer_name:"TEXT NOT NULL DEFAULT ''",address:"TEXT NOT NULL DEFAULT ''",driver_name:"TEXT NOT NULL DEFAULT ''",status:"TEXT NOT NULL DEFAULT 'pending'",delivery_fee_cents:"INTEGER NOT NULL DEFAULT 0",driver_cost_cents:"INTEGER NOT NULL DEFAULT 0",distance_km:"REAL NOT NULL DEFAULT 0",customer_phone:"TEXT NOT NULL DEFAULT ''",items_json:"TEXT NOT NULL DEFAULT '[]'",payment_method:"TEXT NOT NULL DEFAULT 'not_configured'",payment_status:"TEXT NOT NULL DEFAULT 'unpaid'",scheduled_at:"TEXT",eta_minutes:"INTEGER",created_at:"TEXT NOT NULL DEFAULT (datetime('now'))",delivered_at:"TEXT"} },
    reviews: { create:"CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, display_name TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (datetime('now')))", columns:{display_name:"TEXT NOT NULL DEFAULT ''",rating:"INTEGER NOT NULL DEFAULT 5",comment:"TEXT NOT NULL DEFAULT ''",status:"TEXT NOT NULL DEFAULT 'pending'",created_at:"TEXT NOT NULL DEFAULT (datetime('now'))"} }
  };
  for (const [table, spec] of Object.entries(definitions)) {
    await env.DB.prepare(spec.create).run();
    const info=await env.DB.prepare("PRAGMA table_info("+table+")").all();
    const present=new Set((info.results||[]).map(column=>column.name));
    for(const [column,type] of Object.entries(spec.columns)) if(!present.has(column)) await env.DB.prepare("ALTER TABLE "+table+" ADD COLUMN "+column+" "+type).run();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if(url.pathname==="/api/delivery/check"&&request.method==="POST"){
        if(!env.DB)return json({error:"Service de livraison indisponible."},503);
        const d=await body(request),q=await deliveryQuote(env,d?.address);
        return q.ok?json(q):json({error:q.error},q.status);
      }
      if (url.pathname === "/api/menu/products" && request.method === "GET") {
        if (!env.DB) return json({error:"Base de données non configurée."},503);
      await ensureOperationalSchema(env);
        await ensureProductImageColumn(env);
        const {results=[]}=await env.DB.prepare("SELECT id,name,description,price_cents,category,image_url FROM products WHERE available=1 ORDER BY category,name").all();
        return json({products:results});
      }
      if (url.pathname === "/api/orders" && request.method === "POST") {
        if (!env.DB) return json({error:"Service de commande indisponible."},503);
        await ensureOperationalSchema(env);
        const origin=request.headers.get("Origin");
        if (origin) { try { if (new URL(origin).host !== url.host) return json({error:"Origine de requête refusée."},403); } catch { return json({error:"Origine de requête invalide."},403); } }
        if (!(request.headers.get("content-type")||"").toLowerCase().includes("application/json")) return json({error:"Format de commande invalide."},415);
        const d=await body(request),name=typeof d?.customer_name==="string"?d.customer_name.trim():"",phone=typeof d?.customer_phone==="string"?d.customer_phone.trim():"",email=typeof d?.customer_email==="string"?d.customer_email.trim().toLowerCase():"",fulfillment=d?.fulfillment==="delivery"?"delivery":d?.fulfillment==="pickup"?"pickup":"",address=typeof d?.address==="string"?d.address.trim():"",notes=typeof d?.notes==="string"?d.notes.trim():"";
        if (!name||name.length>120||!/^[+()0-9 .-]{7,25}$/.test(phone)||(email&&(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))||!fulfillment||notes.length>500||(fulfillment==="delivery"&&(!address||address.length>300))) return json({error:"Vérifie le nom, le téléphone, le mode de réception et l’adresse de livraison."},400);
        const delivery=fulfillment==="delivery"?await deliveryQuote(env,address):null;
        if(delivery&&!delivery.ok)return json({error:delivery.error},delivery.status);
        if (!Array.isArray(d.items)||d.items.length<1||d.items.length>30) return json({error:"Ajoute au moins un produit au panier."},400);
        const normalized=[];
        for(const item of d.items){const productId=Number(item?.product_id),quantity=Number(item?.quantity);if(!Number.isSafeInteger(productId)||productId<1||!Number.isSafeInteger(quantity)||quantity<1||quantity>20)return json({error:"Un article ou une quantité du panier est invalide."},400);normalized.push({product_id:productId,quantity});}
        const ids=[...new Set(normalized.map(x=>x.product_id))],placeholders=ids.map(()=>"?").join(",");
        const {results:products=[]}=await env.DB.prepare("SELECT id,name,price_cents FROM products WHERE available=1 AND id IN ("+placeholders+")").bind(...ids).all(),byId=new Map(products.map(p=>[p.id,p]));
        if(byId.size!==ids.length)return json({error:"Un ou plusieurs produits ne sont plus disponibles. Actualise le menu."},409);
        const lines=normalized.map(x=>{const p=byId.get(x.product_id);return {product_id:p.id,name:p.name,quantity:x.quantity,unit_price_cents:p.price_cents,line_total_cents:p.price_cents*x.quantity};}),subtotal=lines.reduce((sum,x)=>sum+x.line_total_cents,0),deliveryFee=delivery?.delivery_fee_cents||0,total=subtotal+deliveryFee;
        if(!Number.isSafeInteger(subtotal)||subtotal<1||subtotal>100000000)return json({error:"Le total de la commande est invalide."},400);
        const itemsJson=JSON.stringify(lines);
        try{
          const customer=await env.DB.prepare("INSERT INTO customers(name,email,phone) VALUES(?,?,?)").bind(name,email||null,phone).run();
          const order=await env.DB.prepare("INSERT INTO orders(customer_id,customer_name,customer_phone,customer_email,fulfillment,delivery_address,notes,items_json,subtotal_cents,total_cents,status,payment_status) VALUES(?,?,?,?,?,?,?,?,?,?,'pending','unpaid')").bind(customer.meta.last_row_id,name,phone,email,fulfillment,address,notes,itemsJson,subtotal,total).run();
          const orderId=order.meta.last_row_id;
          if(fulfillment==="delivery")await env.DB.prepare("INSERT INTO deliveries(order_id,customer_name,address,driver_name,status,delivery_fee_cents,driver_cost_cents,distance_km,customer_phone,items_json,payment_method,payment_status) VALUES(?,?,?,'','pending',?,0,?,?,?,'not_configured','unpaid')").bind(orderId,name,address,deliveryFee,delivery.distance_km,phone,itemsJson).run();
          return json({ok:true,order_id:orderId,status:"pending",payment_status:"unpaid",subtotal_cents:subtotal,delivery_fee_cents:deliveryFee,total_cents:total,distance_km:delivery?.distance_km||0,message:"Commande enregistrée. Le restaurant doit confirmer la commande."},201);
        }catch(error){console.error("Création de commande impossible",error);return json({error:"La commande n’a pas pu être enregistrée. Réessaie dans quelques instants."},500);}
      }
      if (url.pathname === "/api/reservations" && request.method === "POST") {
        if (!env.DB) return json({error:"Service de réservation indisponible."},503);
        await ensureOperationalSchema(env);
        const origin=request.headers.get("Origin");
        if (origin) { try { if (new URL(origin).host !== url.host) return json({error:"Origine refusée."},403); } catch { return json({error:"Origine invalide."},403); } }
        const d=await body(request),name=typeof d?.name==="string"?d.name.trim():"",phone=typeof d?.phone==="string"?d.phone.trim():"",email=typeof d?.email==="string"?d.email.trim().toLowerCase():"",date=typeof d?.date==="string"?d.date:"",time=typeof d?.time==="string"?d.time:"",party=Number(d?.party_size||2),notes=typeof d?.notes==="string"?d.notes.trim():"";
        if(!name||name.length>120||!/^[+()0-9 .-]{7,25}$/.test(phone)||(email&&(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!Number.isSafeInteger(party)||party<1||party>20||notes.length>1000) return json({error:"Vérifie tes coordonnées, la date, l’heure et le nombre de personnes."},400);
        const requested=new Date(date+"T"+time+":00");
        if(!Number.isFinite(requested.getTime())||requested.getTime()<Date.now()-60000)return json({error:"Choisis une date et une heure futures."},400);
        try {
          const columns=await env.DB.prepare("PRAGMA table_info(reservations)").all();
          if(!columns.results?.some(x=>x.name==="customer_email"))await env.DB.prepare("ALTER TABLE reservations ADD COLUMN customer_email TEXT").run();
          await env.DB.prepare("INSERT INTO reservations(customer_name,customer_phone,customer_email,party_size,reservation_at,notes,status) VALUES(?,?,?,?,?,?, 'pending')").bind(name,phone,email||null,party,date+" "+time,notes).run();
          return json({ok:true,status:"pending",message:"Demande de réservation reçue. Le restaurant doit confirmer la disponibilité."},201);
        } catch(error) { console.error("Réservation impossible",error); return json({error:"La demande n’a pas pu être enregistrée. Réessaie plus tard."},500); }
      }
      if (url.pathname === "/api/reviews" && request.method === "POST") {
        if (!env.DB) return json({error:"Service d’avis indisponible."},503);
        await ensureOperationalSchema(env);
        const origin=request.headers.get("Origin");
        if (origin) { try { if (new URL(origin).host !== url.host) return json({error:"Origine refusée."},403); } catch { return json({error:"Origine invalide."},403); } }
        const d=await body(request),name=typeof d?.name==="string"?d.name.trim():"",rating=Number(d?.rating),comment=typeof d?.comment==="string"?d.comment.trim():"";
        if(!name||name.length>80||!Number.isInteger(rating)||rating<1||rating>5||!comment||comment.length<3||comment.length>2000)return json({error:"Indique un nom, une note de 1 à 5 et un commentaire (3 à 2 000 caractères)."},400);
        try {
          await env.DB.prepare("CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, display_name TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
          const saved=await env.DB.prepare("INSERT INTO reviews(display_name,rating,comment,status) VALUES(?,?,?,'pending')").bind(name,rating,comment).run();
          return json({ok:true,review_id:saved.meta.last_row_id,status:"pending",message:"Merci ! Ton avis a bien été transmis et sera vérifié avant publication."},201);
        } catch(error) { console.error("Avis impossible",error); return json({error:"L’avis n’a pas pu être enregistré. Réessaie plus tard."},500); }
      }
      if(url.pathname==="/api/staff/login"&&request.method==="POST"){
        if(!env.DB||!env.SESSION_SECRET)return json({error:"Service indisponible."},503);
        const d=await body(request);
        if(!d||typeof d.username!=="string"||typeof d.password!=="string"||d.password.length>200)return json({error:"Identifiants invalides."},401);
        const account=await env.DB.prepare("SELECT id,username,password_hash,role,active FROM staff_accounts WHERE username=?").bind(d.username.trim()).first();
        if(!account||account.active!==1||!await passwordMatches(d.password,account.password_hash))return json({error:"Identifiants invalides."},401);
        await env.DB.prepare("UPDATE staff_accounts SET last_login_at=datetime('now') WHERE id=?").bind(account.id).run();
        return json({ok:true,role:account.role,username:account.username},200,{"set-cookie":staffCookie(await makeStaffSession(env.SESSION_SECRET,account))});
      }
      if(url.pathname==="/api/staff/logout"&&request.method==="POST")return json({ok:true},200,{"set-cookie":clearStaffCookie});
      if(url.pathname.startsWith("/api/staff/")){
        if(!env.SESSION_SECRET||!env.DB)return json({error:"Service indisponible."},503);
        const s=await readStaffSession(request,env.SESSION_SECRET);
        if(!s)return json({error:"Authentification requise."},401);
        const activeAccount=await env.DB.prepare("SELECT id FROM staff_accounts WHERE id=? AND active=1 AND role=?").bind(s.uid,s.role).first();
        if(!activeAccount)return json({error:"Compte désactivé. Reconnecte-toi avec un compte actif."},401,{"set-cookie":clearStaffCookie});
        if(url.pathname==="/api/staff/session"&&request.method==="GET")return json({ok:true,username:s.username,role:s.role});
        if(s.role==="employee"&&url.pathname==="/api/staff/orders"&&request.method==="GET"){
          const {results=[]}=await env.DB.prepare("SELECT id,customer_name,customer_phone,items_json,fulfillment,delivery_address,notes,total_cents,status,payment_status,created_at FROM orders WHERE status!='completed' AND status!='cancelled' ORDER BY created_at DESC LIMIT 100").all();
          return json({orders:results});
        }
        if(s.role==="employee"&&/^\/api\/staff\/orders\/\d+$/.test(url.pathname)&&request.method==="PATCH"){
          const id=Number(url.pathname.split("/").pop()),d=await body(request);
          if(!d||!["confirmed","preparing","ready","completed","cancelled"].includes(d.status))return json({error:"Statut invalide."},400);
          await env.DB.prepare("UPDATE orders SET status=? WHERE id=?").bind(d.status,id).run();if(d.status==="cancelled")await env.DB.prepare("UPDATE deliveries SET status='cancelled' WHERE order_id=? AND status IN ('pending','assigned')").bind(id).run();return json({ok:true});
        }
        if(s.role==="employee"&&url.pathname==="/api/staff/reservations"&&request.method==="GET"){
          const {results=[]}=await env.DB.prepare("SELECT id,customer_name,customer_phone,party_size,reservation_at,notes,status FROM reservations WHERE status!='completed' AND status!='cancelled' ORDER BY reservation_at LIMIT 100").all();return json({reservations:results});
        }
        if(s.role==="driver"&&url.pathname==="/api/staff/deliveries"&&request.method==="GET"){
          const {results=[]}=await env.DB.prepare("SELECT d.id,d.order_id,d.customer_name,d.address,d.customer_phone,d.items_json,d.status,d.distance_km,d.scheduled_at,d.eta_minutes,d.delivery_fee_cents,d.driver_cost_cents,d.created_at,d.delivered_at,d.payment_method,d.payment_status,o.total_cents,o.payment_status AS order_payment_status FROM deliveries d LEFT JOIN orders o ON o.id=d.order_id WHERE (d.driver_name=? AND d.status IN ('assigned','picked_up','delivered')) OR (d.driver_name='' AND d.status='pending') ORDER BY CASE WHEN d.status='delivered' THEN 2 WHEN d.status='pending' THEN 1 ELSE 0 END,COALESCE(d.scheduled_at,d.created_at),d.created_at DESC LIMIT 200").bind(s.username).all();return json({deliveries:results});
        }
        if(s.role==="driver"&&/^\/api\/staff\/deliveries\/\d+$/.test(url.pathname)&&request.method==="PATCH"){
          const id=Number(url.pathname.split("/").pop()),d=await body(request);
          if(!d||!["assigned","picked_up","delivered"].includes(d.status))return json({error:"Statut invalide."},400);
          if(d.status==="assigned"){
            const claim=await env.DB.prepare("UPDATE deliveries SET driver_name=?,status='assigned' WHERE id=? AND driver_name='' AND status='pending'").bind(s.username,id).run();
            if(!claim.meta.changes)return json({error:"Cette livraison vient d’être prise par un autre livreur ou n’est plus disponible."},409);
            return json({ok:true});
          }
          const result=await env.DB.prepare("UPDATE deliveries SET status=?,delivered_at=CASE WHEN ?='delivered' THEN datetime('now') ELSE delivered_at END WHERE id=? AND driver_name=? AND status IN ('assigned','picked_up')").bind(d.status,d.status,id,s.username).run();
          if(!result.meta.changes)return json({error:"Livraison introuvable ou non assignée à ce compte."},404);if(d.status==="delivered")await env.DB.prepare("UPDATE orders SET status='completed' WHERE id=(SELECT order_id FROM deliveries WHERE id=?) AND status NOT IN ('cancelled','completed')").bind(id).run();return json({ok:true});
        }
        return json({error:"Accès interdit."},403);
      }

      if (request.method === "OPTIONS") return new Response(null,{status:204,headers:{"Allow":"GET,POST,PATCH,DELETE,OPTIONS"}});
      if (url.pathname === "/api/health" && request.method === "GET") return json({ok:true, service:"sparta-api", database:!!env.DB});
      if (url.pathname === "/api/admin/login" && request.method === "POST") {
        if (!env.ADMIN_PASSWORD_HASH || !env.SESSION_SECRET || !env.ADMIN_USERNAME) return json({error:"Configuration administrateur incomplète."},503);
        const data = await body(request);
        if (!data || typeof data.username !== "string" || typeof data.password !== "string" || data.password.length < 1 || data.password.length > 200) { console.warn("Connexion admin refusée: format des données invalide"); return json({error:"Identifiants invalides."},401); }
        if (data.username !== env.ADMIN_USERNAME) { console.warn("Connexion admin refusée: ADMIN_USERNAME ne correspond pas"); return json({error:"Identifiants invalides."},401); }
        try {
          const matches = await passwordMatches(data.password,env.ADMIN_PASSWORD_HASH);
          if (!matches) { console.warn("Connexion admin refusée: ADMIN_PASSWORD_HASH ne correspond pas au mot de passe saisi"); return json({error:"Identifiants invalides."},401); }
          const session = await makeSession(env.SESSION_SECRET);
          return json({ok:true,username:env.ADMIN_USERNAME},200,{"set-cookie":cookie(session)});
        } catch (error) {
          console.error("Échec technique de la connexion administrateur", error);
          return json({error:"Erreur technique pendant la connexion. Vérifie les journaux du Worker Cloudflare."},500);
        }
      }
      if (url.pathname === "/api/admin/logout" && request.method === "POST") return json({ok:true},200,{"set-cookie":clearCookie});
      if (!env.SESSION_SECRET || !await validSession(request,env.SESSION_SECRET)) return json({error:"Authentification requise."},401);
      if(url.pathname==="/api/admin/staff"&&request.method==="GET"){
        const {results=[]}=await env.DB.prepare("SELECT id,username,role,active,created_at,last_login_at FROM staff_accounts ORDER BY role,username").all();return json({accounts:results});
      }
      if(url.pathname==="/api/admin/staff"&&request.method==="POST"){
        const d=await body(request);
        if(!d||typeof d.username!=="string"||!/^[a-zA-Z0-9_.-]{3,40}$/.test(d.username)||typeof d.password!=="string"||d.password.length<8||d.password.length>200||!["employee","driver"].includes(d.role))return json({error:"Nom, rôle et mot de passe (8 caractères minimum) requis."},400);
        const salt=crypto.getRandomValues(new Uint8Array(16)),saltHex=[...salt].map(x=>x.toString(16).padStart(2,"0")).join("");
        const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(d.password),"PBKDF2",false,["deriveBits"]);
        const bits=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:ITERATIONS,hash:"SHA-256"},material,256));
        const hash=[...bits].map(x=>x.toString(16).padStart(2,"0")).join("");
        try{const q=await env.DB.prepare("INSERT INTO staff_accounts(username,password_hash,role) VALUES(?,?,?)").bind(d.username.trim(),saltHex+":"+hash,d.role).run();return json({ok:true,id:q.meta.last_row_id},201)}catch{return json({error:"Ce nom d’utilisateur existe déjà."},409)}
      }
      if(/^\/api\/admin\/staff\/\d+$/.test(url.pathname)&&request.method==="PATCH"){
        const id=Number(url.pathname.split("/").pop()),d=await body(request);
        if(!d||typeof d.active!=="boolean")return json({error:"État invalide."},400);
        await env.DB.prepare("UPDATE staff_accounts SET active=? WHERE id=?").bind(d.active?1:0,id).run();return json({ok:true});
      }
      if (!env.DB) return json({error:"Base de données non configurée."},503);
      if (url.pathname === "/api/admin/session" && request.method === "GET") return json({ok:true,username:env.ADMIN_USERNAME});
      if (url.pathname === "/api/admin/products" && request.method === "GET") {
        await ensureProductImageColumn(env);
        const {results=[]} = await env.DB.prepare("SELECT id,name,description,price_cents,category,image_url,available,created_at FROM products ORDER BY category,name").all();
        return json({products:results});
      }
      if (url.pathname === "/api/admin/products" && request.method === "POST") {
        await ensureProductImageColumn(env);
        const d=await body(request);
        if (!d || typeof d.name!=="string" || !d.name.trim() || !Number.isInteger(d.price_cents) || d.price_cents<0 || d.price_cents>10000000) return json({error:"Nom et prix en cents valides requis."},400);
        if(!validProductImage(d.image_url))return json({error:"Photo invalide ou trop volumineuse. Réessaie avec une autre image."},400);
        const result=await env.DB.prepare("INSERT INTO products(name,description,price_cents,category,image_url,available) VALUES(?,?,?,?,?,?)").bind(d.name.trim(),String(d.description||""),d.price_cents,String(d.category||"Autres"),String(d.image_url||""),d.available===false?0:1).run();
        return json({ok:true,id:result.meta.last_row_id},201);
      }
      if (/^\/api\/admin\/products\/\d+$/.test(url.pathname) && request.method === "PATCH") {
        await ensureProductImageColumn(env);
        const id=Number(url.pathname.split("/").pop()),d=await body(request);
        if(!Number.isInteger(id)||!d||typeof d.name!=="string"||!d.name.trim()||!Number.isInteger(d.price_cents)||d.price_cents<0||d.price_cents>10000000)return json({error:"Nom et prix en cents valides requis."},400);
        if(!validProductImage(d.image_url))return json({error:"Photo invalide ou trop volumineuse. Réessaie avec une autre image."},400);
        await env.DB.prepare("UPDATE products SET name=?,description=?,price_cents=?,category=?,image_url=?,available=? WHERE id=?").bind(d.name.trim(),String(d.description||""),d.price_cents,String(d.category||"Autres"),String(d.image_url||""),d.available===false?0:1,id).run();
        return json({ok:true});
      }
      if (/^\/api\/admin\/products\/\d+$/.test(url.pathname) && request.method === "DELETE") {
        const id=Number(url.pathname.split("/").pop());
        await env.DB.prepare("DELETE FROM products WHERE id=?").bind(id).run();
        return json({ok:true});
      }
      if (url.pathname === "/api/admin/customers" && request.method === "GET") {
        const {results=[]}=await env.DB.prepare("SELECT c.id,c.name,c.email,c.phone,c.created_at,COUNT(o.id) AS order_count,COALESCE(SUM(o.total_cents),0) AS lifetime_value_cents,MAX(o.created_at) AS last_order_at FROM customers c LEFT JOIN orders o ON o.customer_id=c.id GROUP BY c.id ORDER BY c.created_at DESC LIMIT 500").all();
        return json({customers:results});
      }
      if (url.pathname === "/api/admin/reviews" && request.method === "GET") {
        const exists=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reviews'").first();
        if(!exists)return json({reviews:[]});
        const {results=[]}=await env.DB.prepare("SELECT id,display_name,rating,comment,status,created_at FROM reviews ORDER BY created_at DESC LIMIT 200").all();
        return json({reviews:results});
      }
      if (url.pathname === "/api/admin/orders" && request.method === "GET") {
        const {results=[]}=await env.DB.prepare("SELECT id,customer_name,customer_phone,items_json,fulfillment,delivery_address,notes,status,payment_status,subtotal_cents,total_cents,created_at FROM orders ORDER BY created_at DESC LIMIT 100").all();
        return json({orders:results});
      }
      if (url.pathname === "/api/admin/reservations" && request.method === "GET") {
        const {results=[]}=await env.DB.prepare("SELECT id,customer_name,customer_phone,customer_email,party_size,reservation_at,notes,status,created_at FROM reservations ORDER BY reservation_at DESC LIMIT 100").all();
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