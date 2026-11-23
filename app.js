const { SUPABASE_URL, SUPABASE_ANON_KEY, ORS_KEY } = window.CONFIG;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
const PROFILE = { ebike: "cycling-electric", emofa: "cycling-regular" };
const SAFETY = 0.8;      // nur 80 % der Reichweite einplanen
const MAX_OFF_KM = 2;    // Ladepunkt max. so weit von der Route entfernt

let user = null, vehicles = [], chargers = [], mode = "start";
let start = null, end = null, routeLayer = null;
const pins = {};

const map = L.map("map").setView([51.16, 10.45], 6);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
const chargeLayer = L.layerGroup().addTo(map);

const say = t => ($("msg").textContent = t);
const authSay = t => ($("authmsg").textContent = t);

// ---------- Anmeldung ----------
async function auth(kind) {
  const email = $("email").value.trim(), password = $("pw").value;
  const { error } = kind === "login"
    ? await sb.auth.signInWithPassword({ email, password })
    : await sb.auth.signUp({ email, password });
  if (error) return authSay(error.message);
  if (kind === "register") authSay("Registriert. Falls nötig, bitte die Bestätigungs-Mail öffnen und dann anmelden.");
}
$("login").onclick = () => auth("login");
$("register").onclick = () => auth("register");
$("logout").onclick = () => sb.auth.signOut();

sb.auth.onAuthStateChange((_e, session) => {
  user = session?.user || null;
  $("auth").hidden = !!user;
  $("app").hidden = !user;
  $("logout").hidden = !user;
  $("who").textContent = user ? user.email : "";
  if (user) { loadData(); setTimeout(() => map.invalidateSize(), 100); }
});

// ---------- Daten ----------
async function loadData() {
  const v = await sb.from("vehicles").select("*").order("created_at");
  vehicles = v.data || [];
  const c = await sb.from("charge_points").select("*");
  chargers = c.data || [];
  renderVehicles();
  renderChargers();
}

function renderVehicles() {
  $("vlist").innerHTML = "";
  $("veh").innerHTML = "";
  vehicles.forEach(v => {
    const li = document.createElement("li");
    li.textContent = `${v.name} (${v.type === "ebike" ? "E-Bike" : "E-Mofa"}, ca. ${v.range_km} km)`;
    const b = document.createElement("button");
    b.textContent = "✕";
    b.onclick = async () => { await sb.from("vehicles").delete().eq("id", v.id); loadData(); };
    li.append(b);
    $("vlist").append(li);
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.name;
    $("veh").append(o);
  });
}

$("vadd").onclick = async () => {
  const name = $("vname").value.trim(), range = +$("vrange").value;
  if (!name || !(range > 0)) return say("Bitte Name und Reichweite angeben.");
  const { error } = await sb.from("vehicles").insert({ user_id: user.id, name, type: $("vtype").value, range_km: range });
  if (error) return say(error.message);
  $("vname").value = ""; $("vrange").value = "";
  loadData();
};

function renderChargers() {
  chargeLayer.clearLayers();
  chargers.forEach(c => {
    const box = document.createElement("div");
    box.textContent = `🔌 ${c.name}${c.is_public ? " (öffentlich)" : ""}`;
    if (c.user_id === user?.id) {
      const b = document.createElement("button");
      b.textContent = "Löschen";
      b.onclick = async () => { await sb.from("charge_points").delete().eq("id", c.id); loadData(); };
      box.append(document.createElement("br"), b);
    }
    L.circleMarker([c.lat, c.lng], { radius: 8, color: "#1f9d55", fillOpacity: .8 }).bindPopup(box).addTo(chargeLayer);
  });
}

async function addCharger(lat, lng) {
  const name = prompt("Name der Lademöglichkeit (z. B. Steckdose Garage, Bäckerei Müller):");
  if (!name) return;
  const is_public = confirm("Für alle Nutzer sichtbar machen? (Abbrechen = nur für dich)");
  const { error } = await sb.from("charge_points").insert({ user_id: user.id, name, lat, lng, is_public });
  if (error) return say(error.message);
  loadData();
}

// ---------- Karte ----------
document.querySelectorAll(".mode").forEach(b => b.onclick = () => {
  mode = b.dataset.mode;
  document.querySelectorAll(".mode").forEach(x => x.classList.toggle("on", x === b));
});

function setPoint(kind, ll) {
  if (pins[kind]) map.removeLayer(pins[kind]);
  pins[kind] = L.marker(ll).addTo(map).bindTooltip(kind === "start" ? "Start" : "Ziel", { permanent: true });
  if (kind === "start") start = ll; else end = ll;
}

map.on("click", e => {
  if (!user) return;
  const ll = [e.latlng.lat, e.latlng.lng];
  if (mode === "charge") addCharger(...ll); else setPoint(mode, ll);
});

$("search").onclick = async () => {
  if (mode === "charge") return say("Zum Suchen bitte Start oder Ziel wählen.");
  const q = $("q").value.trim();
  if (!q) return;
  const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q));
  const j = await r.json();
  if (!j.length) return say("Adresse nicht gefunden.");
  const ll = [+j[0].lat, +j[0].lon];
  setPoint(mode, ll);
  map.setView(ll, 13);
};

// ---------- Routing ----------
function hav(a, b) {
  const r = Math.PI / 180, dl = (b[0] - a[0]) * r, dg = (b[1] - a[1]) * r;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dg / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

async function ors(pts, profile) {
  const r = await fetch(`https://api.heigit.org/openrouteservice/v2/directions/${profile}/geojson`, {
    method: "POST",
    headers: { Authorization: ORS_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates: pts.map(p => [p[1], p[0]]) })
  });
  if (!r.ok) throw new Error("Routing fehlgeschlagen (" + r.status + "). Zu weit oder Key falsch?");
  const f = (await r.json()).features[0];
  return { coords: f.geometry.coordinates.map(c => [c[1], c[0]]), km: f.properties.summary.distance / 1000 };
}

// wählt Ladestopps entlang der Route (jeweils der am weitesten erreichbare)
function planStops(coords, usable) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + hav(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1];
  const cand = chargers.map(c => {
    let best = 1e9, bi = 0;
    coords.forEach((p, i) => { const d = hav(p, [c.lat, c.lng]); if (d < best) { best = d; bi = i; } });
    return { c, off: best, at: cum[bi] };
  }).filter(x => x.off <= MAX_OFF_KM);
  const stops = [];
  let pos = 0;
  while (total - pos > usable) {
    const opts = cand.filter(x => x.at > pos + 1 && x.at <= pos + usable).sort((a, b) => b.at - a.at);
    if (!opts.length) return { stops, ok: false };
    stops.push(opts[0].c);
    pos = opts[0].at;
  }
  return { stops, ok: true };
}

$("go").onclick = async () => {
  const v = vehicles.find(x => x.id === $("veh").value);
  if (!v) return say("Bitte zuerst ein Fahrzeug anlegen.");
  if (!start || !end) return say("Bitte Start und Ziel setzen.");
  say("Berechne …");
  try {
    const profile = PROFILE[v.type], usable = v.range_km * SAFETY;
    let r = await ors([start, end], profile), text;
    if (r.km <= usable) {
      text = `${r.km.toFixed(1)} km – schaffst du mit einer Ladung.`;
    } else {
      const pl = planStops(r.coords, usable);
      if (!pl.ok) {
        text = `${r.km.toFixed(1)} km – nutzbare Reichweite ca. ${usable.toFixed(0)} km. Keine passenden Ladepunkte entlang der Strecke gefunden.`;
      } else {
        r = await ors([start, ...pl.stops.map(s => [s.lat, s.lng]), end], profile);
        text = `${r.km.toFixed(1)} km mit ${pl.stops.length} Ladestopp(s): ${pl.stops.map(s => s.name).join(" → ")}`;
      }
    }
    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.polyline(r.coords, { color: "#1f6feb", weight: 5 }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding: [30, 30] });
    if (v.type === "emofa") text += " Hinweis: E-Mofas dürfen oft nicht auf Radwegen fahren, bitte Strecke prüfen.";
    say(text);
  } catch (e) { say(e.message); }
};
