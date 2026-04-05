import { useState, useEffect, useRef } from "react";

/* ─── STORAGE KEYS ─────────────────────────────────────────────── */
const KEYS = {
  entries: "healthish:entries",
  profile: "healthish:profile",
  onboarded: "healthish:onboarded",
};

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

  // Caffeine cutoff — 7 pts
  const cc = e.caffeineCutoffHr ?? 14;
  if (cc <= 14) pts += 7;
  else if (cc <= 16) pts += 4;
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

  // Chess — 10 pts
  const chess = e.chessMins || 0;
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

  // Caffeine excess — max 5
  const caff = e.caffeineCups || 2;
  if (caff >= 5) drain += 5;
  else if (caff >= 3) drain += 2;

  // Sugar/junk — max 5
  if (e.sugarDay) drain += 3;
  if (e.junkDinner) drain += 3;
  drain = Math.min(drain, drain); // already bounded by individual caps

  // Hydration — max 3
  if (!e.hydrated) drain += 3;

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

/* ─── STORAGE HELPERS ───────────────────────────────────────────── */
async function storageGet(key) {
  try {
    const r = await window.storage?.get(key);
    return r?.value ? JSON.parse(r.value) : null;
  } catch { return null; }
}
async function storageSet(key, val) {
  try { await window.storage?.set(key, JSON.stringify(val)); } catch {}
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
body{background:var(--bg);color:var(--ink);font-family:var(--sans);min-height:100vh;overflow-x:hidden}
.app{max-width:430px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column;position:relative}
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
.screen{display:none;flex:1;flex-direction:column;overflow:hidden}
.screen.active{display:flex}
.scroll{flex:1;overflow-y:auto;padding:0 0 16px}
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
function Onboarding({ onDone }) {
  const [name,setName]=useState("");
  const [dob,setDob]=useState("");
  const [weight,setWeight]=useState("");
  const [height,setHeight]=useState("");
  const [mbti,setMbti]=useState("");

  const save = async () => {
    if (!name.trim()) return;
    const profile = { name:name.trim(), dob, weight, height, mbti:mbti.toUpperCase() };
    await storageSet(KEYS.profile, profile);
    await storageSet(KEYS.onboarded, true);
    onDone(profile);
  };

  return (
    <div className="ob-wrap">
      <div className="ob-title fade-up">Hey there.<br/>Let's set up<br/>your space.</div>
      <div className="ob-sub fade-up" style={{animationDelay:".1s"}}>HealthIsh tracks your whole life — honestly. This takes 60 seconds.</div>
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
        <div className="ob-label">MBTI type (optional)</div>
        <input className="ob-input" placeholder="INTJ" maxLength={4} value={mbti} onChange={e=>setMbti(e.target.value)}/>
      </div>
      <button className="ob-btn fade-up" style={{animationDelay:".35s"}} onClick={save}>
        Let's go →
      </button>
    </div>
  );
}

/* ─── CHECK-IN FORM ─────────────────────────────────────────────── */
function CheckIn({ entries, onSave, goHome }) {
  const today = TODAY();
  const existing = entries.find(e=>e.date===today) || {};
  const [submitted, setSubmitted] = useState(!!existing.submitted);

  // Physical
  const [workoutMins, setWorkoutMins] = useState(existing.workoutMins??0);
  const [sleepHrs, setSleepHrs] = useState(existing.sleepHrs??7);
  const [bedtimeHr, setBedtimeHr] = useState(existing.bedtimeHr??23);
  const [energy, setEnergy] = useState(existing.energy??3);
  const [sunlight, setSunlight] = useState(existing.sunlight??null);
  const [mealBefore2, setMealBefore2] = useState(existing.mealBefore2??null);
  const [caffeineCutoffHr, setCaffeineCutoffHr] = useState(existing.caffeineCutoffHr??14);
  const [caffeineCups, setCaffeineCups] = useState(existing.caffeineCups??2);

  // Mental
  const [upskillHrs, setUpskillHrs] = useState(existing.upskillHrs??0);
  const [clarity, setClarity] = useState(existing.clarity??3);
  const [screenTimeHrs, setScreenTimeHrs] = useState(existing.screenTimeHrs??3);
  const [sideHustle, setSideHustle] = useState(existing.sideHustle??"none");
  const [chessMins, setChessMins] = useState(existing.chessMins??0);

  // Emotional
  const [meditationMins, setMeditationMins] = useState(existing.meditationMins??0);
  const [mood, setMood] = useState(existing.mood??3);
  const [familyContact, setFamilyContact] = useState(existing.familyContact??"none");
  const [contactQuality, setContactQuality] = useState(existing.contactQuality??false);
  const [meaning, setMeaning] = useState(existing.meaning??null);
  const [enjoyable, setEnjoyable] = useState(existing.enjoyable??null);
  const [gratitude, setGratitude] = useState(existing.gratitude??"");

  // Drains
  const [cigarettes, setCigarettes] = useState(existing.cigarettes??0);
  const [alcohol, setAlcohol] = useState(existing.alcohol??0);
  const [sugarDay, setSugarDay] = useState(existing.sugarDay??false);
  const [junkDinner, setJunkDinner] = useState(existing.junkDinner??false);
  const [hydrated, setHydrated] = useState(existing.hydrated??true);
  const [timeWasted, setTimeWasted] = useState(existing.timeWasted??0);
  const [rumination, setRumination] = useState(existing.rumination??1);
  const [negativeSelfTalk, setNegativeSelfTalk] = useState(existing.negativeSelfTalk??false);
  const [socialMins, setSocialMins] = useState(existing.socialMins??20);
  const [masturbation, setMasturbation] = useState(existing.masturbation??false);
  const [lateNightPhone, setLateNightPhone] = useState(existing.lateNightPhone??false);
  const [reactivity, setReactivity] = useState(existing.reactivity??false);

  const handleSave = async () => {
    const entry = {
      date: today, submitted: true,
      workoutMins, sleepHrs, bedtimeHr, energy, sunlight, mealBefore2,
      caffeineCutoffHr, caffeineCups, upskillHrs, clarity, screenTimeHrs,
      sideHustle, chessMins, meditationMins, mood, familyContact, contactQuality,
      meaning, enjoyable, gratitude, cigarettes, alcohol, sugarDay, junkDinner,
      hydrated, timeWasted, rumination, negativeSelfTalk, socialMins,
      masturbation, lateNightPhone, reactivity,
    };
    await onSave(entry);
    setSubmitted(true);
    goHome();
  };

  function Slider({label, min, max, step=1, val, setVal, leftLabel, rightLabel, unit=""}) {
    return (
      <div className="ci-row">
        <div className="ci-q">
          <span>{label}</span>
          <span className="ci-val">{val}{unit}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={val}
          style={{background:`linear-gradient(90deg,var(--accent) ${((val-min)/(max-min))*100}%,var(--bg3) 0%)`}}
          onChange={e=>setVal(Number(e.target.value))}/>
        {(leftLabel||rightLabel) && (
          <div className="ci-ends">
            <span className="ci-end">{leftLabel}</span>
            <span className="ci-end">{rightLabel}</span>
          </div>
        )}
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
          <div style={{fontFamily:"var(--serif)",fontSize:28,marginBottom:10,color:"var(--ink)"}}>Done for today.</div>
          <div style={{fontSize:14,color:"var(--muted)",lineHeight:1.6,marginBottom:24}}>Your data is saved. Come back tomorrow.</div>
          <button style={{background:"var(--accent)",color:"#fff",padding:"12px 28px",borderRadius:"var(--r)",fontSize:14}} onClick={()=>setSubmitted(false)}>Update today's entry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll" style={{padding:"0 0 16px"}}>
      <div style={{padding:"52px 16px 16px"}}>
        <div style={{fontFamily:"var(--serif)",fontSize:22,marginBottom:4}}>Daily check-in</div>
        <div style={{fontSize:12,color:"var(--muted)"}}>Honest answers only. Under 3 minutes.</div>
      </div>

      {/* PHYSICAL */}
      <div className="section">
        <div className="section-title">Physical</div>
        <div className="ci-block">
          <Slider label="Workout today" min={0} max={120} val={workoutMins} setVal={setWorkoutMins} leftLabel="Rest day" rightLabel="2 hours" unit=" min"/>
          <Slider label="Sleep last night" min={3} max={12} step={0.5} val={sleepHrs} setVal={setSleepHrs} leftLabel="Depleted" rightLabel="Fully restored" unit=" hrs"/>
          <Slider label="Bedtime (yesterday)" min={20} max={26} step={0.5} val={bedtimeHr} setVal={setBedtimeHr}
            leftLabel="8pm" rightLabel="2am" unit={`:${((bedtimeHr%1)*60||"00").toString().padStart(2,"0")}`}/>
          <Slider label="Physical energy" min={1} max={5} val={energy} setVal={setEnergy} leftLabel="Running on fumes" rightLabel="Fully charged"/>
          <div className="ci-row">
            <div className="ci-q"><span>Morning sunlight (before 10am)</span></div>
            <YesNo val={sunlight} setVal={setSunlight}/>
          </div>
          <div className="ci-row">
            <div className="ci-q"><span>First real meal before 2pm</span></div>
            <YesNo val={mealBefore2} setVal={setMealBefore2}/>
          </div>
          <Slider label="Caffeine cutoff" min={10} max={24} step={0.5} val={caffeineCutoffHr} setVal={setCaffeineCutoffHr}
            leftLabel="10am" rightLabel="Midnight" unit={`:00`}/>
          <Slider label="Caffeine cups total" min={0} max={8} val={caffeineCups} setVal={setCaffeineCups} leftLabel="None" rightLabel="8+ cups" unit=" cups"/>
        </div>
      </div>

      {/* MENTAL */}
      <div className="section" style={{marginTop:16}}>
        <div className="section-title">Mental</div>
        <div className="ci-block">
          <Slider label="Upskilling time (PM / AI)" min={0} max={8} step={0.5} val={upskillHrs} setVal={setUpskillHrs} leftLabel="None" rightLabel="8 hrs" unit=" hrs"/>
          <Slider label="Mental clarity" min={1} max={5} val={clarity} setVal={setClarity} leftLabel="Noise everywhere" rightLabel="Laser clarity"/>
          <Slider label="Screen time (recreational)" min={0} max={10} step={0.5} val={screenTimeHrs} setVal={setScreenTimeHrs} leftLabel="None" rightLabel="10+ hrs" unit=" hrs"/>
          <Slider label="Chess today" min={0} max={60} step={5} val={chessMins} setVal={setChessMins} leftLabel="Skipped" rightLabel="1 hour" unit=" min"/>
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
          <Slider label="Meditation + mantra chanting" min={0} max={30} val={meditationMins} setVal={setMeditationMins} leftLabel="Skipped" rightLabel="30 min" unit=" min"/>
          <Slider label="Overall mood" min={1} max={5} val={mood} setVal={setMood} leftLabel="Hollow" rightLabel="Fully invested"/>
          <div className="ci-row">
            <div className="ci-q"><span>Spoke to mum or brother today</span></div>
            <div className="ci-chips">
              {[["both","Both"],["one","One of them"],["voicenote","Voice note"],["none","Neither"]].map(([v,l])=>(
                <div key={v} className={`chip ${familyContact===v?"selected":""}`} onClick={()=>setFamilyContact(v)}>{l}</div>
              ))}
            </div>
          </div>
          {familyContact && familyContact!=="none" && (
            <div className="ci-row">
              <div className="ci-q"><span>Did the conversation feel real?</span></div>
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
            <textarea rows={2} style={{width:"100%",padding:"10px 12px",fontSize:13,resize:"none",marginTop:4,borderRadius:"var(--r2)"}}
              placeholder="Be specific. Not 'health'. The chai this morning was perfect."
              value={gratitude} onChange={e=>setGratitude(e.target.value)}/>
          </div>
        </div>
      </div>

      {/* DRAINS */}
      <div className="section" style={{marginTop:16}}>
        <div className="section-title">Drains — honest signals</div>
        <div className="ci-block">
          <Slider label="Cigarettes smoked" min={0} max={20} val={cigarettes} setVal={setCigarettes} leftLabel="None" rightLabel="20+" unit=""/>
          <Slider label="Alcohol drinks" min={0} max={8} val={alcohol} setVal={setAlcohol} leftLabel="None" rightLabel="8+" unit=""/>
          <Slider label="Social media / doomscrolling" min={0} max={180} step={10} val={socialMins} setVal={setSocialMins} leftLabel="None" rightLabel="3 hrs" unit=" min"/>
          <Slider label="Time wasted (honest estimate)" min={0} max={5} step={0.5} val={timeWasted} setVal={setTimeWasted} leftLabel="None" rightLabel="5 hrs" unit=" hrs"/>
          <Slider label="Rumination (circular thinking)" min={1} max={5} val={rumination} setVal={setRumination} leftLabel="Quiet mind" rightLabel="Consumed by thoughts"/>
          <div className="ci-row">
            <div className="ci-q"><span>High-sugar day?</span></div>
            <YesNo val={sugarDay} setVal={setSugarDay}/>
          </div>
          <div className="ci-row">
            <div className="ci-q"><span>Ordered junk for dinner?</span></div>
            <YesNo val={junkDinner} setVal={setJunkDinner}/>
          </div>
          <div className="ci-row">
            <div className="ci-q"><span>Drank 2+ litres of water?</span></div>
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

/* ─── DASHBOARD ─────────────────────────────────────────────────── */
function Dashboard({ entries, profile, setTab }) {
  const today = TODAY();
  const todayEntry = entries.find(e=>e.date===today);
  const recentEntries = entries.slice(-14);

  const pScore = todayEntry ? scorePhysical(todayEntry, recentEntries) : null;
  const mScore = todayEntry ? scoreMental(todayEntry) : null;
  const eScore = todayEntry ? scoreEmotional(todayEntry, recentEntries) : null;
  const dScore = todayEntry ? scoreDrain(todayEntry, recentEntries) : null;
  const dInfo = dScore !== null ? drainLabel(dScore) : null;

  // build last 7 days
  const last7 = Array.from({length:7},(_,i)=>{
    const d = new Date(); d.setDate(d.getDate()-(6-i));
    const key = d.toISOString().split("T")[0];
    const entry = entries.find(e=>e.date===key);
    const ps = entry ? scorePhysical(entry,entries) : null;
    const ms = entry ? scoreMental(entry) : null;
    const es = entry ? scoreEmotional(entry,entries) : null;
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
      if (streak>=3) signals.push({color:"#c8553d", text:`${streak} days without speaking to family. Isolation pattern building.`});
    }
    if (pScore >= 80) signals.push({color:"#3d8c6c", text:`Strong physical day. Body is doing its job.`});
    if (eScore >= 80) signals.push({color:"#3d8c6c", text:`Emotional baseline is solid at ${eScore}%.`});
    if ((todayEntry.upskillHrs||0) >= 2) signals.push({color:"#3d8c6c", text:`Upskilling target hit. Forward motion is real.`});
  }
  if (!signals.length && !todayEntry) signals.push({color:"#7a7268", text:"No check-in yet today. Tap the + tab to log your day."});

  const firstName = (profile?.name||"there").split(" ")[0];
  const initials = getInitials(profile?.name||"S");
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="scroll">
      <div className="hdr fade-up">
        <div>
          <div className="hdr-name">{greeting}, {firstName}</div>
          <div className="hdr-date">
            {now.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}
            {entries.length > 0 && <> · Day {entries.length}</>}
          </div>
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

      {/* CHECK-IN PROMPT */}
      {!todayEntry && (
        <div style={{margin:"10px 16px 0"}} className="fade-up">
          <div style={{background:"var(--accent)",borderRadius:"var(--r)",padding:16,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>setTab("checkin")}>
            <div>
              <div style={{fontSize:14,fontWeight:500,color:"#fff"}}>Check in for today</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:2}}>Under 3 minutes</div>
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
    </div>
  );
}

/* ─── HISTORY ───────────────────────────────────────────────────── */
function History({ entries }) {
  const sorted = [...entries].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30);

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

/* ─── MAIN APP ──────────────────────────────────────────────────── */
export default function HealthIsh() {
  const [onboarded, setOnboarded] = useState(null);
  const [profile, setProfile] = useState(null);
  const [entries, setEntries] = useState([]);
  const [tab, setTab] = useState("home");
  const [editingProfile, setEditingProfile] = useState(false);

  useEffect(()=>{
    (async()=>{
      const ob = await storageGet(KEYS.onboarded);
      const pr = await storageGet(KEYS.profile);
      const en = await storageGet(KEYS.entries);
      setOnboarded(!!ob);
      setProfile(pr||null);
      setEntries(en||[]);
    })();
  },[]);

  const handleOnboard = async (pr) => {
    setProfile(pr);
    setOnboarded(true);
  };

  const handleSaveEntry = async (entry) => {
    const updated = [...entries.filter(e=>e.date!==entry.date), entry]
      .sort((a,b)=>a.date.localeCompare(b.date));
    setEntries(updated);
    await storageSet(KEYS.entries, updated);
  };

  if (onboarded === null) {
    return <div style={{background:"var(--bg)",minHeight:"100vh"}}/>;
  }

  if (!onboarded || editingProfile) {
    return (
      <>
        <style dangerouslySetInnerHTML={{__html:G}}/>
        <Onboarding onDone={pr=>{setProfile(pr);setOnboarded(true);setEditingProfile(false);}}/>
      </>
    );
  }

  const tabs = [
    { id:"home", label:"Home", icon:<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { id:"checkin", label:"Check in", icon:<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> },
    { id:"history", label:"History", icon:<svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
    { id:"profile", label:"Profile", icon:<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{__html:G}}/>
      <div className="app">
        <div className="screen active" style={{display:"flex",flex:1,flexDirection:"column",overflow:"hidden"}}>
          <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
            {tab==="home" && <div className="screen active"><Dashboard entries={entries} profile={profile} setTab={setTab}/></div>}
            {tab==="checkin" && <div className="screen active"><CheckIn entries={entries} onSave={handleSaveEntry} goHome={()=>setTab("home")}/></div>}
            {tab==="history" && <div className="screen active"><History entries={entries}/></div>}
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
      </div>
    </>
  );
}
