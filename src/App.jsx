import { useState, useEffect, useRef } from "react";

/* ─── STORAGE KEYS ─────────────────────────────────────────────── */
const KEYS = {
  entries:    "healthish:entries",
  profile:    "healthish:profile",
  onboarded:  "healthish:onboarded",
  icp:        "healthish:icp",
};

/* ─── ONESIGNAL ─────────────────────────────────────────────────── */
const ONESIGNAL_APP_ID = "c4a25421-fc97-4772-8bf4-4453b5de6e4f";

function initOneSignal() {
  if (typeof window === "undefined") return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      serviceWorkerParam: { scope: "/" },
      notifyButton: { enable: false },
      allowLocalhostAsSecureOrigin: true,
    });
  });
}

async function requestNotificationPermission() {
  try {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      const permission = await OneSignal.Notifications.requestPermission();
      return permission;
    });
  } catch(e) {
    console.log("Notification permission request failed", e);
  }
}

/* ─── PERIOD HELPERS ────────────────────────────────────────────── */
const PERIODS = {
  morning: { label:"Morning",  hours:[8,12],  icon:"🌅", color:"#c4840a" },
  midday:  { label:"Midday",   hours:[14,18], icon:"☀️",  color:"#7f77dd" },
  evening: { label:"Evening",  hours:[20,24], icon:"🌙", color:"#1d9e75" },
};

// Returns which period is active right now, or null if between windows
function getCurrentPeriod() {
  const h = new Date().getHours();
  if (h >= 8  && h < 12) return "morning";
  if (h >= 14 && h < 18) return "midday";
  if (h >= 20)           return "evening";
  return null;
}

// Entry key includes period: "2026-04-08:morning"
const periodKey = (date, period) => `${date}:${period}`;

// Get all entries for a given date across all periods
function getDayEntries(entries, date) {
  return {
    morning: entries.find(e => e.date === date && e.period === "morning") || null,
    midday:  entries.find(e => e.date === date && e.period === "midday")  || null,
    evening: entries.find(e => e.date === date && e.period === "evening") || null,
  };
}

// Merge day entries into a single scoring object
function mergeDayEntries(day) {
  const { morning, midday, evening } = day;
  if (!morning && !midday && !evening) return null;
  return {
    ...( morning || {}),
    ...( midday  || {}),
    ...( evening || {}),
    // Scoring fields — use most recent non-null value
    date:           (evening||midday||morning).date,
    sleepHrs:       morning?.sleepHrs       ?? 7,
    bedtimeHr:      morning?.bedtimeHr      ?? 23,
    energy:         morning?.energy         ?? 3,
    sunlight:       morning?.sunlight       ?? false,
    mealBefore2:    morning?.mealBefore2    ?? false,
    caffeineCups:   (evening||midday||morning)?.caffeineCups ?? 2,
    upskillHrs:     (midday||evening)?.upskillHrs    ?? 0,
    clarity:        midday?.clarity         ?? 3,
    screenTimeHrs:  (midday||evening)?.screenTimeHrs ?? 3,
    sideHustle:     (evening||midday)?.sideHustle    ?? "none",
    hobbyMins:      (evening||midday)?.hobbyMins     ?? 0,
    pagesRead:      (evening||midday)?.pagesRead     ?? 0,
    meditationMins: evening?.meditationMins ?? 0,
    mood:           (evening||midday||morning)?.mood ?? 3,
    familyContact:  evening?.familyContact  ?? "none",
    contactQuality: evening?.contactQuality ?? false,
    meaning:        evening?.meaning        ?? false,
    enjoyable:      evening?.enjoyable      ?? false,
    gratitude:      evening?.gratitude      ?? "",
    cigarettes:     evening?.cigarettes     ?? 0,
    alcohol:        evening?.alcohol        ?? 0,
    sugarDay:       evening?.sugarDay       ?? false,
    junkDinner:     evening?.junkDinner     ?? false,
    hydrated:       evening?.hydrated       ?? true,
    timeWasted:     evening?.timeWasted     ?? 0,
    rumination:     (evening||midday)?.rumination    ?? 1,
    negativeSelfTalk: evening?.negativeSelfTalk ?? false,
    socialMins:     (evening||midday)?.socialMins    ?? 0,
    masturbation:   evening?.masturbation   ?? false,
    lateNightPhone: evening?.lateNightPhone ?? false,
    reactivity:     evening?.reactivity     ?? false,
  };
}

/* ─── SCORING ENGINE ────────────────────────────────────────────── */
function scorePhysical(e, allEntries) {
  let pts = 0;
  const dow = new Date(e.date).getDay(); // 0=Sun,1=Mon...6=Sat
  const workoutDays = [1,2,3,5,6]; // Mon Tue Wed Fri Sat
  const isWorkoutDay = workoutDays.includes(dow);

  // Workout — 30 pts
  if (isWorkoutDay) {
    if (e.workoutMins >= 60) pts += 30;
    else if (e.workoutMins >= 30) pts += 15;
    else pts += 0;
  } else {
    pts += 20; // rest day — give partial credit so score isn't tanked
  }

  // Sleep duration — 20 pts
  const sl = e.sleepHrs || 0;
  if (sl >= 7 && sl <= 9) pts += 20;
  else if (sl >= 6) pts += 12;
  else if (sl > 9) pts += 14;
  else pts += 0;

  // Sleep consistency — 10 pts (last 7 entries bedtimes)
  const recent = allEntries.slice(-7).filter(x => x.bedtimeHr !== undefined);
  if (recent.length >= 3) {
    const mean = recent.reduce((a,b) => a + b.bedtimeHr, 0) / recent.length;
    const sd = Math.sqrt(recent.reduce((a,b) => a + Math.pow(b.bedtimeHr - mean, 2), 0) / recent.length);
    if (sd < 0.33) pts += 10;
    else if (sd < 0.67) pts += 6;
    else pts += 0;
  } else pts += 5; // not enough data yet

  // Physical energy — 15 pts (moderated by sleep)
  const rawEnergy = ((e.energy || 3) / 5) * 15;
  const energyMod = (e.sleepHrs || 7) < 6 ? 0.7 : 1;
  pts += Math.round(rawEnergy * energyMod);

  // Sunlight — 10 pts
  if (e.sunlight) pts += 10;

  // First meal before 2pm — 8 pts
  if (e.mealBefore2) pts += 8;

  // Caffeine cups — modest contribution to physical score
  const cups = e.caffeineCups || 2;
  if (cups <= 2) pts += 7;
  else if (cups <= 4) pts += 4;
  else pts += 0;

  return Math.min(100, pts);
}

function scoreMental(e) {
  let pts = 0;

  // Upskilling — 35 pts
  const dow = new Date(e.date).getDay();
  const isWeekend = dow === 0 || dow === 6;
  const upHrs = e.upskillHrs || 0;
  if (isWeekend) {
    if (upHrs >= 6) pts += 35;
    else if (upHrs >= 3) pts += 22;
    else if (upHrs >= 1) pts += 10;
  } else {
    if (upHrs >= 2) pts += 35;
    else if (upHrs >= 1) pts += 20;
    else if (upHrs >= 0.5) pts += 10;
  }

  // Mental clarity — 25 pts (moderated by screen time)
  const rawClarity = ((e.clarity || 3) / 5) * 25;
  const screenMod = (e.screenTimeHrs || 3) > 5 ? 0.8 : 1;
  pts += Math.round(rawClarity * screenMod);

  // Screen time — 20 pts
  const st = e.screenTimeHrs || 3;
  if (st < 2) pts += 20;
  else if (st < 3) pts += 15;
  else if (st < 4) pts += 8;
  else if (st < 5) pts += 3;
  else pts += 0;

  // Side hustle — 10 pts
  const sh = e.sideHustle || "none";
  if (sh === "built") pts += 10;
  else if (sh === "progress") pts += 6;

  // Hobby — 10 pts
  const chess = e.hobbyMins || e.chessMins || 0;
  if (chess >= 30) pts += 10;
  else if (chess >= 15) pts += 6;

  return Math.min(100, pts);
}

function scoreEmotional(e, allEntries) {
  let pts = 0;

  // Meditation — 25 pts
  const med = e.meditationMins || 0;
  if (med >= 10) pts += 25;
  else if (med >= 5) pts += 15;

  // Mood — 20 pts
  pts += Math.round(((e.mood || 3) / 5) * 20);

  // Family contact — 20 pts (with streak penalty)
  const recentDays = allEntries.slice(-3);
  const consecutiveNoContact = recentDays.filter(x => !x.familyContact).length;
  if (e.familyContact === "both") pts += 20;
  else if (e.familyContact === "one") pts += 15;
  else if (e.familyContact === "voicenote") pts += 8;
  else {
    // no contact
    if (consecutiveNoContact >= 3) pts += 0;
    else if (consecutiveNoContact >= 2) pts += 5;
    else pts += 10;
  }
  if (e.familyContact && e.familyContact !== "none" && e.contactQuality) pts += 5; // quality bonus

  // Sense of meaning — 15 pts
  if (e.meaning) pts += 15;

  // Something enjoyable — 10 pts
  if (e.enjoyable) pts += 10;

  // Gratitude — 10 pts
  if (e.gratitude && e.gratitude.trim().length > 2) pts += 10;

  return Math.min(100, pts);
}

function scoreDrain(e, allEntries) {
  let drain = 0;

  // Cigarettes — max 30
  const cigs = e.cigarettes || 0;
  if (cigs >= 8) drain += 30;
  else if (cigs >= 4) drain += 20;
  else if (cigs >= 1) drain += 10;

  // Alcohol — max 10
  const alc = e.alcohol || 0;
  if (alc >= 3) drain += 10;
  else if (alc >= 1) drain += 5;

  // Caffeine excess — max 5 (scoring based on cups only now)
  const caff = e.caffeineCups || 2;
  if (caff >= 5) drain += 5;
  else if (caff >= 3) drain += 2;

  // Sugar/junk — max 5
  if (e.sugarDay) drain += 3;
  if (e.junkDinner) drain += 3;
  drain = Math.min(drain, drain); // already bounded by individual caps

  // Hydration — max 3
  if (!e.hydrated) drain += 3; // <3L water

  // Time wasted — max 20
  const tw = e.timeWasted || 0;
  if (tw >= 2) drain += 20;
  else if (tw >= 1) drain += 12;
  else if (tw >= 0.5) drain += 5;

  // Rumination — max 8
  const rum = e.rumination || 1;
  drain += Math.round((rum - 1) * 2);

  // Negative self-talk — max 5
  if (e.negativeSelfTalk) drain += 5;

  // Doomscrolling (from screen time social — estimated as 30% of total screen time if > threshold)
  const social = e.socialMins || 0;
  if (social >= 60) drain += 7;
  else if (social >= 30) drain += 3;

  // Masturbation pattern — only penalises streaks
  const recentMast = allEntries.slice(-7).filter(x => x.masturbation).length;
  if (recentMast >= 7) drain += 10;
  else if (recentMast >= 3) drain += 5;

  // Late night phone
  if (e.lateNightPhone) drain += 5;

  // Skipped commitments
  const skipped = e.skippedCount || 0;
  if (skipped >= 2) drain += 7;
  else if (skipped === 1) drain += 3;

  // Reactivity
  if (e.reactivity) drain += 5;

  return Math.min(100, drain);
}

function drainLabel(score) {
  if (score <= 15) return { label: "Clean", color: "#3d8c6c" };
  if (score <= 40) return { label: "Leaking", color: "#c4840a" };
  return { label: "Heavy drain", color: "#c8553d" };
}

function healthLabel(score) {
  if (score >= 85) return "Thriving";
  if (score >= 70) return "Good";
  if (score >= 50) return "Moderate";
  if (score >= 30) return "Low";
  return "Needs work";
}

/* ─── STORAGE ───────────────────────────────────────────────────── */
// Direct localStorage — works on PWA, browser, everywhere.
// window.storage (Antigravity) is tried first; falls back to localStorage.
const LS = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, val) {
    try { localStorage.setItem(key, val); return true; } catch { return false; }
  },
};

async function storageGet(key) {
  // Try Antigravity storage first (Claude artifact env)
  try {
    if (window.storage) {
      const r = await window.storage.get(key);
      if (r?.value) return JSON.parse(r.value);
    }
  } catch {}
  // Fall back to localStorage (PWA on phone)
  try {
    const val = LS.get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

async function storageSet(key, val) {
  const str = JSON.stringify(val);
  // Write to both so data is always in localStorage as the persistent source
  LS.set(key, str);
  try {
    if (window.storage) await window.storage.set(key, str);
  } catch {}
}

/* ─── FONTS ─────────────────────────────────────────────────────── */
const FONT_URL = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500&display=swap";

/* ─── GLOBAL STYLES ─────────────────────────────────────────────── */
const G = `
@import url('${FONT_URL}');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
:root{
  --bg:#141412;--bg2:#1e1c1a;--bg3:#252320;--card:#1e1c1a;
  --border:#2e2b28;--border2:#3a3734;
  --ink:#f2ede6;--ink2:#c8c0b4;--muted:#7a7268;
  --accent:#c8553d;--accent2:#d4724c;
  --teal:#1d9e75;--purple:#7f77dd;--amber:#c4840a;
  --red:#c8553d;--green:#3d8c6c;
  --serif:'Playfair Display',Georgia,serif;
  --sans:'DM Sans',system-ui,sans-serif;
  --r:14px;--r2:10px;--r3:20px;
}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);height:100vh;overflow:hidden}
.app{max-width:430px;margin:0 auto;height:100vh;display:flex;flex-direction:column;overflow:hidden}
input,textarea,select{font-family:var(--sans);color:var(--ink);background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--r2);outline:none}
input:focus,textarea:focus,select:focus{border-color:var(--accent)}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:2px;border:none;cursor:pointer}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:var(--ink);cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.5)}
button{font-family:var(--sans);cursor:pointer;border:none;transition:opacity .15s,transform .1s}
button:active{transform:scale(.97)}

/* NAV */
.nav{background:var(--bg2);border-top:0.5px solid var(--border);display:flex;padding:10px 0 20px;flex-shrink:0}
.nav-btn{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px;background:none;border:none;color:var(--muted);font-size:10px;letter-spacing:.2px}
.nav-btn.active{color:var(--accent)}
.nav-btn svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}

/* SCREENS */
.screen{display:none;flex:1;flex-direction:column;overflow:hidden;min-height:0}
.screen.active{display:flex}
.scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 0 16px}
.scroll::-webkit-scrollbar{display:none}

/* CARDS */
.card{background:var(--card);border:0.5px solid var(--border);border-radius:var(--r);padding:16px}
.card+.card{margin-top:10px}

/* TYPOGRAPHY */
.serif{font-family:var(--serif)}
.muted{color:var(--muted)}
.label{font-size:10px;font-weight:500;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)}

/* SECTION */
.section{padding:0 16px}
.section+.section{margin-top:16px}
.section-title{font-size:10px;font-weight:500;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:10px}

/* RINGS */
.rings-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:0 16px}
.ring-card{background:var(--bg2);border:0.5px solid var(--border);border-radius:var(--r);padding:14px 8px;text-align:center;cursor:pointer;transition:border-color .2s}
.ring-card:hover{border-color:var(--border2)}
.ring-wrap{position:relative;width:70px;height:70px;margin:0 auto 8px}
.ring-wrap svg{width:70px;height:70px;transform:rotate(-90deg)}
.ring-track{fill:none;stroke:#2a2826;stroke-width:5}
.ring-fill{fill:none;stroke-width:5;stroke-linecap:round;transition:stroke-dasharray .9s ease}
.ring-pct{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-size:16px;font-weight:600;color:var(--ink)}
.ring-name{font-size:10px;font-weight:500;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.ring-status{font-size:11px;font-weight:500}

/* DRAIN CARD */
.drain-card{margin:10px 16px 0;background:var(--bg2);border:0.5px solid var(--border);border-radius:var(--r);padding:14px 16px;display:flex;align-items:center;justify-content:space-between}
.drain-label{font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
.drain-score{font-family:var(--serif);font-size:28px;font-weight:700}
.drain-bar-bg{flex:1;height:5px;background:var(--bg3);border-radius:3px;overflow:hidden;margin:0 16px}
.drain-bar{height:100%;border-radius:3px;transition:width .8s ease}

/* CHECK-IN */
.ci-block{background:var(--bg2);border:0.5px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:10px}
.ci-block-title{font-size:10px;font-weight:500;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
.ci-row{margin-bottom:14px}
.ci-row:last-child{margin-bottom:0}
.ci-q{font-size:13px;color:var(--ink2);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
.ci-val{font-family:var(--serif);font-size:18px;color:var(--accent)}
.ci-ends{display:flex;justify-content:space-between;margin-top:4px}
.ci-end{font-size:10px;color:var(--muted)}
.ci-chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{padding:7px 14px;border-radius:20px;font-size:12px;font-weight:500;border:0.5px solid var(--border2);background:var(--bg3);color:var(--ink2);cursor:pointer;transition:all .15s}
.chip.selected{background:var(--accent);border-color:var(--accent);color:#fff}
.chip.selected-alt{background:var(--teal);border-color:var(--teal);color:#fff}
.toggle-row{display:flex;gap:8px}
.tog{flex:1;padding:9px;border-radius:var(--r2);font-size:12px;font-weight:500;border:0.5px solid var(--border2);background:var(--bg3);color:var(--muted);cursor:pointer;text-align:center;transition:all .15s}
.tog.on{background:var(--teal);border-color:var(--teal);color:#fff}
.tog.off{background:#2a1a1a;border-color:#4a2020;color:#c85050}
.num-input{width:100%;padding:10px 12px;font-size:16px}
.submit-btn{width:calc(100% - 32px);margin:16px;padding:15px;background:var(--accent);color:#fff;border-radius:var(--r);font-size:15px;font-weight:500;letter-spacing:.2px}
.submit-btn:disabled{opacity:.4;cursor:not-allowed}

/* HEADER */
.hdr{padding:52px 16px 16px;display:flex;align-items:flex-start;justify-content:space-between}
.hdr-name{font-family:var(--serif);font-size:26px;color:var(--ink);letter-spacing:-.3px}
.hdr-date{font-size:12px;color:var(--muted);margin-top:3px}
.avatar{width:40px;height:40px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-size:16px;font-weight:600;color:#fff;cursor:pointer;flex-shrink:0}

/* SIGNALS */
.signal-item{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:0.5px solid var(--border)}
.signal-item:last-child{border-bottom:none}
.signal-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:4px}
.signal-text{font-size:13px;color:var(--ink2);line-height:1.5}

/* WEEK STRIP */
.week-strip{display:flex;gap:6px;padding:0 16px;overflow-x:auto}
.week-strip::-webkit-scrollbar{display:none}
.week-day{display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0}
.week-dot{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600}
.week-lbl{font-size:9px;color:var(--muted);letter-spacing:.3px}

/* HISTORY */
.h-row{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:0.5px solid var(--border)}
.h-row:last-child{border-bottom:none}
.h-date{font-size:11px;color:var(--muted);width:52px;flex-shrink:0}
.h-scores{display:flex;gap:6px}
.h-score{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0}
.h-drain{font-size:11px;color:var(--muted);margin-left:auto}

/* PROFILE */
.profile-hdr{padding:52px 16px 20px;display:flex;gap:14px;align-items:center;border-bottom:0.5px solid var(--border)}
.profile-avatar{width:64px;height:64px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-size:26px;font-weight:700;color:#fff;flex-shrink:0}
.p-row{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:0.5px solid var(--border)}
.p-row:last-child{border-bottom:none}
.p-key{font-size:13px;color:var(--muted)}
.p-val{font-size:13px;font-weight:500;color:var(--ink)}
.mbti-badge{display:inline-block;background:#26215C;color:#AFA9EC;font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;margin-top:4px}

/* ONBOARDING */
.ob-wrap{min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:32px 24px;background:var(--bg)}
.ob-title{font-family:var(--serif);font-size:36px;color:var(--ink);margin-bottom:8px;line-height:1.2}
.ob-sub{font-size:14px;color:var(--muted);line-height:1.7;margin-bottom:32px}
.ob-field{margin-bottom:16px}
.ob-label{font-size:11px;font-weight:500;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.ob-input{width:100%;padding:12px 14px;font-size:15px;border-radius:var(--r)}
.ob-btn{width:100%;padding:15px;background:var(--accent);color:#fff;border-radius:var(--r);font-size:16px;font-weight:500;margin-top:8px}

/* RECOMMENDATIONS */
.rec-card{background:var(--bg2);border:0.5px solid var(--border);border-radius:var(--r);padding:14px 16px;margin-bottom:10px}
.rec-top{display:flex;align-items:flex-start;gap:10px;margin-bottom:8px}
.rec-icon{font-size:16px;flex-shrink:0;margin-top:1px}
.rec-cat{font-size:9px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;margin-bottom:2px}
.rec-title{font-size:14px;font-weight:500;color:var(--ink);line-height:1.3}
.rec-effort{font-size:10px;color:var(--muted);background:var(--bg3);border:0.5px solid var(--border2);border-radius:20px;padding:3px 8px;white-space:nowrap;flex-shrink:0;margin-top:2px}
.rec-body{font-size:12px;color:var(--ink2);line-height:1.6;padding-left:26px}

/* ANIMATIONS */
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.fade-up{animation:fadeUp .35s ease forwards}
@keyframes spin{to{stroke-dashoffset:-20}}
`;

/* ─── HELPERS ───────────────────────────────────────────────────── */
const TODAY = () => new Date().toISOString().split("T")[0];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const fmtDate = d => {
  const now = new Date(); const date = new Date(d);
  const diff = Math.floor((now-date)/86400000);
  if (diff===0) return "Today"; if (diff===1) return "Yesterday";
  return date.toLocaleDateString("en-IN",{day:"numeric",month:"short"});
};
const getInitials = name => (name||"S").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
const scoreColor = s => s>=70?"#3d8c6c":s>=45?"#c4840a":"#c8553d";
const ringCirc = 27 * 2 * Math.PI; // r=27, circ≈169.6

function Ring({ pct, color, size=70, stroke=5 }) {
  const r = (size/2) - stroke;
  const circ = r * 2 * Math.PI;
  const fill = Math.min(1, pct/100) * circ;
  return (
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle className="ring-track" cx={size/2} cy={size/2} r={r} strokeWidth={stroke}/>
      <circle className="ring-fill" cx={size/2} cy={size/2} r={r}
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${fill} ${circ}`}/>
    </svg>
  );
}

/* ─── ONBOARDING ────────────────────────────────────────────────── */
function Onboarding({ onDone, existing }) {
  const [name,setName]=useState(existing?.name||"");
  const [dob,setDob]=useState(existing?.dob||"");
  const [weight,setWeight]=useState(existing?.weight||"");
  const [height,setHeight]=useState(existing?.height||"");
  const [mbti,setMbti]=useState(existing?.mbti||"");
  const isEdit = !!existing?.name;

  const save = async () => {
    if (!name.trim()) return;
    const profile = { name:name.trim(), dob, weight, height, mbti:mbti.toUpperCase() };
    await storageSet(KEYS.profile, profile);
    await storageSet(KEYS.onboarded, true);
    onDone(profile);
  };

  return (
    <div className="ob-wrap">
      <div className="ob-title fade-up">{isEdit ? "Update your\nprofile." : "Hey there.\nLet's set up\nyour space."}</div>
      <div className="ob-sub fade-up" style={{animationDelay:".1s"}}>{isEdit ? "Changes save immediately." : "HealthIsh tracks your whole life — honestly. This takes 60 seconds."}</div>
      <div className="ob-field fade-up" style={{animationDelay:".15s"}}>
        <div className="ob-label">Your name</div>
        <input className="ob-input" placeholder="Skand" value={name} onChange={e=>setName(e.target.value)}/>
      </div>
      <div className="ob-field fade-up" style={{animationDelay:".2s"}}>
        <div className="ob-label">Date of birth</div>
        <input className="ob-input" type="date" value={dob} onChange={e=>setDob(e.target.value)}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}} className="fade-up" style2={{animationDelay:".25s"}}>
        <div className="ob-field">
          <div className="ob-label">Weight (kg)</div>
          <input className="ob-input" type="number" placeholder="72" value={weight} onChange={e=>setWeight(e.target.value)}/>
        </div>
        <div className="ob-field">
          <div className="ob-label">Height (cm)</div>
          <input className="ob-input" type="number" placeholder="175" value={height} onChange={e=>setHeight(e.target.value)}/>
        </div>
      </div>
      <div className="ob-field fade-up" style={{animationDelay:".3s"}}>
        <div className="ob-label" style={{display:"flex",alignItems:"center",gap:6}}>
          MBTI type (recommended)
          <span
            title="MBTI is a personality framework that identifies 16 types based on how you think, feel, and make decisions. Knowing your type helps HealthIsh personalise insights to your wiring."
            onClick={()=>window.open("https://www.16personalities.com/free-personality-test","_blank")}
            style={{
              width:16,height:16,borderRadius:"50%",
              background:"var(--border2)",color:"var(--muted)",
              fontSize:10,fontWeight:700,display:"inline-flex",
              alignItems:"center",justifyContent:"center",cursor:"pointer",
              flexShrink:0,border:"0.5px solid var(--border2)"
            }}>i</span>
        </div>
        <input className="ob-input" placeholder="e.g. INTJ" maxLength={4} value={mbti} onChange={e=>setMbti(e.target.value)}/>
        <div style={{fontSize:11,color:"var(--muted)",marginTop:5,lineHeight:1.5}}>
          Not sure?{" "}
          <span style={{color:"var(--accent)",cursor:"pointer",textDecoration:"underline"}}
            onClick={()=>window.open("https://www.16personalities.com/free-personality-test","_blank")}>
            Take the free test →
          </span>{" "}takes 12 minutes.
        </div>
      </div>
      <button className="ob-btn fade-up" style={{animationDelay:".35s"}} onClick={save}>
        {isEdit ? "Save changes" : "Let's go →"}
      </button>
      {isEdit && (
        <button onClick={()=>onDone(existing)} style={{
          width:"100%",marginTop:10,padding:"14px",background:"transparent",
          color:"var(--muted)",border:"0.5px solid var(--border2)",
          borderRadius:"var(--r)",fontSize:14,
        }}>Cancel</button>
      )}
    </div>
  );
}

/* ─── CHECK-IN FORM ─────────────────────────────────────────────── */
function CheckIn({ entries, onSave, goHome }) {
  const today = TODAY();
  const currentPeriod = getCurrentPeriod();
  const todayPeriods = getDayEntries(entries, today);

  const [activePeriod, setActivePeriod] = useState(currentPeriod || "evening");
  const [submitted, setSubmitted] = useState(false);

  // Level selector — only for evening
  const recentDates = [...new Set(entries.map(e=>e.date))].sort().slice(-3);
  const recentMerged = recentDates.map(d=>mergeDayEntries(getDayEntries(entries,d))).filter(Boolean);
  const avgRecentDrain = recentMerged.length
    ? Math.round(recentMerged.map(e=>scoreDrain(e,entries)).reduce((a,b)=>a+b,0)/recentMerged.length)
    : 0;
  const suggestedLevel = avgRecentDrain >= 41 ? 3 : 2;
  const [level, setLevel] = useState(suggestedLevel);

  // Physical
  const [workoutMins, setWorkoutMins] = useState(0);
  const [sleepBucket, setSleepBucket] = useState("7-8");
  const [bedtime, setBedtime] = useState("23:00");
  const [energy, setEnergy] = useState(3);
  const [sunlight, setSunlight] = useState(null);
  const [mealBefore2, setMealBefore2] = useState(null);
  const [caffeineCups, setCaffeineCups] = useState(2);

  // Mental
  const [upskillTime, setUpskillTime] = useState("0");
  const [clarity, setClarity] = useState(3);
  const [screenTime, setScreenTime] = useState("0");
  const [sideHustle, setSideHustle] = useState("none");
  const [hobbyTime, setHobbyTime] = useState("0");
  const [pagesRead, setPagesRead] = useState(0);

  // Emotional
  const [meditationMins, setMeditationMins] = useState(0);
  const [mood, setMood] = useState(3);
  const [familyContact, setFamilyContact] = useState("none");
  const [contactQuality, setContactQuality] = useState(false);
  const [meaning, setMeaning] = useState(null);
  const [enjoyable, setEnjoyable] = useState(null);
  const [gratitude, setGratitude] = useState("");

  // Drains
  const [cigarettes, setCigarettes] = useState(0);
  const [alcohol, setAlcohol] = useState(0);
  const [sugarDay, setSugarDay] = useState(false);
  const [junkDinner, setJunkDinner] = useState(false);
  const [hydrated, setHydrated] = useState(true);
  const [timeWasted, setTimeWasted] = useState(0);
  const [rumination, setRumination] = useState(1);
  const [negativeSelfTalk, setNegativeSelfTalk] = useState(false);
  const [socialMediaTime, setSocialMediaTime] = useState("0");
  const [masturbation, setMasturbation] = useState(false);
  const [lateNightPhone, setLateNightPhone] = useState(false);
  const [reactivity, setReactivity] = useState(false);

  // Re-populate state whenever activePeriod changes
  useEffect(() => {
    const e = todayPeriods[activePeriod] || {};
    setWorkoutMins(e.workoutMins??0);
    setSleepBucket(e.sleepBucket??"7-8");
    setBedtime(e.bedtime??"23:00");
    setEnergy(e.energy??3);
    setSunlight(e.sunlight??null);
    setMealBefore2(e.mealBefore2??null);
    setCaffeineCups(e.caffeineCups??2);
    setUpskillTime(e.upskillTime??"0");
    setClarity(e.clarity??3);
    setScreenTime(e.screenTime??"0");
    setSideHustle(e.sideHustle??"none");
    setHobbyTime(e.hobbyTime??e.chessTime??"0");
    setPagesRead(e.pagesRead??0);
    setMeditationMins(e.meditationMins??0);
    setMood(e.mood??3);
    setFamilyContact(e.familyContact??"none");
    setContactQuality(e.contactQuality??false);
    setMeaning(e.meaning??null);
    setEnjoyable(e.enjoyable??null);
    setGratitude(e.gratitude??"");
    setCigarettes(e.cigarettes??0);
    setAlcohol(e.alcohol??0);
    setSugarDay(e.sugarDay??false);
    setJunkDinner(e.junkDinner??false);
    setHydrated(e.hydrated??true);
    setTimeWasted(e.timeWasted??0);
    setRumination(e.rumination??1);
    setNegativeSelfTalk(e.negativeSelfTalk??false);
    setSocialMediaTime(e.socialMediaTime??"0");
    setMasturbation(e.masturbation??false);
    setLateNightPhone(e.lateNightPhone??false);
    setReactivity(e.reactivity??false);
    setSubmitted(false);
    if (activePeriod === "evening" && e.checkInLevel) setLevel(e.checkInLevel);
  }, [activePeriod]); // eslint-disable-line

  // Derive numeric values from time/bucket strings for scoring
  const timeToMins = t => {
    if (!t || t==="0") return 0;
    const parts = String(t).split(":").map(Number);
    return parts.length===2 ? parts[0]*60+parts[1] : parts[0]*60;
  };
  const timeToHrs = t => timeToMins(t)/60;
  const sleepBucketToHrs = b => ({ "under-5":4, "5-6":5.5, "6-7":6.5, "7-8":7.5, "8-9":8.5, "9+":9.5 }[b]??7.5);
  const bedtimeToHr = t => { const [h] = (t||"23:00").split(":").map(Number); return h >= 20 ? h : h+24; };

  const handleSave = async () => {
    const entry = {
      date: today, period: activePeriod, submitted: true, checkInLevel: level,
      workoutMins,
      sleepBucket, sleepHrs: sleepBucketToHrs(sleepBucket),
      bedtime, bedtimeHr: bedtimeToHr(bedtime),
      energy, sunlight, mealBefore2, caffeineCups,
      upskillTime, upskillHrs: timeToHrs(upskillTime),
      clarity,
      screenTime, screenTimeHrs: timeToHrs(screenTime),
      sideHustle,
      hobbyTime, hobbyMins: timeToMins(hobbyTime),
      pagesRead,
      meditationMins, mood, familyContact, contactQuality,
      meaning, enjoyable, gratitude,
      cigarettes, alcohol, sugarDay, junkDinner, hydrated,
      timeWasted, rumination, negativeSelfTalk,
      socialMediaTime, socialMins: timeToMins(socialMediaTime),
      masturbation, lateNightPhone, reactivity,
    };
    await onSave(entry);
    setSubmitted(true);
    goHome();
  };

  // ── UI components ──────────────────────────────────────────────

  // 5-point tap selector (replaces sliders for subjective 1-5 fields)
  function ScalePicker({label, val, setVal, low, high}) {
    return (
      <div className="ci-row">
        <div className="ci-q" style={{marginBottom:10}}><span>{label}</span></div>
        <div style={{display:"flex",gap:6}}>
          {[1,2,3,4,5].map(n=>(
            <div key={n} onClick={()=>setVal(n)} style={{
              flex:1, padding:"10px 0", borderRadius:"var(--r2)", textAlign:"center",
              fontSize:13, fontWeight:500, cursor:"pointer", transition:"all .15s",
              background: val===n ? "var(--accent)" : "var(--bg3)",
              color: val===n ? "#fff" : "var(--muted)",
              border: `0.5px solid ${val===n ? "var(--accent)" : "var(--border2)"}`,
            }}>{n}</div>
          ))}
        </div>
        <div className="ci-ends" style={{marginTop:5}}>
          <span className="ci-end">{low}</span>
          <span className="ci-end">{high}</span>
        </div>
      </div>
    );
  }

  // Sleep bucket selector
  function SleepBucket({val, setVal}) {
    const buckets = [
      {id:"under-5", label:"< 5h"},
      {id:"5-6",     label:"5–6h"},
      {id:"6-7",     label:"6–7h"},
      {id:"7-8",     label:"7–8h"},
      {id:"8-9",     label:"8–9h"},
      {id:"9+",      label:"9h+"},
    ];
    return (
      <div className="ci-row">
        <div className="ci-q" style={{marginBottom:10}}><span>Sleep last night</span></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
          {buckets.map(b=>(
            <div key={b.id} onClick={()=>setVal(b.id)} style={{
              padding:"10px 4px", borderRadius:"var(--r2)", textAlign:"center",
              fontSize:13, fontWeight:500, cursor:"pointer", transition:"all .15s",
              background: val===b.id ? "var(--teal)" : "var(--bg3)",
              color: val===b.id ? "#fff" : "var(--muted)",
              border: `0.5px solid ${val===b.id ? "var(--teal)" : "var(--border2)"}`,
            }}>{b.label}</div>
          ))}
        </div>
      </div>
    );
  }

  // Workout bucket selector
  function WorkoutBucket({val, setVal}) {
    const buckets = [
      {mins:0,   label:"Rest day"},
      {mins:30,  label:"30 min"},
      {mins:45,  label:"45 min"},
      {mins:60,  label:"1 hour"},
      {mins:75,  label:"75 min"},
      {mins:90,  label:"90 min+"},
    ];
    return (
      <div className="ci-row">
        <div className="ci-q" style={{marginBottom:10}}><span>Workout today</span></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
          {buckets.map(b=>(
            <div key={b.mins} onClick={()=>setVal(b.mins)} style={{
              padding:"10px 4px", borderRadius:"var(--r2)", textAlign:"center",
              fontSize:12, fontWeight:500, cursor:"pointer", transition:"all .15s",
              background: val===b.mins ? "var(--teal)" : "var(--bg3)",
              color: val===b.mins ? "#fff" : "var(--muted)",
              border: `0.5px solid ${val===b.mins ? "var(--teal)" : "var(--border2)"}`,
            }}>{b.label}</div>
          ))}
        </div>
      </div>
    );
  }

  // Time picker field (HH:MM native input)
  function TimePicker({label, val, setVal, hint}) {
    return (
      <div className="ci-row">
        <div className="ci-q" style={{marginBottom:8}}>
          <span>{label}</span>
          {hint && <span style={{fontSize:10,color:"var(--muted)"}}>{hint}</span>}
        </div>
        <input type="time" value={val} onChange={e=>setVal(e.target.value)}
          style={{width:"100%",padding:"11px 14px",fontSize:16,borderRadius:"var(--r2)",
            background:"var(--bg3)",border:"0.5px solid var(--border2)",color:"var(--ink)"}}/>
      </div>
    );
  }

  // Bucket picker with label, target hint, and accent color
  function BucketPicker({label, target, val, setVal, buckets, color}) {
    return (
      <div className="ci-row">
        <div className="ci-q" style={{marginBottom:6, flexDirection:"column", alignItems:"flex-start", gap:2}}>
          <span>{label}</span>
          <span style={{fontSize:10, color:"var(--teal)", fontWeight:500}}>{target}</span>
        </div>
        <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6}}>
          {buckets.map(b=>(
            <div key={b.v} onClick={()=>setVal(b.v)} style={{
              padding:"10px 4px", borderRadius:"var(--r2)", textAlign:"center",
              fontSize:12, fontWeight:500, cursor:"pointer", transition:"all .15s",
              background: val===b.v ? color : "var(--bg3)",
              color: val===b.v ? "#fff" : "var(--muted)",
              border: `0.5px solid ${val===b.v ? color : "var(--border2)"}`,
            }}>{b.l}</div>
          ))}
        </div>
      </div>
    );
  }

  // Duration picker — HH:MM for durations (upskill, screen time, social)
  function DurationPicker({label, val, setVal, hint}) {
    return (
      <div className="ci-row">
        <div className="ci-q" style={{marginBottom:8}}>
          <span>{label}</span>
          {hint && <span style={{fontSize:10,color:"var(--muted)"}}>{hint}</span>}
        </div>
        <input type="time" value={val} onChange={e=>setVal(e.target.value)}
          style={{width:"100%",padding:"11px 14px",fontSize:16,borderRadius:"var(--r2)",
            background:"var(--bg3)",border:"0.5px solid var(--border2)",color:"var(--ink)"}}/>
        <div style={{fontSize:10,color:"var(--muted)",marginTop:4}}>Enter as hours:minutes — e.g. 02:30 = 2.5 hours</div>
      </div>
    );
  }

  // Stepper for small counts (cigarettes, alcohol, caffeine)
  function Stepper({label, val, setVal, min=0, max=20, unit=""}) {
    return (
      <div className="ci-row">
        <div className="ci-q" style={{marginBottom:8}}><span>{label}</span></div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>setVal(Math.max(min,val-1))} style={{
            width:40,height:40,borderRadius:"50%",background:"var(--bg3)",
            border:"0.5px solid var(--border2)",color:"var(--ink)",fontSize:20,lineHeight:1
          }}>−</button>
          <div style={{flex:1,textAlign:"center",fontFamily:"var(--serif)",fontSize:28,color:"var(--accent)"}}>
            {val}{unit}
          </div>
          <button onClick={()=>setVal(Math.min(max,val+1))} style={{
            width:40,height:40,borderRadius:"50%",background:"var(--bg3)",
            border:"0.5px solid var(--border2)",color:"var(--ink)",fontSize:20,lineHeight:1
          }}>+</button>
        </div>
      </div>
    );
  }

  function YesNo({val, setVal}) {
    return (
      <div className="toggle-row">
        <div className={`tog ${val===true?"on":""}`} onClick={()=>setVal(true)}>Yes</div>
        <div className={`tog ${val===false&&val!==null?"off":""}`} onClick={()=>setVal(false)}>No</div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="scroll" style={{padding:"52px 16px 16px"}}>
        <div style={{textAlign:"center",padding:"60px 0"}}>
          <div style={{fontFamily:"var(--serif)",fontSize:28,marginBottom:10,color:"var(--ink)"}}>
            {PERIODS[activePeriod].icon} Saved.
          </div>
          <div style={{fontSize:14,color:"var(--muted)",lineHeight:1.6,marginBottom:24}}>
            {activePeriod==="morning" ? "Morning logged. Check back at 2pm." : activePeriod==="midday" ? "Midday logged. Evening check-in opens at 8pm." : "Day closed. See you tomorrow."}
          </div>
          <button style={{background:"var(--accent)",color:"#fff",padding:"12px 28px",borderRadius:"var(--r)",fontSize:14}} onClick={goHome}>Back to dashboard</button>
        </div>
      </div>
    );
  }

  // ── MORNING FORM ──────────────────────────────────────────────
  if (activePeriod === "morning") return (
    <div className="scroll" style={{padding:"0 0 16px"}}>
      <LevelHeader/>
      <div className="section" style={{marginTop:8}}>
        <div className="ci-block">
          <SleepBucket val={sleepBucket} setVal={setSleepBucket}/>
          <TimePicker label="Bedtime last night" val={bedtime} setVal={setBedtime} hint="when you got into bed"/>
          <ScalePicker label="Physical energy right now" val={energy} setVal={setEnergy} low="Depleted" high="Fully charged"/>
          <div className="ci-row">
            <div className="ci-q"><span>Morning sunlight (before 10am)</span></div>
            <YesNo val={sunlight} setVal={setSunlight}/>
          </div>
          <div className="ci-row">
            <div className="ci-q"><span>First meal before 2pm planned?</span></div>
            <YesNo val={mealBefore2} setVal={setMealBefore2}/>
          </div>
        </div>
      </div>
      <button className="submit-btn" onClick={handleSave}>Log morning →</button>
    </div>
  );

  // ── MIDDAY FORM ───────────────────────────────────────────────
  if (activePeriod === "midday") return (
    <div className="scroll" style={{padding:"0 0 16px"}}>
      <LevelHeader/>
      <div className="section" style={{marginTop:8}}>
        <div className="ci-block">
          <ScalePicker label="Mental clarity right now" val={clarity} setVal={setClarity} low="Noise everywhere" high="Laser clarity"/>
          <BucketPicker label="Screen time so far" target="Target: under 2 hrs total"
            val={screenTime} setVal={setScreenTime} color="var(--accent)"
            buckets={[{v:"0",l:"None"},{v:"0:30",l:"30 min"},{v:"1:00",l:"1 hr"},{v:"2:00",l:"2 hrs"},{v:"3:00",l:"3 hrs"},{v:"5:00",l:"5 hrs+"}]}/>
          <ScalePicker label="Overall mood" val={mood} setVal={setMood} low="Hollow" high="Invested"/>
          <ScalePicker label="Rumination level" val={rumination} setVal={setRumination} low="Quiet mind" high="Consumed"/>
          <BucketPicker label="Upskill time so far" target="Weekdays: 2 hrs total"
            val={upskillTime} setVal={setUpskillTime} color="var(--purple)"
            buckets={[{v:"0",l:"None"},{v:"0:30",l:"30 min"},{v:"1:00",l:"1 hr"},{v:"2:00",l:"2 hrs"},{v:"4:00",l:"4 hrs"},{v:"6:00",l:"6 hrs+"}]}/>
        </div>
      </div>
      <button className="submit-btn" onClick={handleSave}>Log midday →</button>
    </div>
  );

  // ── EVENING FORMS (level 1/2/3) ───────────────────────────────
  // ── LEVEL 1: PULSE ─────────────────────────────────────────────
  const LevelHeader = () => (
    <div style={{padding:"52px 16px 0"}}>
      {/* Period tabs */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:16}}>
        {Object.entries(PERIODS).map(([id, p]) => {
          const done = !!todayPeriods[id];
          const isActive = activePeriod === id;
          return (
            <div key={id} onClick={()=>{ setActivePeriod(id); }} style={{
              padding:"9px 4px", borderRadius:"var(--r2)", textAlign:"center",
              cursor:"pointer", transition:"all .15s",
              background: isActive ? "var(--bg3)" : "var(--bg2)",
              border: `0.5px solid ${isActive ? "var(--accent)" : done ? "#1d9e7544" : "var(--border)"}`,
            }}>
              <div style={{fontSize:13}}>{p.icon}</div>
              <div style={{fontSize:10,fontWeight:500,marginTop:2,color:isActive?"var(--accent)":done?"#3d8c6c":"var(--muted)"}}>{p.label}</div>
              {done && <div style={{fontSize:9,color:"#3d8c6c"}}>✓</div>}
            </div>
          );
        })}
      </div>
      <div style={{fontFamily:"var(--serif)",fontSize:20,marginBottom:2}}>
        {PERIODS[activePeriod].icon} {PERIODS[activePeriod].label} check-in
      </div>
      <div style={{fontSize:12,color:"var(--muted)",marginBottom:14}}>
        {activePeriod==="morning" ? "Sleep + energy · 60 seconds" : activePeriod==="midday" ? "Focus + drift check · 60 seconds" : level===1?"5 signals · 60 seconds":level===2?"Core signals · 2-3 min":"Full picture · 5 min"}
      </div>
      {/* Level switcher — only for evening */}
      {activePeriod === "evening" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:14}}>
          {[{l:1,label:"Pulse",sub:"60 sec"},{l:2,label:"Check-in",sub:"2-3 min"},{l:3,label:"Deep",sub:"5 min"}].map(({l,label,sub})=>(
            <div key={l} onClick={()=>setLevel(l)} style={{
              padding:"8px 4px",borderRadius:"var(--r2)",textAlign:"center",cursor:"pointer",transition:"all .15s",
              background:level===l?"var(--accent)":"var(--bg2)",
              border:`0.5px solid ${level===l?"var(--accent)":"var(--border)"}`,
            }}>
              <div style={{fontSize:11,fontWeight:500,color:level===l?"#fff":"var(--ink2)"}}>{label}</div>
              <div style={{fontSize:9,color:level===l?"rgba(255,255,255,.7)":"var(--muted)",marginTop:1}}>{sub}</div>
            </div>
          ))}
        </div>
      )}
      {activePeriod==="evening" && level===3 && avgRecentDrain>=41 && (
        <div style={{background:"#2a1212",border:"0.5px solid #c8553d44",borderRadius:"var(--r2)",padding:"10px 12px",marginBottom:12,fontSize:12,color:"#c8553d",lineHeight:1.5}}>
          ▽ Drain elevated recently. Deep audit recommended.
        </div>
      )}
    </div>
  );

  // ── LEVEL 1: PULSE ─────────────────────────────────────────────
  if (level === 1) return (
    <div className="scroll" style={{padding:"0 0 16px"}}>
      <LevelHeader/>
      <div className="section" style={{marginTop:8}}>
        <div className="ci-block">
          <SleepBucket val={sleepBucket} setVal={setSleepBucket}/>
          <ScalePicker label="Physical energy" val={energy} setVal={setEnergy} low="Depleted" high="Fully charged"/>
          <ScalePicker label="Overall mood" val={mood} setVal={setMood} low="Hollow" high="Invested"/>
          <div className="ci-row">
            <div className="ci-q" style={{marginBottom:10}}><span>Did something meaningful get done?</span></div>
            <YesNo val={meaning} setVal={setMeaning}/>
          </div>
          <div className="ci-row">
            <div className="ci-q" style={{marginBottom:10}}><span>Genuine conversation with someone you love?</span></div>
            <div className="ci-chips">
              {[["one","Yes"],["none","No"]].map(([v,l])=>(
                <div key={v} className={`chip ${familyContact===v?"selected":""}`} onClick={()=>setFamilyContact(v)}>{l}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <button className="submit-btn" onClick={handleSave}>Save pulse →</button>
    </div>
  );

  // ── LEVEL 2: CORE CHECK-IN ─────────────────────────────────────
  if (level === 2) return (
    <div className="scroll" style={{padding:"0 0 16px"}}>
      <LevelHeader/>
      <div className="section" style={{marginTop:8}}>
        <div className="section-title">Physical</div>
        <div className="ci-block">
          <WorkoutBucket val={workoutMins} setVal={setWorkoutMins}/>
          <SleepBucket val={sleepBucket} setVal={setSleepBucket}/>
          <ScalePicker label="Physical energy" val={energy} setVal={setEnergy} low="Running on fumes" high="Fully charged"/>
          <div className="ci-row">
            <div className="ci-q"><span>Morning sunlight (before 10am)</span></div>
            <YesNo val={sunlight} setVal={setSunlight}/>
          </div>
        </div>
      </div>
      <div className="section" style={{marginTop:12}}>
        <div className="section-title">Mental</div>
        <div className="ci-block">
          <BucketPicker label="Upskill time" target="Weekdays: 2 hrs · Weekends: 6 hrs"
            val={upskillTime} setVal={setUpskillTime} color="var(--purple)"
            buckets={[{v:"0",l:"None"},{v:"0:30",l:"30 min"},{v:"1:00",l:"1 hr"},{v:"2:00",l:"2 hrs"},{v:"4:00",l:"4 hrs"},{v:"6:00",l:"6 hrs+"}]}/>
          <ScalePicker label="Mental clarity" val={clarity} setVal={setClarity} low="Noise everywhere" high="Laser clarity"/>
          <BucketPicker label="Screen time" target="Target: under 2 hrs"
            val={screenTime} setVal={setScreenTime} color="var(--accent)"
            buckets={[{v:"0",l:"None"},{v:"0:30",l:"30 min"},{v:"1:00",l:"1 hr"},{v:"2:00",l:"2 hrs"},{v:"3:00",l:"3 hrs"},{v:"5:00",l:"5 hrs+"}]}/>
        </div>
      </div>
      <div className="section" style={{marginTop:12}}>
        <div className="section-title">Emotional</div>
        <div className="ci-block">
          <ScalePicker label="Overall mood" val={mood} setVal={setMood} low="Hollow" high="Fully invested"/>
          <div className="ci-row">
            <div className="ci-q" style={{marginBottom:10}}><span>Genuine conversation with a loved one?</span></div>
            <div className="ci-chips">
              {[["both","Multiple people"],["one","One person"],["voicenote","Voice / text"],["none","No one"]].map(([v,l])=>(
                <div key={v} className={`chip ${familyContact===v?"selected":""}`} onClick={()=>setFamilyContact(v)}>{l}</div>
              ))}
            </div>
          </div>
          <div className="ci-row">
            <div className="ci-q"><span>Did today feel meaningful?</span></div>
            <YesNo val={meaning} setVal={setMeaning}/>
          </div>
        </div>
      </div>
      <div className="section" style={{marginTop:12}}>
        <div className="section-title">Top drains</div>
        <div className="ci-block">
          <Stepper label="Cigarettes smoked" val={cigarettes} setVal={setCigarettes} max={30}/>
          <BucketPicker label="Social media / doomscrolling" target="Target: under 30 min"
            val={socialMediaTime} setVal={setSocialMediaTime} color="var(--accent)"
            buckets={[{v:"0",l:"None"},{v:"0:15",l:"15 min"},{v:"0:30",l:"30 min"},{v:"1:00",l:"1 hr"},{v:"2:00",l:"2 hrs"},{v:"3:00",l:"3 hrs+"}]}/>
          <ScalePicker label="Rumination (circular thinking)" val={rumination} setVal={setRumination} low="Quiet mind" high="Consumed"/>
        </div>
      </div>
      <button className="submit-btn" onClick={handleSave}>Save check-in →</button>
    </div>
  );

  // ── LEVEL 3: DEEP AUDIT (full) ────────────────────────────────
  return (
    <div className="scroll" style={{padding:"0 0 16px"}}>
      <LevelHeader/>

      {/* PHYSICAL */}
      <div className="section" style={{marginTop:8}}>
        <div className="section-title">Physical</div>
        <div className="ci-block">
          <WorkoutBucket val={workoutMins} setVal={setWorkoutMins}/>
          <SleepBucket val={sleepBucket} setVal={setSleepBucket}/>
          <TimePicker label="Bedtime last night" val={bedtime} setVal={setBedtime} hint="when you got into bed"/>
          <ScalePicker label="Physical energy" val={energy} setVal={setEnergy} low="Running on fumes" high="Fully charged"/>
          <div className="ci-row">
            <div className="ci-q"><span>Morning sunlight (before 10am)</span></div>
            <YesNo val={sunlight} setVal={setSunlight}/>
          </div>
          <div className="ci-row">
            <div className="ci-q"><span>First real meal before 2pm</span></div>
            <YesNo val={mealBefore2} setVal={setMealBefore2}/>
          </div>
          <Stepper label="Caffeine intake" val={caffeineCups} setVal={setCaffeineCups} max={10} unit=" cups"/>
        </div>
      </div>

      {/* MENTAL */}
      <div className="section" style={{marginTop:16}}>
        <div className="section-title">Mental</div>
        <div className="ci-block">
          <BucketPicker
            label="Upskill time"
            target="Weekdays: 2 hrs · Weekends: 6 hrs"
            val={upskillTime}
            setVal={setUpskillTime}
            buckets={[
              {v:"0",l:"None"},
              {v:"0:30",l:"30 min"},
              {v:"1:00",l:"1 hr"},
              {v:"2:00",l:"2 hrs"},
              {v:"4:00",l:"4 hrs"},
              {v:"6:00",l:"6 hrs+"},
            ]}
            color="var(--purple)"
          />
          <ScalePicker label="Mental clarity" val={clarity} setVal={setClarity} low="Noise everywhere" high="Laser clarity"/>
          <BucketPicker
            label="Screen time"
            target="Target: under 2 hrs recreational"
            val={screenTime}
            setVal={setScreenTime}
            buckets={[
              {v:"0",l:"None"},
              {v:"0:30",l:"30 min"},
              {v:"1:00",l:"1 hr"},
              {v:"2:00",l:"2 hrs"},
              {v:"3:00",l:"3 hrs"},
              {v:"5:00",l:"5 hrs+"},
            ]}
            color="var(--accent)"
          />
          <BucketPicker
            label="Hobby time"
            target="Target: 30 min daily · Your anchor activity"
            val={hobbyTime}
            setVal={setHobbyTime}
            buckets={[
              {v:"0",l:"Skipped"},
              {v:"0:15",l:"15 min"},
              {v:"0:30",l:"30 min"},
              {v:"0:45",l:"45 min"},
              {v:"1:00",l:"1 hr"},
              {v:"1:30",l:"1.5 hrs+"},
            ]}
            color="var(--teal)"
          />
          <div className="ci-row">
            <div className="ci-q" style={{marginBottom:6,flexDirection:"column",alignItems:"flex-start",gap:2}}>
              <span>Pages read</span>
              <span style={{fontSize:10,color:"var(--teal)",fontWeight:500}}>Target: 10 pages a day minimum</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
              {[{v:0,l:"None"},{v:5,l:"5 pgs"},{v:10,l:"10 pgs"},{v:20,l:"20 pgs"},{v:30,l:"30 pgs"},{v:50,l:"50 pgs"},{v:75,l:"75 pgs"},{v:100,l:"100+"}].map(b=>(
                <div key={b.v} onClick={()=>setPagesRead(b.v)} style={{
                  padding:"10px 4px",borderRadius:"var(--r2)",textAlign:"center",
                  fontSize:11,fontWeight:500,cursor:"pointer",transition:"all .15s",
                  background:pagesRead===b.v?"var(--purple)":"var(--bg3)",
                  color:pagesRead===b.v?"#fff":"var(--muted)",
                  border:`0.5px solid ${pagesRead===b.v?"var(--purple)":"var(--border2)"}`,
                }}>{b.l}</div>
              ))}
            </div>
          </div>
          <div className="ci-row">
            <div className="ci-q"><span>Side hustle progress today</span></div>
            <div className="ci-chips">
              {[["built","Built something"],["progress","Made progress"],["none","Nothing"]].map(([v,l])=>(
                <div key={v} className={`chip ${sideHustle===v?"selected":""}`} onClick={()=>setSideHustle(v)}>{l}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* EMOTIONAL */}
      <div className="section" style={{marginTop:16}}>
        <div className="section-title">Emotional</div>
        <div className="ci-block">
          <div className="ci-row">
            <div className="ci-q" style={{marginBottom:10}}><span>Meditation + mantra chanting</span></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
              {[{v:0,l:"None"},{v:5,l:"5 min"},{v:10,l:"10 min"},{v:20,l:"20 min+"}].map(b=>(
                <div key={b.v} onClick={()=>setMeditationMins(b.v)} style={{
                  padding:"10px 4px",borderRadius:"var(--r2)",textAlign:"center",
                  fontSize:12,fontWeight:500,cursor:"pointer",transition:"all .15s",
                  background:meditationMins===b.v?"var(--teal)":"var(--bg3)",
                  color:meditationMins===b.v?"#fff":"var(--muted)",
                  border:`0.5px solid ${meditationMins===b.v?"var(--teal)":"var(--border2)"}`,
                }}>{b.l}</div>
              ))}
            </div>
          </div>
          <ScalePicker label="Overall mood" val={mood} setVal={setMood} low="Hollow" high="Fully invested"/>
          <div className="ci-row">
            <div className="ci-q" style={{marginBottom:10}}><span>Genuine conversation with a loved one?</span></div>
            <div className="ci-chips">
              {[["both","Multiple people"],["one","One person"],["voicenote","Voice / text"],["none","No one"]].map(([v,l])=>(
                <div key={v} className={`chip ${familyContact===v?"selected":""}`} onClick={()=>setFamilyContact(v)}>{l}</div>
              ))}
            </div>
          </div>
          {familyContact && familyContact!=="none" && (
            <div className="ci-row">
              <div className="ci-q"><span>Did it feel like a real conversation?</span></div>
              <YesNo val={contactQuality} setVal={setContactQuality}/>
            </div>
          )}
          <div className="ci-row">
            <div className="ci-q"><span>Did today feel meaningful?</span></div>
            <YesNo val={meaning} setVal={setMeaning}/>
          </div>
          <div className="ci-row">
            <div className="ci-q"><span>Did you do something enjoyable?</span></div>
            <YesNo val={enjoyable} setVal={setEnjoyable}/>
          </div>
          <div className="ci-row">
            <div className="ci-q"><span>One thing you're grateful for</span></div>
            <textarea rows={2} style={{width:"100%",padding:"10px 12px",fontSize:13,resize:"none",marginTop:4,
              borderRadius:"var(--r2)",background:"var(--bg3)",border:"0.5px solid var(--border2)",color:"var(--ink)"}}
              placeholder="Be specific. Not 'my health'. The chai this morning was perfect."
              value={gratitude} onChange={e=>setGratitude(e.target.value)}/>
          </div>
        </div>
      </div>

      {/* DRAINS */}
      <div className="section" style={{marginTop:16}}>
        <div className="section-title">Drains — honest signals</div>
        <div className="ci-block">
          <Stepper label="Cigarettes smoked" val={cigarettes} setVal={setCigarettes} max={30}/>
          <Stepper label="Alcohol drinks" val={alcohol} setVal={setAlcohol} max={12}/>
          <BucketPicker
            label="Social media / doomscrolling"
            target="Target: under 30 min"
            val={socialMediaTime}
            setVal={setSocialMediaTime}
            buckets={[
              {v:"0",    l:"None"},
              {v:"0:15", l:"15 min"},
              {v:"0:30", l:"30 min"},
              {v:"1:00", l:"1 hr"},
              {v:"2:00", l:"2 hrs"},
              {v:"3:00", l:"3 hrs+"},
            ]}
            color="var(--accent)"
          />
          <div className="ci-row">
            <div className="ci-q" style={{marginBottom:10}}><span>Time wasted today</span></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
              {[{v:0,l:"None"},{v:0.5,l:"30 min"},{v:1,l:"1 hr"},{v:2,l:"2 hrs"},{v:3,l:"3 hrs"},{v:4,l:"4 hrs+"}].map(b=>(
                <div key={b.v} onClick={()=>setTimeWasted(b.v)} style={{
                  padding:"10px 4px",borderRadius:"var(--r2)",textAlign:"center",
                  fontSize:12,fontWeight:500,cursor:"pointer",transition:"all .15s",
                  background:timeWasted===b.v?"var(--accent)":"var(--bg3)",
                  color:timeWasted===b.v?"#fff":"var(--muted)",
                  border:`0.5px solid ${timeWasted===b.v?"var(--accent)":"var(--border2)"}`,
                }}>{b.l}</div>
              ))}
            </div>
          </div>
          <ScalePicker label="Rumination (circular thinking)" val={rumination} setVal={setRumination} low="Quiet mind" high="Consumed"/>
          <div className="ci-row">
            <div className="ci-q"><span>High-sugar day?</span></div>
            <YesNo val={sugarDay} setVal={setSugarDay}/>
          </div>
          <div className="ci-row">
            <div className="ci-q"><span>Ordered junk for dinner?</span></div>
            <YesNo val={junkDinner} setVal={setJunkDinner}/>
          </div>
          <div className="ci-row">
            <div className="ci-q"><span>Drank 3+ litres of water?</span></div>
            <YesNo val={hydrated} setVal={setHydrated}/>
          </div>
          <div className="ci-row">
            <div className="ci-q"><span>Negative self-talk today?</span></div>
            <YesNo val={negativeSelfTalk} setVal={setNegativeSelfTalk}/>
          </div>
          <div className="ci-row">
            <div className="ci-q"><span>Reactivity episode (regret it)?</span></div>
            <YesNo val={reactivity} setVal={setReactivity}/>
          </div>
          <div className="ci-row">
            <div className="ci-q"><span>Phone use after 10pm?</span></div>
            <YesNo val={lateNightPhone} setVal={setLateNightPhone}/>
          </div>
          <div className="ci-row">
            <div className="ci-q"><span>Masturbation today?</span></div>
            <div style={{fontSize:10,color:"var(--muted)",marginBottom:6}}>Private — only feeds pattern detection</div>
            <YesNo val={masturbation} setVal={setMasturbation}/>
          </div>
        </div>
      </div>

      <button className="submit-btn" onClick={handleSave}>
        Save today's entry
      </button>
    </div>
  );
}

/* ─── RECOMMENDATIONS ENGINE ────────────────────────────────────── */
function getRecommendations(todayEntry, allEntries, pScore, mScore, eScore, dScore, icp) {
  if (!todayEntry) return [];
  const struggles = icp?.struggles || [];
  const goals     = icp?.goals     || [];
  const recs = [];
  const streak = (fn) => {
    let s = 0;
    for (let i = allEntries.length - 1; i >= 0; i--) {
      if (fn(allEntries[i])) s++; else break;
    }
    return s;
  };

  // Mental noise / anxiety
  if ((todayEntry.rumination||1) >= 4) recs.push({
    priority:1, color:"#7f77dd", icon:"◈", category:"anxiety",
    title:"Box breathing — right now",
    body:"4 counts in, hold 4, out 4, hold 4. Repeat 4 times. Rumination runs on shallow breathing. Interrupt the loop physically.",
    effort:"2 min"
  });
  if ((todayEntry.rumination||1) >= 3 && !todayEntry.meditationMins) recs.push({
    priority:2, color:"#7f77dd", icon:"◈", category:"mental noise",
    title:"10 min mantra before sleep",
    body:"You skipped meditation and the mind is running. Even 10 minutes of mantra chanting before bed resets the nervous system and breaks the thought loop.",
    effort:"10 min"
  });
  if (mScore < 40 && (todayEntry.screenTimeHrs||0) > 3) recs.push({
    priority:1, color:"#c8553d", icon:"◉", category:"mental clarity",
    title:"Phone in another room for 1 hour",
    body:"Your screen time is high and clarity is low. These two move together. Put the phone physically in another room — not on silent, in another room.",
    effort:"1 hour"
  });
  if (todayEntry.negativeSelfTalk) recs.push({
    priority:2, color:"#c8553d", icon:"◉", category:"self-talk",
    title:"Name it, then drop it",
    body:"You had a negative self-talk episode. Write down the exact thought — one sentence. Then ask: would I say this to someone I respect? That question usually ends the loop.",
    effort:"5 min"
  });

  // Physical
  if ((todayEntry.sleepHrs||7) < 6) recs.push({
    priority:1, color:"#1d9e75", icon:"◆", category:"sleep",
    title:"Hard stop at 10pm tonight",
    body:"You slept under 6 hours. Sleep debt compounds — one more short night and every score tanks. Set an alarm for 10pm as a wind-down trigger.",
    effort:"Tonight"
  });
  if (!todayEntry.sunlight && pScore < 60) recs.push({
    priority:3, color:"#1d9e75", icon:"◆", category:"energy",
    title:"10 minutes outside before 10am tomorrow",
    body:"No morning sunlight today. Morning light sets your cortisol rhythm for the whole day. Even overcast sky counts. Cheapest energy upgrade available.",
    effort:"10 min tomorrow"
  });
  if ((todayEntry.caffeineCups||0) >= 4) recs.push({
    priority:2, color:"#1d9e75", icon:"◆", category:"energy",
    title:"Cut caffeine now if past 2pm",
    body:`${todayEntry.caffeineCups} cups today. Caffeine's half-life is 5–6 hours — anything after 2pm disrupts your sleep architecture tonight.`,
    effort:"Immediate"
  });
  const noWorkoutStreak = streak(e => !e.workoutMins || e.workoutMins < 30);
  if (noWorkoutStreak >= 3) recs.push({
    priority:2, color:"#1d9e75", icon:"◆", category:"movement",
    title:"20-minute walk — no phone",
    body:`${noWorkoutStreak} days without movement. You don't need a full session. A 20-minute walk resets cortisol, clears mental noise, and breaks the sedentary pattern.`,
    effort:"20 min"
  });

  // Emotional / isolation
  const noContactStreak = streak(e => !e.familyContact || e.familyContact==="none");
  if (noContactStreak >= 2) recs.push({
    priority:1, color:"#c4840a", icon:"◇", category:"isolation",
    title:"Have a real conversation with someone you love",
    body:`${noContactStreak} days without genuine connection. Isolation compounds silently. Reach out to someone who matters to you — even 5 minutes resets the pattern.`,
    effort:"5 min"
  });
  if (eScore < 50 && !todayEntry.enjoyable) recs.push({
    priority:3, color:"#c4840a", icon:"◇", category:"emotional reset",
    title:"Do one thing that's just for you",
    body:"Emotional score is low, nothing enjoyable today. Not productive. Not useful. Just something you like — your hobby, music, a walk, a film. Even 20 minutes.",
    effort:"20 min"
  });
  if (!todayEntry.meaning) recs.push({
    priority:3, color:"#c4840a", icon:"◇", category:"meaning",
    title:"Write one sentence about why this matters",
    body:"Today didn't feel meaningful. Before you sleep, finish this: 'I'm building this life because...' The act of writing reconnects you to the reason.",
    effort:"2 min"
  });

  // Drains
  if ((todayEntry.cigarettes||0) >= 4) recs.push({
    priority:2, color:"#c8553d", icon:"▽", category:"body drain",
    title:"Delay the next cigarette by 30 minutes",
    body:"Not asking you to quit. Just delay. Every 30-minute delay reduces the neurological urgency signal. This is how frequency drops over time.",
    effort:"Ongoing"
  });
  if (dScore >= 41) recs.push({
    priority:1, color:"#c8553d", icon:"▽", category:"drain",
    title:"Identify your biggest drain today",
    body:"Drain score is heavy. Pick the single highest-cost drain from today — if you removed one, which would change the most? Name it. That's tomorrow's focus.",
    effort:"3 min"
  });

  // Direction
  const dow = new Date().getDay();
  const isWeekday = dow >= 1 && dow <= 5;
  if ((todayEntry.upskillHrs||0) < 1 && isWeekday) recs.push({
    priority:2, color:"#7f77dd", icon:"◈", category:"direction",
    title:"45 minutes of upskilling before bed",
    body:"You haven't hit your upskilling target. Even 45 focused minutes — a PM case study, a build session, a framework — keeps the compounding going. Don't break the chain.",
    effort:"45 min"
  });
  if (todayEntry.sideHustle==="none" && (todayEntry.upskillHrs||0) < 1) recs.push({
    priority:3, color:"#7f77dd", icon:"◈", category:"direction",
    title:"Name one thing to build tomorrow",
    body:"No upskilling and no side hustle progress today. Before you sleep, write one specific thing you will build or finish tomorrow. Specificity is commitment.",
    effort:"2 min"
  });

  // ── ICP PRIORITY BOOST ──────────────────────────────────────────
  // Elevate recommendations that match stated struggles and goals
  recs.forEach(r => {
    if (struggles.includes("energy")        && ["sleep","energy","movement"].includes(r.category)) r.priority -= 1;
    if (struggles.includes("focus")         && ["mental clarity","direction","screen time"].includes(r.category)) r.priority -= 1;
    if (struggles.includes("burnout")       && ["drain","emotional reset","meaning"].includes(r.category)) r.priority -= 1;
    if (struggles.includes("noise")         && ["anxiety","mental noise","self-talk"].includes(r.category)) r.priority -= 1;
    if (struggles.includes("inconsistency") && ["direction","movement","drain"].includes(r.category)) r.priority -= 1;
    if (struggles.includes("isolation")     && ["isolation","emotional reset"].includes(r.category)) r.priority -= 1;

    if (goals.includes("momentum")   && ["direction","movement"].includes(r.category)) r.priority -= 1;
    if (goals.includes("drain")      && ["drain","anxiety","mental noise","screen time"].includes(r.category)) r.priority -= 1;
    if (goals.includes("physical")   && ["sleep","energy","movement"].includes(r.category)) r.priority -= 1;
    if (goals.includes("focus_deep") && ["mental clarity","direction","screen time"].includes(r.category)) r.priority -= 1;
    if (goals.includes("patterns")   && r.priority <= 2) r.priority -= 0; // patterns goal = no boost, just show all
  });

  return recs.sort((a,b)=>a.priority-b.priority).slice(0,4);
}

/* ─── DASHBOARD ─────────────────────────────────────────────────── */
function Dashboard({ entries, profile, setTab, icp }) {
  const today = TODAY();

  // Merge today's periods into one scoring object
  const todayPeriods = getDayEntries(entries, today);
  const todayEntry = mergeDayEntries(todayPeriods);
  const recentDates = [...new Set(entries.map(e=>e.date))].sort().slice(-14);
  const recentEntries = recentDates.map(d => mergeDayEntries(getDayEntries(entries, d))).filter(Boolean);

  const pScore = todayEntry ? scorePhysical(todayEntry, recentEntries) : null;
  const mScore = todayEntry ? scoreMental(todayEntry) : null;
  const eScore = todayEntry ? scoreEmotional(todayEntry, recentEntries) : null;
  const dScore = todayEntry ? scoreDrain(todayEntry, recentEntries) : null;
  const dInfo  = dScore !== null ? drainLabel(dScore) : null;

  // Period completion status for today
  const currentPeriod = getCurrentPeriod();
  const periodsDone = {
    morning: !!todayPeriods.morning,
    midday:  !!todayPeriods.midday,
    evening: !!todayPeriods.evening,
  };

  // build last 7 days
  const last7 = Array.from({length:7},(_,i)=>{
    const d = new Date(); d.setDate(d.getDate()-(6-i));
    const key = d.toISOString().split("T")[0];
    const merged = mergeDayEntries(getDayEntries(entries, key));
    const ps = merged ? scorePhysical(merged, recentEntries) : null;
    const ms = merged ? scoreMental(merged) : null;
    const es = merged ? scoreEmotional(merged, recentEntries) : null;
    const avg = ps!==null ? Math.round((ps+ms+es)/3) : null;
    return { key, day: DAYS[d.getDay()], avg, isToday: key===today };
  });

  // signals
  const signals = [];
  if (todayEntry) {
    if (dScore >= 41) signals.push({color:"#c8553d", text:`Drain is heavy today (${dScore}/100). Multiple drains compounding.`});
    else if (dScore >= 16) signals.push({color:"#c4840a", text:`Leaking today — drain score ${dScore}. Check what's pulling you down.`});
    if (mScore < 50) signals.push({color:"#c8553d", text:`Mental score is ${mScore}%. Screen time or upskilling gap is the likely cause.`});
    if (!todayEntry.familyContact || todayEntry.familyContact==="none") {
      const streak = recentEntries.filter(e=>!e.familyContact||e.familyContact==="none").length;
      if (streak>=3) signals.push({color:"#c8553d", text:`${streak} days without a genuine conversation with someone you love. Isolation pattern building.`});
    }
    if (pScore >= 80) signals.push({color:"#3d8c6c", text:`Strong physical day. Body is doing its job.`});
    if (eScore >= 80) signals.push({color:"#3d8c6c", text:`Emotional baseline is solid at ${eScore}%.`});
    if ((todayEntry.upskillHrs||0) >= 2) signals.push({color:"#3d8c6c", text:`Upskilling target hit. Forward motion is real.`});
  }
  if (!signals.length && !todayEntry) signals.push({color:"#7a7268", text:"No check-in yet today. Tap the + tab to log your day."});

  const recs = getRecommendations(todayEntry, recentEntries, pScore, mScore, eScore, dScore, icp);

  const firstName = (profile?.name||"there").split(" ")[0];
  const initials = getInitials(profile?.name||"S");
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // ICP context — what they said they're working on
  const goalLabels = { momentum:"consistent momentum", drain:"reducing cognitive drain", patterns:"understanding your patterns", physical:"your physical baseline", focus_deep:"deep focus" };
  const goalText = icp?.goals?.length
    ? icp.goals.map(g=>goalLabels[g]).filter(Boolean).join(" · ")
    : null;

  return (
    <div className="scroll">
      <div className="hdr fade-up">
        <div>
          <div className="hdr-name">{greeting}, {firstName}</div>
          <div className="hdr-date">
            {now.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}
            {entries.length > 0 && <> · Day {entries.length}</>}
          </div>
          {goalText && (
            <div style={{fontSize:11,color:"var(--teal)",marginTop:4,fontWeight:500}}>
              Working on: {goalText}
            </div>
          )}
        </div>
        <div className="avatar" onClick={()=>setTab("profile")}>{initials}</div>
      </div>

      {/* RINGS */}
      <div className="rings-row fade-up" style={{animationDelay:".05s"}}>
        {[
          {label:"Physical", score:pScore, color:"#1d9e75"},
          {label:"Mental",   score:mScore, color:"#7f77dd"},
          {label:"Emotional",score:eScore, color:"#c4840a"},
        ].map(({label,score,color})=>(
          <div className="ring-card" key={label}>
            <div className="ring-name">{label}</div>
            <div className="ring-wrap">
              <Ring pct={score??0} color={color}/>
              <div className="ring-pct">{score!==null?`${score}%`:"—"}</div>
            </div>
            <div className="ring-status" style={{color}}>
              {score!==null ? healthLabel(score) : "No data"}
            </div>
          </div>
        ))}
      </div>

      {/* DRAIN CARD */}
      {dScore!==null && (
        <div className="drain-card fade-up" style={{animationDelay:".1s"}}>
          <div>
            <div className="drain-label">Drain</div>
            <div className="drain-score" style={{color:dInfo.color}}>{dScore}</div>
            <div style={{fontSize:11,color:dInfo.color,fontWeight:500}}>{dInfo.label}</div>
          </div>
          <div className="drain-bar-bg">
            <div className="drain-bar" style={{width:`${dScore}%`,background:dInfo.color}}/>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:"var(--muted)",marginBottom:2}}>out of</div>
            <div style={{fontFamily:"var(--serif)",fontSize:20,color:"var(--muted)"}}>100</div>
          </div>
        </div>
      )}

      {/* PERIOD STATUS STRIP */}
      <div style={{margin:"10px 16px 0",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}} className="fade-up">
        {Object.entries(PERIODS).map(([id, p]) => {
          const done = periodsDone[id];
          const active = currentPeriod === id;
          return (
            <div key={id} onClick={()=>!done && setTab("checkin")} style={{
              padding:"10px 8px", borderRadius:"var(--r2)", textAlign:"center",
              cursor: done ? "default" : "pointer",
              background: done ? "#0f2a1a" : active ? "#1a1208" : "var(--bg2)",
              border: `0.5px solid ${done ? "#1d9e7566" : active ? "var(--accent)" : "var(--border)"}`,
              transition:"all .2s",
            }}>
              <div style={{fontSize:16,marginBottom:3}}>{p.icon}</div>
              <div style={{fontSize:11,fontWeight:500,color: done ? "#3d8c6c" : active ? "var(--accent)" : "var(--muted)"}}>{p.label}</div>
              <div style={{fontSize:10,color: done ? "#3d8c6c" : active ? "var(--accent)" : "var(--muted)",marginTop:2}}>
                {done ? "✓ Done" : active ? "Open now" : `${p.hours[0]}–${p.hours[1]}h`}
              </div>
            </div>
          );
        })}
      </div>

      {/* CHECK-IN PROMPT — only show if current period not done */}
      {currentPeriod && !periodsDone[currentPeriod] && (
        <div style={{margin:"10px 16px 0"}} className="fade-up">
          <div style={{background:"var(--accent)",borderRadius:"var(--r)",padding:16,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>setTab("checkin")}>
            <div>
              <div style={{fontSize:14,fontWeight:500,color:"#fff"}}>{PERIODS[currentPeriod].icon} {PERIODS[currentPeriod].label} check-in open</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:2}}>Under 2 minutes</div>
            </div>
            <div style={{fontSize:24,color:"rgba(255,255,255,.8)"}}>→</div>
          </div>
        </div>
      )}

      {/* WEEK STRIP */}
      <div className="section" style={{marginTop:20}} >
        <div className="section-title fade-up" style={{animationDelay:".12s"}}>This week</div>
        <div className="week-strip fade-up" style={{animationDelay:".15s"}}>
          {last7.map(d=>{
            const bg = d.avg===null ? "var(--bg3)" : d.avg>=70 ? "#0f2e20" : d.avg>=45 ? "#2e200a" : "#2e0a0a";
            const clr = d.avg===null ? "var(--muted)" : d.avg>=70 ? "#3d8c6c" : d.avg>=45 ? "#c4840a" : "#c8553d";
            return (
              <div className="week-day" key={d.key}>
                <div className="week-dot" style={{
                  background: d.isToday ? "var(--accent)" : bg,
                  color: d.isToday ? "#fff" : clr,
                  border: d.isToday ? "none" : `0.5px solid ${clr}22`
                }}>
                  {d.avg!==null ? d.avg : d.day[0]}
                </div>
                <div className="week-lbl">{d.day}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SIGNALS */}
      {signals.length > 0 && (
        <div className="section" style={{marginTop:20}}>
          <div className="section-title fade-up" style={{animationDelay:".18s"}}>Today's signals</div>
          <div className="card fade-up" style={{animationDelay:".2s"}}>
            {signals.map((s,i)=>(
              <div className="signal-item" key={i}>
                <div className="signal-dot" style={{background:s.color}}/>
                <div className="signal-text">{s.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SINGLE LEVER CARD */}
      {recs.length > 0 && (
        <div className="section" style={{marginTop:20}}>
          <div className="section-title fade-up" style={{animationDelay:".22s"}}>Your lever right now</div>
          <div className="fade-up" style={{animationDelay:".24s"}}>
            {/* Primary card — top priority rec */}
            <div style={{background:"var(--bg2)",border:`0.5px solid ${recs[0].color}44`,borderRadius:"var(--r)",padding:"16px"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
                <div style={{fontSize:18,color:recs[0].color,flexShrink:0}}>{recs[0].icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,fontWeight:600,letterSpacing:".8px",textTransform:"uppercase",color:recs[0].color,marginBottom:3}}>{recs[0].category}</div>
                  <div style={{fontSize:15,fontWeight:500,color:"var(--ink)",lineHeight:1.3,marginBottom:8}}>{recs[0].title}</div>
                  <div style={{fontSize:12,color:"var(--ink2)",lineHeight:1.6}}>{recs[0].body}</div>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",borderTop:"0.5px solid var(--border)",paddingTop:10,marginTop:4}}>
                <div style={{fontSize:11,color:"var(--muted)"}}>Effort: <span style={{color:"var(--ink2)",fontWeight:500}}>{recs[0].effort}</span></div>
                {recs.length > 1 && (
                  <div style={{fontSize:11,color:"var(--muted)",cursor:"pointer"}}
                    onClick={e=>{
                      const el = e.currentTarget.closest(".section").querySelector(".more-recs");
                      if(el) el.style.display = el.style.display==="none"?"block":"none";
                      e.currentTarget.textContent = e.currentTarget.textContent.includes("more") ? "Hide others" : `${recs.length-1} more →`;
                    }}>
                    {recs.length-1} more →
                  </div>
                )}
              </div>
            </div>
            {/* Secondary recs — hidden by default */}
            {recs.length > 1 && (
              <div className="more-recs" style={{display:"none",marginTop:8}}>
                {recs.slice(1).map((r,i)=>(
                  <div key={i} className="rec-card" style={{marginBottom:8}}>
                    <div className="rec-top">
                      <div className="rec-icon" style={{color:r.color}}>{r.icon}</div>
                      <div style={{flex:1}}>
                        <div className="rec-cat" style={{color:r.color}}>{r.category}</div>
                        <div className="rec-title">{r.title}</div>
                      </div>
                      <div className="rec-effort">{r.effort}</div>
                    </div>
                    <div className="rec-body">{r.body}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── WEEKLY NARRATIVE ENGINE ───────────────────────────────────── */
function buildWeeklyNarrative(entries) {
  if (entries.length < 3) return null;
  const last7 = entries.slice(-7);
  const allScores = last7.map(e => ({
    date: e.date,
    p: scorePhysical(e, entries),
    m: scoreMental(e),
    em: scoreEmotional(e, entries),
    d: scoreDrain(e, entries),
    avg: Math.round((scorePhysical(e,entries)+scoreMental(e)+scoreEmotional(e,entries))/3),
    entry: e,
  }));

  const avgP = Math.round(allScores.map(s=>s.p).reduce((a,b)=>a+b,0)/allScores.length);
  const avgM = Math.round(allScores.map(s=>s.m).reduce((a,b)=>a+b,0)/allScores.length);
  const avgE = Math.round(allScores.map(s=>s.em).reduce((a,b)=>a+b,0)/allScores.length);
  const avgD = Math.round(allScores.map(s=>s.d).reduce((a,b)=>a+b,0)/allScores.length);

  const bestDay = allScores.reduce((a,b)=>a.avg>b.avg?a:b);
  const worstDay = allScores.reduce((a,b)=>a.avg<b.avg?a:b);

  // Biggest drain source this week
  const drainSources = [
    { name:"screen time", val: last7.filter(e=>(e.screenTimeHrs||0)>=3).length },
    { name:"cigarettes", val: last7.filter(e=>(e.cigarettes||0)>=4).length },
    { name:"rumination", val: last7.filter(e=>(e.rumination||1)>=4).length },
    { name:"no movement", val: last7.filter(e=>!e.workoutMins||e.workoutMins<30).length },
    { name:"poor sleep", val: last7.filter(e=>(e.sleepHrs||7)<6).length },
    { name:"social isolation", val: last7.filter(e=>!e.familyContact||e.familyContact==="none").length },
  ].sort((a,b)=>b.val-a.val);
  const biggestDrain = drainSources[0]?.val > 1 ? drainSources[0].name : null;

  // Biggest win
  const wins = [
    { name:"upskilling consistency", val: last7.filter(e=>(e.upskillHrs||0)>=2).length, threshold:3 },
    { name:"workout habit", val: last7.filter(e=>(e.workoutMins||0)>=45).length, threshold:3 },
    { name:"meditation practice", val: last7.filter(e=>(e.meditationMins||0)>=10).length, threshold:4 },
    { name:"staying connected", val: last7.filter(e=>e.familyContact&&e.familyContact!=="none").length, threshold:4 },
    { name:"reading habit", val: last7.filter(e=>(e.pagesRead||0)>=10).length, threshold:4 },
  ].filter(w=>w.val>=w.threshold).sort((a,b)=>b.val-a.val);
  const biggestWin = wins[0]?.name || null;

  // Trend — compare first half to second half
  const firstHalf = allScores.slice(0, Math.floor(allScores.length/2));
  const secondHalf = allScores.slice(Math.floor(allScores.length/2));
  const firstAvg = firstHalf.reduce((a,b)=>a+b.avg,0)/firstHalf.length;
  const secondAvg = secondHalf.reduce((a,b)=>a+b.avg,0)/secondHalf.length;
  const trend = secondAvg - firstAvg;
  const trendLabel = trend > 5 ? "improving" : trend < -5 ? "declining" : "holding steady";
  const trendColor = trend > 5 ? "#3d8c6c" : trend < -5 ? "#c8553d" : "#c4840a";

  // Build the narrative sentence by sentence
  const sentences = [];
  sentences.push(`You checked in ${last7.length} of the last 7 days.`);
  if (biggestWin) sentences.push(`Your clearest win was ${biggestWin}.`);
  if (biggestDrain) sentences.push(`${biggestDrain.charAt(0).toUpperCase()+biggestDrain.slice(1)} was your biggest recurring drain.`);
  const bestDayFmt = new Date(bestDay.date).toLocaleDateString("en-IN",{weekday:"long"});
  sentences.push(`Your best day was ${bestDayFmt} (avg ${bestDay.avg}%).`);
  sentences.push(`Overall you're ${trendLabel} week on week.`);

  // Forward look
  const fwd = biggestDrain
    ? `Next week: target reducing ${biggestDrain} first. It's your highest-leverage change.`
    : `Next week: protect what's working. Consistency compounds.`;

  return { sentences, fwd, avgP, avgM, avgE, avgD, trendLabel, trendColor, biggestDrain, biggestWin };
}

/* ─── HISTORY ───────────────────────────────────────────────────── */
function History({ entries }) {
  const sorted = [...entries].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30);
  const narrative = entries.length >= 3 ? buildWeeklyNarrative(entries) : null;

  const avg7 = (key, scoreFn, entries) => {
    const last = entries.slice(-7);
    if (!last.length) return null;
    const scores = last.map(e=>scoreFn(e, entries));
    return Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);
  };

  const avgP = avg7("p", scorePhysical, entries);
  const avgM = avg7("m", scoreMental, entries);
  const avgE = avg7("e", scoreEmotional, entries);

  return (
    <div className="scroll" style={{padding:"52px 16px 16px"}}>
      <div style={{fontFamily:"var(--serif)",fontSize:22,marginBottom:16}}>History</div>

      {/* WEEKLY NARRATIVE */}
      {narrative && (
        <div style={{background:"var(--bg2)",border:"0.5px solid var(--border)",borderRadius:"var(--r)",padding:"16px",marginBottom:20}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:".8px",textTransform:"uppercase",color:"var(--muted)",marginBottom:10}}>Your week in review</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:14}}>
            {[["Physical",narrative.avgP,"#1d9e75"],["Mental",narrative.avgM,"#7f77dd"],["Emotional",narrative.avgE,"#c4840a"],["Drain avg",narrative.avgD,"#c8553d"]].map(([l,v,c])=>(
              <div key={l} style={{background:"var(--bg3)",borderRadius:"var(--r2)",padding:"8px 10px"}}>
                <div style={{fontSize:9,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".4px",marginBottom:2}}>{l}</div>
                <div style={{fontFamily:"var(--serif)",fontSize:18,color:c,fontWeight:700}}>{v}%</div>
              </div>
            ))}
          </div>
          {narrative.sentences.map((s,i)=>(
            <div key={i} style={{fontSize:13,color:"var(--ink2)",lineHeight:1.7,marginBottom:2}}>{s}</div>
          ))}
          <div style={{marginTop:12,padding:"10px 12px",background:"var(--bg3)",borderRadius:"var(--r2)"}}>
            <div style={{fontSize:10,fontWeight:600,letterSpacing:".6px",textTransform:"uppercase",color:narrative.trendColor,marginBottom:4}}>
              Trend: {narrative.trendLabel}
            </div>
            <div style={{fontSize:12,color:"var(--ink2)",lineHeight:1.6}}>{narrative.fwd}</div>
          </div>
        </div>
      )}

      {entries.length >= 3 && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:20}}>
          {[["Physical",avgP,"#1d9e75"],["Mental",avgM,"#7f77dd"],["Emotional",avgE,"#c4840a"]].map(([l,v,c])=>(
            <div key={l} style={{background:"var(--bg2)",borderRadius:"var(--r)",padding:"12px 10px",textAlign:"center",border:"0.5px solid var(--border)"}}>
              <div style={{fontSize:10,color:"var(--muted)",letterSpacing:".5px",textTransform:"uppercase",marginBottom:4}}>{l}</div>
              <div style={{fontFamily:"var(--serif)",fontSize:22,color:c,fontWeight:700}}>{v??'—'}%</div>
              <div style={{fontSize:10,color:"var(--muted)"}}>7-day avg</div>
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={{textAlign:"center",padding:"60px 0",color:"var(--muted)",fontSize:14}}>
          No entries yet. Check in daily to build your picture.
        </div>
      ) : (
        <div className="card">
          {sorted.map(e=>{
            const p = scorePhysical(e, entries);
            const m = scoreMental(e);
            const em = scoreEmotional(e, entries);
            const d = scoreDrain(e, entries);
            const dI = drainLabel(d);
            return (
              <div className="h-row" key={e.date}>
                <div className="h-date">{fmtDate(e.date)}</div>
                <div className="h-scores">
                  {[[p,"#1d9e75"],[m,"#7f77dd"],[em,"#c4840a"]].map(([s,c],i)=>(
                    <div key={i} className="h-score" style={{background:`${c}22`,color:c}}>{s}</div>
                  ))}
                </div>
                <div className="h-drain" style={{color:dI.color}}>drain {d}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── PROFILE ───────────────────────────────────────────────────── */
function Profile({ profile, entries, onEdit }) {
  const bmi = profile?.weight && profile?.height
    ? (profile.weight / Math.pow(profile.height/100, 2)).toFixed(1)
    : null;
  const age = profile?.dob
    ? Math.floor((new Date()-new Date(profile.dob))/(365.25*86400000))
    : null;
  const streak = (() => {
    let s=0; const today=TODAY();
    let d=new Date();
    while(true){
      const key=d.toISOString().split("T")[0];
      if(entries.find(e=>e.date===key)){s++;}
      else if(key!==today) break;
      d.setDate(d.getDate()-1);
      if(s>365) break;
    }
    return s;
  })();

  return (
    <div className="scroll">
      <div className="profile-hdr fade-up">
        <div className="profile-avatar">{getInitials(profile?.name||"S")}</div>
        <div>
          <div style={{fontFamily:"var(--serif)",fontSize:20,color:"var(--ink)"}}>{profile?.name||"Your name"}</div>
          <div style={{fontSize:13,color:"var(--muted)",marginTop:2}}>Life audit · HealthIsh</div>
          {profile?.mbti && <div className="mbti-badge">{profile.mbti}</div>}
        </div>
      </div>

      <div className="section" style={{marginTop:16}}>
        <div className="section-title">Personal</div>
        <div className="card">
          {[
            ["Date of birth", profile?.dob || "—"],
            ["Age", age ? `${age} years` : "—"],
            ["Weight", profile?.weight ? `${profile.weight} kg` : "—"],
            ["Height", profile?.height ? `${profile.height} cm` : "—"],
            ["BMI", bmi || "—"],
            ["MBTI", profile?.mbti || "—"],
          ].map(([k,v])=>(
            <div className="p-row" key={k}>
              <span className="p-key">{k}</span>
              <span className="p-val">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="section" style={{marginTop:16}}>
        <div className="section-title">My people</div>
        <div className="card">
          <div className="p-row">
            <span className="p-key">Mother</span>
            <span className="p-val" style={{color:"var(--teal)"}}>Primary anchor</span>
          </div>
          <div className="p-row">
            <span className="p-key">Brother</span>
            <span className="p-val" style={{color:"var(--teal)"}}>Primary anchor</span>
          </div>
        </div>
      </div>

      <div className="section" style={{marginTop:16}}>
        <div className="section-title">Notifications</div>
        <div className="card">
          <div style={{fontSize:13,color:"var(--ink2)",lineHeight:1.6,marginBottom:12}}>
            Get reminded to check in 3 times a day — morning (8am), midday (2pm), and evening (9pm).
          </div>
          <button
            onClick={requestNotificationPermission}
            style={{
              width:"100%", padding:12, borderRadius:"var(--r2)",
              background:"var(--accent)", color:"#fff",
              fontSize:13, fontWeight:500,
            }}>
            Enable check-in reminders
          </button>
          <div style={{fontSize:11,color:"var(--muted)",marginTop:8,lineHeight:1.5,textAlign:"center"}}>
            You can turn these off anytime in your phone settings
          </div>
        </div>
      </div>

      <div className="section" style={{marginTop:16}}>
        <div className="section-title">Tracking</div>
        <div className="card">
          {[
            ["Total check-ins", entries.length],
            ["Current streak", `${streak} day${streak!==1?"s":""}`],
            ["Baseline status", entries.length >= 7 ? "Active" : `${7-entries.length} more to activate`],
          ].map(([k,v])=>(
            <div className="p-row" key={k}>
              <span className="p-key">{k}</span>
              <span className="p-val" style={k==="Baseline status"&&entries.length>=7?{color:"var(--teal)"}:{}}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{padding:"16px 16px 0"}}>
        <button style={{width:"100%",padding:14,background:"var(--bg2)",color:"var(--ink)",border:"0.5px solid var(--border2)",borderRadius:"var(--r)",fontSize:14}} onClick={onEdit}>
          Edit profile
        </button>
      </div>
    </div>
  );
}

/* ─── KNOW YOURSELF ENGINE ──────────────────────────────────────── */
const MBTI_PROFILES = {
  INTJ:{ archetype:"The Strategist", strengths:["Systems thinking","Long-range focus","Self-discipline","Independent under pressure"], weaknesses:["Dismisses emotional needs","Isolation spiral","Overworks until collapse","Difficulty asking for help"], opportunity:"Your upskilling compounds faster than almost any type — point the relentlessness at one thing.", threat:"You will rationalise isolation as productivity. Watch the family contact signal closely." },
  INTP:{ archetype:"The Analyst", strengths:["Deep problem-solving","Abstract thinking","Calm in complexity","Intellectual curiosity"], weaknesses:["Analysis paralysis","Avoids commitment","Undervalues routine","Loses track of basics (sleep, food)"], opportunity:"Your chess habit is building pattern recognition that transfers to PM thinking. Protect it.", threat:"When bored, you generate ideas instead of shipping. Side hustle score is your honesty check." },
  INFJ:{ archetype:"The Visionary", strengths:["Long-term vision","Deep empathy","Meaning-driven","Persistent on what matters"], weaknesses:["Absorbs others' stress","Avoids conflict","Meaning-loss hits hard","Burnout from idealism"], opportunity:"Your sense of meaning is a lever — when it's high, everything else follows. Track what generates it.", threat:"Rumination is your default stress response. High rumination + low meaning = danger zone." },
  INFP:{ archetype:"The Idealist", strengths:["Creative depth","Authentic drive","Empathic insight","Values clarity"], weaknesses:["Overwhelmed by criticism","Avoids structure","Procrastination under shame","Emotional flooding"], opportunity:"Gratitude practice lands deeper for you than most types. One honest sentence changes your state.", threat:"Negative self-talk is your primary internal threat. Every episode reinforces avoidance." },
  ENTJ:{ archetype:"The Commander", strengths:["High drive","Strategic execution","Natural leadership","Thrives under pressure"], weaknesses:["Low emotional awareness","Overcommits","Dismisses recovery","Impatience"], opportunity:"Your energy is an asset when directed. Single Vector Commit matters more for you than any other type.", threat:"You will outrun your recovery. Drain score is your canary. When it's heavy, slow down before you have to." },
  ENTP:{ archetype:"The Debater", strengths:["Fast pattern recognition","Adaptable","Creative problem-solving","High energy"], weaknesses:["Starts more than finishes","Boredom triggers drains","Avoids routine","Low follow-through"], opportunity:"Side hustle tracking is your most important metric — it's the honesty check on whether ideas become things.", threat:"Screen time and doomscrolling spike when you're understimulated. Watch the correlation." },
  ENFJ:{ archetype:"The Protagonist", strengths:["People energise you","Motivated by growth","High empathy","Natural communicator"], weaknesses:["Neglects self while helping others","Needs social fuel","Approval-seeking"], opportunity:"Family contact is not just emotional health for you — it's your energy source. Miss it and everything drops.", threat:"When isolated, you perform fine for a while then crash hard. The lag makes it invisible until it's not." },
  ENFP:{ archetype:"The Campaigner", strengths:["High enthusiasm","Sees potential everywhere","Creative","Makes connections others miss"], weaknesses:["Distracted by new ideas","Avoids difficult follow-through","Emotional volatility"], opportunity:"Your meaning score predicts everything else. A day with meaning generates outsized output.", threat:"Time wasted is your stealth drain — it doesn't feel bad in the moment. Watch the pattern." },
  ISTJ:{ archetype:"The Inspector", strengths:["High reliability","Structured execution","Consistent habits","Strong follow-through"], weaknesses:["Rigid under pressure","Suppresses stress","Avoids asking for help","Slow to adapt"], opportunity:"Your consistency is a compounding asset. Streak tracking matters more for you than for most.", threat:"You will maintain the form of habits while losing the substance. Check: are you going through motions?" },
  ISFJ:{ archetype:"The Defender", strengths:["Dedicated","Warm","Detail-oriented","Dependable"], weaknesses:["Overextends for others","Suppresses own needs","Avoids conflict"], opportunity:"Physical routine is your anchor. When workout habit holds, everything else is more stable.", threat:"You underreport stress. Reactivity and negative self-talk are your tells — watch them." },
  ISTP:{ archetype:"The Virtuoso", strengths:["Calm under pressure","Practical problem-solving","Adaptable","Present-focused"], weaknesses:["Disengages when bored","Avoids long-term planning","Low emotional expression"], opportunity:"Chess is not just a hobby for you — it's active nervous system regulation. Protect the habit.", threat:"Low meaning + high time wasted is your spiral signal. It starts quiet." },
  ISFP:{ archetype:"The Adventurer", strengths:["Authenticity","Present-moment awareness","Adaptable","Creative"], weaknesses:["Avoids conflict","Short-term focus","Sensitive to criticism"], opportunity:"Something enjoyable every day is not a luxury for you — it's a performance variable. Log it honestly.", threat:"Negative self-talk hits harder for your type than the score suggests. Don't underweight it." },
  ESTJ:{ archetype:"The Executive", strengths:["Organised","Dependable","Clear decision-making","High follow-through"], weaknesses:["Approval-seeking","Stress when plans break","Dismisses emotional complexity"], opportunity:"Commitment consistency is your superpower. When you commit publicly (even to this app), you deliver.", threat:"Reactivity + negative self-talk cluster signals that your standards are exceeding your capacity. Back off the target." },
  ESFJ:{ archetype:"The Consul", strengths:["Community-oriented","Warm","Loyal","Structured"], weaknesses:["Approval-dependent","Avoids disappointing others","Suppresses conflict"], opportunity:"Family contact is your highest-ROI health behaviour. It costs 5 minutes and pays across all three scores.", threat:"When you feel disapproved of (by yourself or others), drain spikes. Watch the correlation." },
  ESTP:{ archetype:"The Entrepreneur", strengths:["High action","Adaptable","Charismatic","Handles crisis well"], weaknesses:["Impulsive under stress","Avoids inner work","Short-term bias"], opportunity:"Physical workout is your primary mental health tool — more than meditation. Protect the habit.", threat:"Multiple drains active simultaneously is your pattern. One bad day cascades. Catch it at the first signal." },
  ESFP:{ archetype:"The Entertainer", strengths:["Energetic","People-focused","Spontaneous","Present-moment joy"], weaknesses:["Avoids difficult decisions","Low long-term planning","Emotional reactivity"], opportunity:"Social contact is your fuel. When family contact drops, upskill and physical scores follow within days.", threat:"Avoidance of inner work (meditation, reflection) accumulates. The cost is invisible until it isn't." },
};

function getBMICategory(bmi) {
  if (!bmi) return null;
  const b = parseFloat(bmi);
  if (b < 18.5) return { label:"Underweight", color:"#c4840a", note:"Physical energy and recovery may be limited by insufficient fuel. Prioritise consistent meals." };
  if (b < 25)   return { label:"Healthy range", color:"#3d8c6c", note:"Physical baseline is solid. Focus is on maintaining what's working." };
  if (b < 30)   return { label:"Overweight", color:"#c4840a", note:"Workout habit and meal timing have outsized impact at this range. Small consistent changes compound." };
  return { label:"Obese range", color:"#c8553d", note:"Physical health is the foundation everything else runs on. Prioritise sleep, daily movement, and meal regularity above all else." };
}

function getAgeInsight(age) {
  if (!age) return null;
  if (age < 25) return "Recovery is fast at your age — but habits formed now compound for decades. This is the highest-leverage window.";
  if (age < 35) return "Peak cognitive and physical capacity decade. The gap between who you are and who you could be is entirely about consistency.";
  if (age < 45) return "Recovery takes longer than it did. Sleep quality matters more than quantity. Build the habits now before the margin narrows further.";
  return "Longevity is built on basics: sleep, movement, connection. Nothing exotic. Consistency over intensity.";
}

function buildSWOT(profile, entries, avgP, avgM, avgE, avgD) {
  const mbtiKey = (profile?.mbti||"").toUpperCase().slice(0,4);
  const mp = MBTI_PROFILES[mbtiKey] || null;
  const bmi = profile?.weight && profile?.height
    ? (parseFloat(profile.weight) / Math.pow(parseFloat(profile.height)/100, 2)).toFixed(1)
    : null;
  const bmiCat = getBMICategory(bmi);
  const age = profile?.dob ? Math.floor((new Date()-new Date(profile.dob))/(365.25*86400000)) : null;

  const last14 = entries.slice(-14);
  const noContactDays = last14.filter(e=>!e.familyContact||e.familyContact==="none").length;
  const highRuminationDays = last14.filter(e=>(e.rumination||1)>=4).length;
  const noWorkoutDays = last14.filter(e=>!e.workoutMins||e.workoutMins<30).length;
  const noUpskillDays = last14.filter(e=>!e.upskillHrs||e.upskillHrs<1).length;
  const negativeSelfTalkDays = last14.filter(e=>e.negativeSelfTalk).length;
  const highCigaretteDays = last14.filter(e=>(e.cigarettes||0)>=4).length;
  const noMeditationDays = last14.filter(e=>!e.meditationMins||e.meditationMins<5).length;

  const strengths = [];
  const weaknesses = [];
  const opportunities = [];
  const threats = [];

  // Strengths — confirmed by data
  if (mp) strengths.push(...mp.strengths.slice(0,2).map(s=>({text:s, source:"personality"})));
  if (avgP >= 70) strengths.push({text:"Strong physical foundation — body is consistently showing up", source:"data"});
  if (avgM >= 70) strengths.push({text:"Mental clarity is above baseline — upskilling is working", source:"data"});
  if (avgE >= 75) strengths.push({text:"Emotional stability — you're staying grounded even under load", source:"data"});
  if (last14.filter(e=>e.meditationMins>=10).length >= 8) strengths.push({text:"Meditation habit is consistent — 8+ days of 10+ minutes in 2 weeks", source:"data"});
  if (last14.filter(e=>e.workoutMins>=60).length >= 6) strengths.push({text:"Workout habit is holding — 3+ sessions per week average", source:"data"});
  if (bmiCat?.label==="Healthy range") strengths.push({text:`Physical baseline is in healthy range (BMI ${bmi})`, source:"profile"});

  // Weaknesses — confirmed by data
  if (mp) weaknesses.push(...mp.weaknesses.slice(0,2).map(w=>({text:w, source:"personality"})));
  if (noContactDays >= 7) weaknesses.push({text:`Spoke to family on only ${14-noContactDays} of the last 14 days — isolation is a confirmed pattern`, source:"data"});
  if (highRuminationDays >= 5) weaknesses.push({text:`High rumination on ${highRuminationDays} of last 14 days — mental noise is a recurring state`, source:"data"});
  if (negativeSelfTalkDays >= 4) weaknesses.push({text:`Negative self-talk on ${negativeSelfTalkDays} days in 2 weeks — self-criticism is active`, source:"data"});
  if (noWorkoutDays >= 8) weaknesses.push({text:`Only ${14-noWorkoutDays} workout sessions in 2 weeks — movement is inconsistent`, source:"data"});
  if (avgD >= 30) weaknesses.push({text:`Average drain score is ${avgD} — sustained leakage across the baseline`, source:"data"});
  if (bmiCat && bmiCat.label !== "Healthy range") weaknesses.push({text:`BMI is ${bmi} (${bmiCat.label}) — physical baseline has room to improve`, source:"profile"});

  // Opportunities — highest-leverage gaps
  if (mp) opportunities.push({text:mp.opportunity, source:"personality"});
  if (noUpskillDays >= 5) opportunities.push({text:`Upskilling is inconsistent — ${14-noUpskillDays} active days in 2 weeks. Closing this gap would move mental score significantly`, source:"data"});
  if (noMeditationDays >= 7) opportunities.push({text:"Meditation below target on most days — 10 minutes daily would directly reduce rumination and drain scores", source:"data"});
  if (age) opportunities.push({text:getAgeInsight(age), source:"profile"});
  if (avgE < 65 && noContactDays < 10) opportunities.push({text:"Family contact is present but inconsistent — daily contact would lift emotional score by an estimated 15–20 points", source:"data"});

  // Threats — active failure modes
  if (mp) threats.push({text:mp.threat, source:"personality"});
  if (noContactDays >= 9) threats.push({text:`${noContactDays} of 14 days without genuine connection. Isolation is building, not drifting.`, source:"data"});
  if (highCigaretteDays >= 5) threats.push({text:`Smoking 4+ cigarettes on ${highCigaretteDays} of last 14 days — this is the single highest-cost body drain`, source:"data"});
  if (avgM < 45 && avgD >= 35) threats.push({text:"Low mental score combined with high sustained drain — this combination precedes burnout. Address both.", source:"data"});
  if (noWorkoutDays >= 10 && avgP < 55) threats.push({text:"Movement and physical score are both declining. Physical foundation supports everything else.", source:"data"});

  return { strengths:strengths.slice(0,4), weaknesses:weaknesses.slice(0,4), opportunities:opportunities.slice(0,3), threats:threats.slice(0,3), mp, bmiCat, bmi, age };
}

/* ─── DYNAMIC MBTI INSIGHTS ─────────────────────────────────────── */
function getDynamicMBTIInsights(mp, last14) {
  if (!mp || !last14.length) return null;
  const insights = [];

  const noContactDays = last14.filter(e=>!e.familyContact||e.familyContact==="none").length;
  const highRumDays   = last14.filter(e=>(e.rumination||1)>=4).length;
  const noWorkoutDays = last14.filter(e=>!e.workoutMins||e.workoutMins<30).length;
  const noUpskillDays = last14.filter(e=>!e.upskillHrs||e.upskillHrs<1).length;
  const negSTDays     = last14.filter(e=>e.negativeSelfTalk).length;
  const highScreenDays= last14.filter(e=>(e.screenTimeHrs||0)>4).length;
  const noMedDays     = last14.filter(e=>!e.meditationMins||e.meditationMins<5).length;

  // Map MBTI vulnerabilities to data signals
  const type = mp.archetype;

  if (noContactDays >= 8)
    insights.push({ status:"active", color:"#c8553d",
      text: `Your isolation tendency is currently active — ${noContactDays} of 14 days without genuine connection.` });
  else if (noContactDays <= 3)
    insights.push({ status:"dormant", color:"#3d8c6c",
      text: `Your connection habit is strong — only ${noContactDays} days without contact in 2 weeks.` });

  if (highRumDays >= 5)
    insights.push({ status:"active", color:"#c8553d",
      text: `Mental noise is elevated — high rumination on ${highRumDays} of 14 days. Your overactive thinking pattern is running.` });
  else if (highRumDays <= 1)
    insights.push({ status:"dormant", color:"#3d8c6c",
      text: `Rumination is low this fortnight. Mind is relatively clear.` });

  if (noWorkoutDays >= 10)
    insights.push({ status:"active", color:"#c8553d",
      text: `Movement has dropped off — only ${14-noWorkoutDays} active days in 2 weeks. Physical foundation is weakening.` });

  if (negSTDays >= 4)
    insights.push({ status:"active", color:"#c8553d",
      text: `Negative self-talk on ${negSTDays} of 14 days. Your self-criticism pattern is active right now.` });
  else if (negSTDays === 0)
    insights.push({ status:"dormant", color:"#3d8c6c",
      text: `No negative self-talk logged in 2 weeks. Self-talk pattern is healthy.` });

  if (noUpskillDays >= 8)
    insights.push({ status:"active", color:"#c4840a",
      text: `Upskilling has been inconsistent — only ${14-noUpskillDays} focused days in 2 weeks. Forward momentum is stalling.` });
  else if (noUpskillDays <= 3)
    insights.push({ status:"strong", color:"#3d8c6c",
      text: `Upskilling is consistent — ${14-noUpskillDays} active days in 2 weeks. This is your compounding advantage.` });

  if (highScreenDays >= 6)
    insights.push({ status:"active", color:"#c8553d",
      text: `Screen time above 4 hrs on ${highScreenDays} of 14 days — this is directly suppressing your mental clarity score.` });

  return insights.slice(0, 4);
}

/* ─── KNOW YOURSELF SCREEN ──────────────────────────────────────── */
function KnowYourself({ profile, entries }) {
  const hasData = entries.length >= 3;
  const last14 = entries.slice(-14);
  const scoreFn = (fn) => last14.length
    ? Math.round(last14.map(e=>fn(e,entries)).reduce((a,b)=>a+b,0)/last14.length)
    : null;
  const avgP = hasData ? scoreFn(scorePhysical) : null;
  const avgM = hasData ? scoreFn(scoreMental) : null;
  const avgE = hasData ? scoreFn(scoreEmotional) : null;
  const avgD = hasData ? scoreFn((e,all)=>scoreDrain(e,all)) : null;
  const swot = buildSWOT(profile, entries, avgP, avgM, avgE, avgD);
  const mbtiKey = (profile?.mbti||"").toUpperCase().slice(0,4);
  const mp = MBTI_PROFILES[mbtiKey] || null;

  const SWOTCard = ({title, icon, color, bg, items}) => (
    <div style={{background:bg,border:`0.5px solid ${color}33`,borderRadius:"var(--r)",padding:"14px 16px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{fontSize:16,color}}>{icon}</span>
        <span style={{fontSize:11,fontWeight:600,letterSpacing:".8px",textTransform:"uppercase",color}}>{title}</span>
      </div>
      {items.map((item,i)=>(
        <div key={i} style={{display:"flex",gap:10,marginBottom:i<items.length-1?10:0}}>
          <div style={{width:5,borderRadius:2,background:color,flexShrink:0,marginTop:3}}/>
          <div>
            <div style={{fontSize:13,color:"var(--ink)",lineHeight:1.5}}>{item.text}</div>
            <div style={{fontSize:10,color:"var(--muted)",marginTop:2,letterSpacing:".4px"}}>
              {item.source==="data"?"from your data":item.source==="personality"?"from your personality type":"from your profile"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="scroll" style={{padding:"0 0 16px"}}>
      <div style={{padding:"52px 16px 16px"}}>
        <div style={{fontFamily:"var(--serif)",fontSize:22,marginBottom:4}}>Know yourself</div>
        <div style={{fontSize:12,color:"var(--muted)"}}>
          {hasData ? `Built from your profile + last ${Math.min(entries.length,14)} days of data.` : "Based on your profile. Check in daily to personalise with your data."}
        </div>
      </div>

      {/* Personalisation nudge — shown until 3 check-ins */}
      {!hasData && (
        <div className="section">
          <div style={{background:"#1a2a1a",border:"0.5px solid #1d9e7566",borderRadius:"var(--r)",padding:"14px 16px",display:"flex",gap:12,alignItems:"flex-start"}}>
            <div style={{fontSize:18,color:"#1d9e75",flexShrink:0}}>◆</div>
            <div>
              <div style={{fontSize:13,fontWeight:500,color:"#9FE1CB",marginBottom:4}}>
                {3-entries.length} more check-in{3-entries.length!==1?"s":""} to personalise this
              </div>
              <div style={{fontSize:12,color:"#5DCAA5",lineHeight:1.6}}>
                Right now you're seeing insights based on your personality type. Once you have 3 check-ins, this page adapts to your actual patterns — your real strengths and threats, not just the ones typical for your type.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Identity card */}
      <div className="section">
        <div className="section-title">Your identity</div>
        <div style={{background:"var(--bg2)",border:"0.5px solid var(--border)",borderRadius:"var(--r)",padding:"16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
            <div style={{width:52,height:52,borderRadius:"50%",background:"var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--serif)",fontSize:20,fontWeight:700,color:"#fff",flexShrink:0}}>
              {getInitials(profile?.name||"S")}
            </div>
            <div>
              <div style={{fontFamily:"var(--serif)",fontSize:18,color:"var(--ink)"}}>{profile?.name||"—"}</div>
              {swot.mp && <div style={{fontSize:12,color:"var(--muted)",marginTop:2}}>{swot.mp.archetype}</div>}
              {mbtiKey && <div style={{display:"inline-block",background:"#26215C",color:"#AFA9EC",fontSize:11,fontWeight:600,padding:"2px 10px",borderRadius:20,marginTop:4}}>{mbtiKey}</div>}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {swot.age && <div style={{background:"var(--bg3)",borderRadius:"var(--r2)",padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"var(--muted)",marginBottom:2}}>Age</div>
              <div style={{fontFamily:"var(--serif)",fontSize:20,color:"var(--ink)"}}>{swot.age}</div>
            </div>}
            {swot.bmi && <div style={{background:"var(--bg3)",borderRadius:"var(--r2)",padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"var(--muted)",marginBottom:2}}>BMI</div>
              <div style={{fontFamily:"var(--serif)",fontSize:20,color:swot.bmiCat?.color||"var(--ink)"}}>{swot.bmi}</div>
              <div style={{fontSize:10,color:swot.bmiCat?.color,marginTop:1}}>{swot.bmiCat?.label}</div>
            </div>}
            {[["14-day physical",avgP,"#1d9e75"],["14-day mental",avgM,"#7f77dd"],["14-day emotional",avgE,"#c4840a"],["14-day drain",avgD,"#c8553d"]].map(([l,v,c])=>(
              v!==null && <div key={l} style={{background:"var(--bg3)",borderRadius:"var(--r2)",padding:"10px 12px"}}>
                <div style={{fontSize:10,color:"var(--muted)",marginBottom:2}}>{l}</div>
                <div style={{fontFamily:"var(--serif)",fontSize:20,color:c}}>{v}%</div>
              </div>
            ))}
          </div>
          {swot.bmiCat && swot.bmiCat.label!=="Healthy range" && (
            <div style={{marginTop:10,padding:"10px 12px",background:"var(--bg3)",borderRadius:"var(--r2)",fontSize:12,color:"var(--ink2)",lineHeight:1.6}}>
              {swot.bmiCat.note}
            </div>
          )}
        </div>
      </div>

      {/* SWOT */}
      <div className="section" style={{marginTop:16}}>
        <div className="section-title">Your SWOT — updated from data</div>
        <SWOTCard title="Strengths" icon="◆" color="#1d9e75" bg="var(--bg2)" items={swot.strengths}/>
        <SWOTCard title="Weaknesses" icon="◉" color="#c8553d" bg="var(--bg2)" items={swot.weaknesses}/>
        <SWOTCard title="Opportunities" icon="◈" color="#7f77dd" bg="var(--bg2)" items={swot.opportunities}/>
        <SWOTCard title="Threats" icon="◇" color="#c4840a" bg="var(--bg2)" items={swot.threats}/>
      </div>

      {/* Personality deep-dive */}
      {swot.mp && (
        <div className="section" style={{marginTop:16}}>
          <div className="section-title">Your type — {mbtiKey}</div>
          <div style={{background:"var(--bg2)",border:"0.5px solid var(--border)",borderRadius:"var(--r)",padding:"16px"}}>
            <div style={{fontFamily:"var(--serif)",fontSize:16,color:"var(--ink)",marginBottom:12}}>{swot.mp.archetype}</div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:".6px",color:"#1d9e75",textTransform:"uppercase",marginBottom:6}}>Natural strengths</div>
              {swot.mp.strengths.map((s,i)=><div key={i} style={{fontSize:13,color:"var(--ink2)",padding:"5px 0",borderBottom:"0.5px solid var(--border)",lineHeight:1.4}}>{s}</div>)}
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:".6px",color:"#c8553d",textTransform:"uppercase",marginBottom:6,marginTop:12}}>Known vulnerabilities</div>
              {swot.mp.weaknesses.map((w,i)=><div key={i} style={{fontSize:13,color:"var(--ink2)",padding:"5px 0",borderBottom:"0.5px solid var(--border)",lineHeight:1.4}}>{w}</div>)}
            </div>
            <div style={{marginTop:12,padding:"12px",background:"var(--bg3)",borderRadius:"var(--r2)"}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:".6px",color:"#c4840a",textTransform:"uppercase",marginBottom:6}}>Your specific opportunity</div>
              <div style={{fontSize:13,color:"var(--ink2)",lineHeight:1.6}}>{swot.mp.opportunity}</div>
            </div>
            <div style={{marginTop:8,padding:"12px",background:"var(--bg3)",borderRadius:"var(--r2)"}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:".6px",color:"#c8553d",textTransform:"uppercase",marginBottom:6}}>Your specific threat</div>
              <div style={{fontSize:13,color:"var(--ink2)",lineHeight:1.6}}>{swot.mp.threat}</div>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic live insights — personality meets current data */}
      {swot.mp && hasData && (() => {
        const dynInsights = getDynamicMBTIInsights(swot.mp, last14);
        if (!dynInsights?.length) return null;
        return (
          <div className="section" style={{marginTop:16}}>
            <div className="section-title">Your patterns — live from data</div>
            <div style={{background:"var(--bg2)",border:"0.5px solid var(--border)",borderRadius:"var(--r)",padding:"16px"}}>
              <div style={{fontSize:12,color:"var(--muted)",marginBottom:12,lineHeight:1.5}}>
                These insights combine your {mbtiKey} wiring with what your last 14 days actually show.
              </div>
              {dynInsights.map((ins,i)=>(
                <div key={i} style={{display:"flex",gap:10,paddingBottom:i<dynInsights.length-1?12:0,marginBottom:i<dynInsights.length-1?12:0,borderBottom:i<dynInsights.length-1?"0.5px solid var(--border)":"none"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:ins.color,flexShrink:0,marginTop:4}}/>
                  <div>
                    <div style={{fontSize:10,fontWeight:600,letterSpacing:".5px",textTransform:"uppercase",color:ins.color,marginBottom:3}}>
                      {ins.status==="active"?"Currently active":ins.status==="dormant"?"Currently dormant":"Currently strong"}
                    </div>
                    <div style={{fontSize:13,color:"var(--ink2)",lineHeight:1.5}}>{ins.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {!mbtiKey && (
        <div className="section" style={{marginTop:16}}>
          <div style={{background:"var(--bg2)",border:"0.5px solid var(--border)",borderRadius:"var(--r)",padding:"16px",textAlign:"center"}}>
            <div style={{fontSize:14,color:"var(--ink2)",marginBottom:10,lineHeight:1.6}}>Add your MBTI type in Profile to unlock personality-based insights.</div>
            <div style={{fontSize:12,color:"var(--muted)",marginBottom:12}}>Takes 12 minutes to discover your type.</div>
            <div style={{fontSize:13,color:"var(--accent)",cursor:"pointer",textDecoration:"underline"}}
              onClick={()=>window.open("https://www.16personalities.com/free-personality-test","_blank")}>
              Take the free test →
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── ICP ONBOARDING ────────────────────────────────────────────── */
const STRUGGLES = [
  { id:"energy",        label:"Low energy",               sub:"Running on fumes most days" },
  { id:"focus",         label:"Lack of focus",             sub:"Mind is scattered, hard to go deep" },
  { id:"burnout",       label:"Burnout",                   sub:"Doing a lot but feeling empty" },
  { id:"noise",         label:"Mental noise",              sub:"Circular thinking, can't switch off" },
  { id:"inconsistency", label:"Inconsistency",             sub:"Starting strong, dropping off" },
  { id:"isolation",     label:"Social isolation",          sub:"Disconnecting from people who matter" },
];

const GOALS = [
  { id:"momentum",    label:"Build consistent momentum",   sub:"Show up every day, not just when motivated" },
  { id:"drain",       label:"Reduce cognitive drain",      sub:"Less noise, more clarity" },
  { id:"patterns",    label:"Understand my patterns",      sub:"Know what actually drives my good and bad days" },
  { id:"physical",    label:"Improve physical baseline",   sub:"Sleep, energy, movement — fix the foundation" },
  { id:"focus_deep",  label:"Improve deep focus",          sub:"More output in less time" },
];

function ICPOnboarding({ onDone }) {
  const [step, setStep]         = useState(1);
  const [struggles, setStruggles] = useState([]); // array — multi-select
  const [goals, setGoals]       = useState([]);   // array — multi-select

  const toggle = (arr, setArr, id) => {
    setArr(arr.includes(id) ? arr.filter(x=>x!==id) : [...arr, id]);
  };

  const handleDone = async () => {
    const icp = { struggles, goals, completedAt: new Date().toISOString() };
    await storageSet(KEYS.icp, icp);
    onDone(icp);
  };

  const MultiCard = ({ item, selected, onToggle }) => (
    <div onClick={onToggle} style={{
      padding:"14px 16px", borderRadius:"var(--r)", cursor:"pointer",
      marginBottom:10, transition:"all .15s",
      background: selected ? "#1a1208" : "var(--bg2)",
      border: `0.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
      display:"flex", alignItems:"flex-start", gap:12,
    }}>
      {/* Checkbox indicator */}
      <div style={{
        width:18, height:18, borderRadius:5, flexShrink:0, marginTop:1,
        background: selected ? "var(--accent)" : "transparent",
        border: `1.5px solid ${selected ? "var(--accent)" : "var(--border2)"}`,
        display:"flex", alignItems:"center", justifyContent:"center",
        transition:"all .15s",
      }}>
        {selected && <span style={{color:"#fff", fontSize:11, fontWeight:700, lineHeight:1}}>✓</span>}
      </div>
      <div style={{flex:1}}>
        <div style={{
          fontSize:14, fontWeight:500, marginBottom:3,
          color: selected ? "var(--accent)" : "var(--ink)",
        }}>{item.label}</div>
        <div style={{fontSize:12, color:"var(--muted)", lineHeight:1.5}}>{item.sub}</div>
      </div>
    </div>
  );

  const canContinue1 = struggles.length > 0;
  const canContinue2 = goals.length > 0;

  return (
    <div style={{
      height:"100vh", display:"flex", flexDirection:"column",
      background:"var(--bg)", overflow:"hidden",
    }}>
      {/* Scrollable content */}
      <div style={{flex:1, overflowY:"auto", padding:"52px 24px 0", WebkitOverflowScrolling:"touch"}}>
        {/* Progress bar */}
        <div style={{display:"flex", gap:6, marginBottom:32}}>
          {[1,2].map(s => (
            <div key={s} style={{
              flex:1, height:3, borderRadius:2,
              background: s <= step ? "var(--accent)" : "var(--border)",
              transition:"background .3s",
            }}/>
          ))}
        </div>

        {step === 1 && (<>
          <div style={{fontFamily:"var(--serif)", fontSize:26, color:"var(--ink)", marginBottom:8, lineHeight:1.3}}>
            What are you struggling with?
          </div>
          <div style={{fontSize:13, color:"var(--muted)", marginBottom:24, lineHeight:1.6}}>
            Select everything that applies. Be honest — this shapes how the app reads your data.
          </div>
          {STRUGGLES.map(s => (
            <MultiCard key={s.id} item={s}
              selected={struggles.includes(s.id)}
              onToggle={() => toggle(struggles, setStruggles, s.id)}/>
          ))}
          <div style={{height:24}}/>
        </>)}

        {step === 2 && (<>
          <div style={{fontFamily:"var(--serif)", fontSize:26, color:"var(--ink)", marginBottom:8, lineHeight:1.3}}>
            What do you want to build?
          </div>
          <div style={{fontSize:13, color:"var(--muted)", marginBottom:24, lineHeight:1.6}}>
            Select all that matter. You're not locked in — this evolves as you do.
          </div>
          {GOALS.map(g => (
            <MultiCard key={g.id} item={g}
              selected={goals.includes(g.id)}
              onToggle={() => toggle(goals, setGoals, g.id)}/>
          ))}
          <div style={{height:24}}/>
        </>)}
      </div>

      {/* Fixed bottom buttons */}
      <div style={{padding:"16px 24px 32px", background:"var(--bg)", borderTop:"0.5px solid var(--border)", flexShrink:0}}>
        {step === 1 && (
          <button onClick={() => canContinue1 && setStep(2)} disabled={!canContinue1} style={{
            width:"100%", padding:15,
            background: canContinue1 ? "var(--accent)" : "var(--bg3)",
            color: canContinue1 ? "#fff" : "var(--muted)",
            borderRadius:"var(--r)", fontSize:15, fontWeight:500,
            cursor: canContinue1 ? "pointer" : "not-allowed", transition:"all .2s",
          }}>
            {canContinue1 ? `Continue with ${struggles.length} selected →` : "Select at least one"}
          </button>
        )}
        {step === 2 && (
          <div style={{display:"flex", gap:10}}>
            <button onClick={() => setStep(1)} style={{
              flex:1, padding:15, background:"transparent", color:"var(--muted)",
              border:"0.5px solid var(--border)", borderRadius:"var(--r)", fontSize:14,
            }}>← Back</button>
            <button onClick={() => canContinue2 && handleDone()} disabled={!canContinue2} style={{
              flex:2, padding:15,
              background: canContinue2 ? "var(--accent)" : "var(--bg3)",
              color: canContinue2 ? "#fff" : "var(--muted)",
              borderRadius:"var(--r)", fontSize:15, fontWeight:500,
              cursor: canContinue2 ? "pointer" : "not-allowed", transition:"all .2s",
            }}>
              {canContinue2 ? `Let's go →` : "Select at least one"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── MAIN APP ──────────────────────────────────────────────────── */
export default function HealthIsh() {
  const [onboarded, setOnboarded] = useState(null);
  const [profile, setProfile] = useState(null);
  const [entries, setEntries] = useState([]);
  const [tab, setTab] = useState("home");
  const [editingProfile, setEditingProfile] = useState(false);
  const [icp, setIcp] = useState(undefined); // undefined = loading

  useEffect(()=>{
    (async()=>{
      const ob = await storageGet(KEYS.onboarded);
      const pr = await storageGet(KEYS.profile);
      const en = await storageGet(KEYS.entries);
      const ic = await storageGet(KEYS.icp);
      setOnboarded(!!ob);
      setProfile(pr||null);
      setEntries(en||[]);
      setIcp(ic||null);
    })();

    // Initialise OneSignal after a short delay to let SDK load
    setTimeout(() => {
      initOneSignal();
    }, 1500);
  },[]);

  const handleOnboard = async (pr) => {
    setProfile(pr);
    setOnboarded(true);
  };

  const handleSaveEntry = async (entry) => {
    // Filter by both date AND period so periods don't overwrite each other
    const updated = [
      ...entries.filter(e => !(e.date === entry.date && e.period === entry.period)),
      entry,
    ].sort((a,b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      const order = { morning:0, midday:1, evening:2 };
      return (order[a.period]??0) - (order[b.period]??0);
    });
    setEntries(updated);
    await storageSet(KEYS.entries, updated);
  };

  // Still loading
  if (onboarded === null || icp === undefined) {
    return <div style={{background:"var(--bg)",minHeight:"100vh"}}/>;
  }

  // First-time profile setup
  if (!onboarded || editingProfile) {
    return (
      <>
        <style dangerouslySetInnerHTML={{__html:G}}/>
        <Onboarding existing={editingProfile ? profile : null} onDone={pr=>{setProfile(pr);setOnboarded(true);setEditingProfile(false);}}/>
      </>
    );
  }

  // ICP onboarding — shown to everyone who hasn't completed it yet
  if (!icp) {
    return (
      <>
        <style dangerouslySetInnerHTML={{__html:G}}/>
        <ICPOnboarding onDone={(ic) => setIcp(ic)}/>
      </>
    );
  }

  const tabs = [
    { id:"home", label:"Home", icon:<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { id:"checkin", label:"Check in", icon:<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> },
    { id:"history", label:"History", icon:<svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
    { id:"self", label:"Know self", icon:<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> },
    { id:"profile", label:"Profile", icon:<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{__html:G}}/>
      <div className="app">
        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",minHeight:0}}>
          {tab==="home"    && <div className="screen active"><Dashboard entries={entries} profile={profile} setTab={setTab} icp={icp}/></div>}
          {tab==="checkin" && <div className="screen active"><CheckIn entries={entries} onSave={handleSaveEntry} goHome={()=>setTab("home")}/></div>}
          {tab==="history" && <div className="screen active"><History entries={entries}/></div>}
          {tab==="self"    && <div className="screen active"><KnowYourself profile={profile} entries={entries}/></div>}
          {tab==="profile" && <div className="screen active"><Profile profile={profile} entries={entries} onEdit={()=>setEditingProfile(true)}/></div>}
        </div>
        <nav className="nav">
          {tabs.map(t=>(
            <button key={t.id} className={`nav-btn ${tab===t.id?"active":""}`} onClick={()=>setTab(t.id)}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
