/* ═══════════════════════════════════════════════════════════════
   Invitation — password gate, envelope choreography, RSVP.
   The invite text is AES-256-GCM encrypted; nothing readable
   ships in the repo. Sealed by seal.py, opened here.
   ═══════════════════════════════════════════════════════════════ */

const $  = (s) => document.querySelector(s);
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let ENC = null;      // encrypted payload
let C   = null;      // decrypted content, once unlocked

/* ───────────────────────────  crypto  ─────────────────────────── */

async function decrypt(payload, password) {
  const base = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64(payload.kdf.salt),
      iterations: payload.kdf.iterations, hash: payload.kdf.hash },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64(payload.iv) }, key, b64(payload.data)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

/* ────────────────────────────  boot  ──────────────────────────── */

(async function init() {
  try {
    ENC = await fetch("invite.enc.json", { cache: "no-store" }).then((r) => r.json());
  } catch {
    $("#gate-err").textContent = "The invitation could not be loaded.";
    $("#gate-err").hidden = false;
    return;
  }

  // A link may carry the password: …/#k=password
  const fromHash = new URLSearchParams(location.hash.slice(1)).get("k");
  const remembered = sessionStorage.getItem("invite-pw");
  const auto = fromHash || remembered;

  if (auto) {
    try {
      C = await decrypt(ENC, auto);
      sessionStorage.setItem("invite-pw", auto);
      history.replaceState(null, "", location.pathname + location.search);
      render();
      requestAnimationFrame(() => open({ instant: !!remembered && !fromHash }));
      return;
    } catch { sessionStorage.removeItem("invite-pw"); }
  }

  $("#pw").focus();
})();

/* ──────────────────────────  the gate  ────────────────────────── */

$("#gate").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = $("#pw").value.trim();
  if (!pw) return;

  const btn = $("#gate-btn");
  btn.disabled = true;
  $("#gate-err").hidden = true;

  try {
    C = await decrypt(ENC, pw);
  } catch {
    btn.disabled = false;
    $("#gate-err").hidden = false;
    const g = $("#gate");
    g.classList.remove("wrong");
    void g.offsetWidth;
    g.classList.add("wrong");
    $("#pw").select();
    return;
  }

  sessionStorage.setItem("invite-pw", pw);
  render();
  open({ instant: false });
});

/* ─────────────────────────  rendering  ────────────────────────── */

function render() {
  const card = C.card || {};
  $("#c-eyebrow").textContent  = card.eyebrow  || "";
  $("#c-title").textContent    = card.title    || "";
  $("#c-subtitle").textContent = card.subtitle || "";
  $("#c-footer").textContent   = card.footer   || "";
  $("#c-lines").innerHTML = "";
  (card.lines || []).forEach((line) => {
    const d = document.createElement("div");
    d.textContent = line;
    $("#c-lines").appendChild(d);
  });

  loadBackdrop();
  initMusic();

  // hide empty slots so the layout stays tight
  ["#c-eyebrow", "#c-subtitle", "#c-footer"].forEach((sel) => {
    const el = $(sel);
    el.hidden = !el.textContent;
  });
}

/* ────────────────────  the opening sequence  ──────────────────── */

function measure() {
  // The card is portrait, the envelope landscape, so the card is scaled to the
  // envelope's width and clipped at the envelope's bottom edge — the cut lands
  // exactly where the paper ends, so the seam is never visible.
  //
  // Everything is keyed off the envelope's real rect: the gate sits below it,
  // which pushes the envelope above the centre of the viewport.
  const card = $("#card");
  const er = $("#envelope").getBoundingClientRect();

  card.style.setProperty("--c-scale", "1");
  const w = card.offsetWidth, h = card.offsetHeight;
  if (!er.width || !w || !h) {
    card.style.removeProperty("--c-scale");
    return false;
  }

  const s = Math.min(0.9, (er.width * 0.78) / w);
  const ch = h * s, half = ch / 2;
  const vc = window.innerHeight / 2;          // the card's untranslated centre

  const topIn = er.top + 14;                              // resting inside
  const topUp = Math.max(24, er.top - er.height * 0.34);  // drawn out, kept on screen

  const y    = (top) => top + half - vc;
  const clip = (top) => Math.max(0, Math.min(96, ((top + ch - er.bottom) / ch) * 100));

  card.style.setProperty("--c-scale", s.toFixed(4));
  card.style.setProperty("--c-y-in", `${y(topIn).toFixed(1)}px`);
  card.style.setProperty("--c-y-up", `${y(topUp).toFixed(1)}px`);
  card.style.setProperty("--c-clip-in", `${clip(topIn).toFixed(2)}%`);
  card.style.setProperty("--c-clip-up", `${clip(topUp).toFixed(2)}%`);
  return true;
}

function open({ instant }) {
  const card = $("#card");
  // A zero-sized viewport (background tab, printing) makes the choreography
  // meaningless — show the card outright instead.
  const measurable = measure();

  if (instant || !measurable) {                       // returning visitor — no theatrics
    revealBackdrop();
    startMusic();
    $("#stage").classList.add("gone");
    card.style.transition = "none";
    card.classList.add("staged", "risen", "open");
    void card.offsetWidth;
    card.style.transition = "";
    finish();
    return;
  }

  const at = (ms, fn) => setTimeout(fn, ms);

  $("#gate").style.transition = "opacity .5s ease";
  $("#gate").style.opacity = "0";
  $("#pw").blur();

  startMusic();                                       // still inside the click

  at(120,  () => $("#seal").classList.add("broken"));
  at(560,  () => {
    $("#flap").classList.add("open");
    card.classList.add("staged");
    revealBackdrop();
  });
  at(1300, () => card.classList.add("risen"));
  at(2400, () => {
    $("#envelope").classList.add("dismissed");
    $("#stage").classList.add("gone");
    card.classList.add("open");
  });
  at(3450, finish);
}

function finish() {
  $("#sound").classList.add("shown");
  $("#stage").style.display = "none";
  $("#card").focus?.();
}

/* ────────────────────  backdrop photograph  ───────────────────── */

// Shown only once the file has really loaded, so a missing or misnamed
// photograph leaves the plain paper gradient rather than a broken panel.
//
// Loading and revealing are kept apart on purpose. The photograph can only
// start downloading after the payload is decrypted, so on a slow connection it
// may still be in flight when the envelope opens; whichever of the two happens
// last does the fade, and a late photograph simply eases in behind the card.
let backdropReady = false, backdropWanted = false;

function paintBackdrop() {
  if (backdropReady && backdropWanted) document.body.classList.add("has-backdrop");
}

function loadBackdrop() {
  const b = C.background;
  if (!b || !b.image) return;

  const img = new Image();
  img.onload = () => {
    const root = document.documentElement.style;
    // Absolute on purpose: a relative url() inside a custom property is
    // resolved against the stylesheet that consumes it (assets/style.css),
    // not against the page — which would look for assets/assets/…
    root.setProperty("--bd-img", `url("${new URL(b.image, location.href).href}")`);
    if (b.dim != null) root.setProperty("--bd-dim", b.dim);
    if (b.blur) {
      root.setProperty("--bd-blur", `${b.blur}px`);
      // scale up with the blur, or its soft edge creeps into frame
      root.setProperty("--bd-scale", (1.04 + b.blur * 0.006).toFixed(3));
    }
    if (b.tint === "light") document.body.classList.add("tint-light");
    backdropReady = true;
    paintBackdrop();
  };
  img.src = b.image;
}

const revealBackdrop = () => { backdropWanted = true; paintBackdrop(); };

/* ───────────────────────────  music  ──────────────────────────── */

const audio = $("#audio");
let tracks = [], track = 0, targetVol = 0.35, fade = null;

function initMusic() {
  const m = C.music;
  if (!m || !Array.isArray(m.tracks) || !m.tracks.length) return;

  tracks = m.shuffle ? m.tracks.slice().sort(() => Math.random() - 0.5) : m.tracks.slice();
  targetVol = typeof m.volume === "number" ? m.volume : 0.35;
  audio.volume = 0;

  audio.addEventListener("ended", () => {
    track = (track + 1) % tracks.length;
    cue(track);
    audio.play().catch(() => {});
  });
  // If a file is missing or the format is unplayable, step over it quietly.
  // Once every track has failed, retire the control rather than leaving a
  // dead button on the card — and stop, so we don't loop over the errors.
  let failures = 0;
  audio.addEventListener("error", () => {
    if (++failures >= tracks.length) {
      setSoundUI(false);
      $("#sound").hidden = true;
      return;
    }
    track = (track + 1) % tracks.length;
    cue(track);
    audio.play().catch(() => {});
  });
  audio.addEventListener("playing", () => { failures = 0; });

  $("#sound").hidden = false;
  $("#sound-btn").addEventListener("click", toggleMusic);
}

function cue(i) {
  audio.src = tracks[i].src;
  announce(tracks[i].title);
}

// Ramps the volume rather than snapping it — a nocturne should arrive quietly.
// Deliberately a timer, not requestAnimationFrame: rAF is frozen in a
// background tab, which would leave the music playing at silence for anyone
// who opens the invitation in a new tab and switches to it afterwards.
function ramp(to, ms, done) {
  clearInterval(fade);
  const from = audio.volume, t0 = Date.now(), tick = 40;
  fade = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / ms);
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k >= 1) { clearInterval(fade); done?.(); }
  }, tick);
}

// Must be called from the click that opens the envelope, or autoplay is refused.
function startMusic() {
  if (!tracks.length) return;
  cue(track);
  audio.play()
    .then(() => { ramp(targetVol, 2600); setSoundUI(true); })
    .catch(() => setSoundUI(false));   // blocked — leave it for the guest to start
  $("#sound").classList.add("shown");
}

function toggleMusic() {
  if (audio.paused) {
    audio.play().then(() => { ramp(targetVol, 900); setSoundUI(true); }).catch(() => {});
  } else {
    ramp(0, 700, () => audio.pause());
    setSoundUI(false);
  }
}

function setSoundUI(on) {
  $("#sound-btn").setAttribute("aria-pressed", on ? "true" : "false");
}

let announceTimer = null;
function announce(title) {
  const el = $("#sound-title");
  if (!title) return;
  el.textContent = title;
  el.classList.add("shown");
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => el.classList.remove("shown"), 6500);
}

/* ───────────────────────  pane switching  ─────────────────────── */

function swapPane(fromSel, toSel) {
  const body = $("#card-body");
  const from = $(fromSel), to = $(toSel);

  const h0 = body.offsetHeight;
  from.classList.add("fading");

  setTimeout(() => {
    from.hidden = true;
    to.hidden = false;
    to.classList.add("fading");
    const h1 = body.offsetHeight;

    body.style.height = h0 + "px";
    void body.offsetHeight;
    body.style.height = h1 + "px";

    requestAnimationFrame(() => to.classList.remove("fading"));
    setTimeout(() => {
      body.style.height = "";
      from.classList.remove("fading");
      $("#card").scrollTop = 0;
    }, 520);
  }, 300);
}

$("#btn-rsvp").addEventListener("click", () => swapPane("#pane-invite", "#pane-form"));
$("#btn-back").addEventListener("click", () => swapPane("#pane-form", "#pane-invite"));
$("#btn-amend").addEventListener("click", () => swapPane("#pane-done", "#pane-form"));

/* ────────────────────────  calendar files  ────────────────────── */

// Interpret a wall-clock string in an IANA zone and return the UTC instant.
function zonedToUTC(wall, tz) {
  const guess = new Date(wall + "Z");
  const shift = (d) => {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(d).reduce((o, x) => ((o[x.type] = x.value), o), {});
    const asUTC = Date.UTC(+p.year, p.month - 1, +p.day,
                           p.hour % 24, +p.minute, +p.second);
    return asUTC - d.getTime();
  };
  let t = guess.getTime() - shift(guess);
  t = guess.getTime() - shift(new Date(t));   // second pass handles DST edges
  return new Date(t);
}

const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function eventTimes() {
  const e = C.event || {};
  const tz = e.timezone || "UTC";
  return { start: zonedToUTC(e.start, tz), end: zonedToUTC(e.end, tz) };
}

function locationFor(attendance) {
  const e = C.event || {};
  return attendance === "remote"
    ? (e.locationRemote  || "")
    : (e.locationInPerson || e.locationRemote || "");
}

function buildICS(attendance) {
  const e = C.event || {};
  const { start, end } = eventTimes();
  const esc = (s) => String(s || "")
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;")
    .replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

  const desc = [e.description, attendance === "remote" ? e.locationRemote : ""]
    .filter(Boolean).join("\n\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//thesis invitation//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@invitation`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`,
    `LOCATION:${esc(locationFor(attendance))}`,
    `DESCRIPTION:${esc(desc)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function googleURL(attendance) {
  const e = C.event || {};
  const { start, end } = eventTimes();
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title || "",
    dates: `${stamp(start)}/${stamp(end)}`,
    details: [e.description, attendance === "remote" ? e.locationRemote : ""]
      .filter(Boolean).join("\n\n"),
    location: locationFor(attendance),
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/* ─────────────────────────  RSVP submit  ──────────────────────── */

let icsURL = null;

$("#rsvp-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err  = $("#form-err");
  const send = $("#btn-send");
  err.hidden = true;

  const name  = $("#f-name").value.trim();
  const email = $("#f-email").value.trim();
  const attendance = document.querySelector("input[name=attendance]:checked").value;
  const note  = $("#f-note").value.trim();

  const bad = (el, msg) => {
    el.classList.add("invalid");
    err.textContent = msg;
    err.hidden = false;
    el.focus();
  };
  $("#f-name").classList.remove("invalid");
  $("#f-email").classList.remove("invalid");

  if (!name)  return bad($("#f-name"),  "Please add your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return bad($("#f-email"), "Please check the email address.");

  send.disabled = true;
  send.textContent = "Sending";

  const { start, end } = eventTimes();
  const payload = {
    name, email, attendance, note,
    eventTitle: (C.event || {}).title || "",
    eventStart: start.toISOString(),
    eventEnd:   end.toISOString(),
    location:   locationFor(attendance),
    ics:        buildICS(attendance),
    submittedAt: new Date().toISOString(),
  };

  const cfg = C.rsvp || {};
  try {
    if (cfg.endpoint && !/PASTE_|CHANGE_ME/.test(cfg.endpoint)) {
      if (cfg.mode === "formspree") {
        const r = await fetch(cfg.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error("bad status");
      } else {
        // Apps Script: text/plain keeps it a simple request (no CORS preflight)
        const r = await fetch(cfg.endpoint, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error("bad status");
      }
    } else {
      console.warn("RSVP endpoint not configured — reply was not sent anywhere.");
    }
  } catch {
    send.disabled = false;
    send.textContent = "Send";
    err.textContent = "That didn’t go through. Please try once more.";
    err.hidden = false;
    return;
  }

  showConfirmation({ name, attendance });
  send.disabled = false;
  send.textContent = "Send";
});

function showConfirmation({ name, attendance }) {
  const first = name.split(/\s+/)[0];
  const msg = {
    "in-person": `We’ll see you there, ${first}. A confirmation is on its way to your inbox.`,
    "remote":    `You’re on the list, ${first}. The joining link is in your inbox and in the calendar entry below.`,
    "regrets":   `Thank you for letting us know, ${first}. You’ll be missed.`,
  }[attendance];

  $("#d-msg").textContent = msg;
  $("#d-eyebrow").textContent = attendance === "regrets" ? "Noted" : "Received";
  $("#d-title").textContent   = attendance === "regrets" ? "With regrets" : "Thank you";

  const cal = $("#d-cal");
  cal.hidden = attendance === "regrets";

  if (!cal.hidden) {
    if (icsURL) URL.revokeObjectURL(icsURL);
    icsURL = URL.createObjectURL(
      new Blob([buildICS(attendance)], { type: "text/calendar;charset=utf-8" })
    );
    $("#cal-ics").href = icsURL;
    $("#cal-google").href = googleURL(attendance);
  }

  swapPane("#pane-form", "#pane-done");
}
