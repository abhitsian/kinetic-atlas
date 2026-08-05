/* ============================================================
   plan.js — weekly programming over the exercise library.

   free-exercise-db carries no sets, reps, rest, load, tempo or
   progression fields. Everything numeric here is standard training
   guidance applied on top of the data, not read out of it.

   Guidance encoded:
   - 10–20 hard sets per muscle per week drives hypertrophy; ~4–6 maintains.
   - Volume is SPREAD across the sessions that own a muscle, because
     splitting a weekly total over 2+ exposures beats one hammering.
   - Compounds go first while fresh; small muscles are isolation-trained.
   - Load is prescribed as reps-in-reserve, which needs no 1RM.
   - Progression is double progression: work the rep range up, then add
     load and reset. Week 4 deloads.
   ============================================================ */

export const MUSCLES = [
  'abdominals','abductors','adductors','biceps','calves','chest','forearms','glutes',
  'hamstrings','lats','lower back','middle back','neck','quadriceps','shoulders','traps','triceps'
];

const PUSH = ['chest', 'shoulders', 'triceps'];
const PULL = ['lats', 'middle back', 'traps', 'biceps', 'forearms'];
const LEGS = ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'];
const CORE = ['abdominals', 'lower back'];

const SMALL = new Set(['biceps', 'triceps', 'forearms', 'calves', 'neck', 'abductors', 'adductors', 'traps']);
const CORE_SET = new Set(CORE);

/* every split now names the smaller muscles too, so nothing silently
   drops out of the week the way abductors and lower back used to */
const SPLITS = {
  2: { name: 'Full body ×2', days: [
    { name: 'Full body A', muscles: ['quadriceps', 'chest', 'lats', 'shoulders', 'abdominals', 'calves'] },
    { name: 'Full body B', muscles: ['hamstrings', 'glutes', 'middle back', 'chest', 'triceps', 'biceps', 'lower back'] },
  ]},
  3: { name: 'Full body ×3', days: [
    { name: 'Full body A', muscles: ['quadriceps', 'chest', 'lats', 'shoulders', 'abdominals', 'calves'] },
    { name: 'Full body B', muscles: ['hamstrings', 'glutes', 'middle back', 'chest', 'triceps', 'lower back'] },
    { name: 'Full body C', muscles: ['quadriceps', 'lats', 'shoulders', 'biceps', 'abdominals', 'adductors'] },
  ]},
  4: { name: 'Upper / Lower ×2', days: [
    { name: 'Upper A', muscles: ['chest', 'lats', 'shoulders', 'triceps', 'biceps', 'forearms'] },
    { name: 'Lower A', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'abdominals'] },
    { name: 'Upper B', muscles: ['lats', 'middle back', 'shoulders', 'chest', 'biceps', 'triceps', 'traps'] },
    { name: 'Lower B', muscles: ['hamstrings', 'glutes', 'quadriceps', 'lower back', 'calves', 'abductors'] },
  ]},
  5: { name: 'Push / Pull / Legs + Upper / Lower', days: [
    { name: 'Push', muscles: PUSH },
    { name: 'Pull', muscles: PULL },
    { name: 'Legs', muscles: [...LEGS, 'abdominals'] },
    { name: 'Upper', muscles: ['chest', 'lats', 'shoulders', 'biceps', 'triceps'] },
    { name: 'Lower', muscles: ['quadriceps', 'hamstrings', 'glutes', 'lower back', 'calves'] },
  ]},
  6: { name: 'Push / Pull / Legs ×2', days: [
    { name: 'Push A', muscles: PUSH },
    { name: 'Pull A', muscles: [...PULL, 'lower back'] },
    { name: 'Legs A', muscles: [...LEGS, 'abdominals'] },
    { name: 'Push B', muscles: [...PUSH, 'abdominals'] },
    { name: 'Pull B', muscles: PULL },
    { name: 'Legs B', muscles: LEGS },
  ]},
};

const VOLUME = {
  beginner:     { target: 10, maintain: 6, setsCompound: 3, setsIsolation: 2 },
  intermediate: { target: 15, maintain: 8, setsCompound: 4, setsIsolation: 3 },
  advanced:     { target: 19, maintain: 9, setsCompound: 4, setsIsolation: 3 },
};

/* rest in seconds so session length can actually be computed */
const GOALS = {
  strength:    { compound: '4–6',   isolation: '6–8',   restC: 180, restI: 120, rir: '2–3 RIR' },
  hypertrophy: { compound: '6–10',  isolation: '10–15', restC: 150, restI: 75,  rir: '1–2 RIR' },
  endurance:   { compound: '12–15', isolation: '15–20', restC: 75,  restI: 45,  rir: '3 RIR' },
};

export const LEVEL_RANK = { beginner: 0, intermediate: 1, expert: 2 };

/* Movements a coach reaches for first. The library rewards novelty
   otherwise, and "Around The Worlds" beats the bench press. */
const STAPLE = /\b(bench press|squat|deadlift|romanian|overhead press|military press|shoulder press|pull-?up|chin-?up|lat pulldown|barbell row|dumbbell row|t-bar row|seated row|hip thrust|glute bridge|lunge|leg press|leg curl|leg extension|calf raise|dip|push-?up|curl|triceps extension|face pull|shrug|plank|hyperextension|good morning|split squat|step-?up|pullover|fly|raise|crunch|row)\b/i;

/* Widely discouraged or awkward as a default prescription. Deprioritised,
   not banned: they stay available in the swap list. */
const DISCOURAGED = /\b(behind the neck|upright row|jerk|snatch|clean and press|muscle snatch|around the world|spell caster|guillotine|gorilla|head harness|neck resistance)/i;

/* Neck is trained deliberately or not at all; it should never be
   auto-filled into a push day to tick a coverage box. */
const OPT_IN_ONLY = new Set(['neck']);

/* The movement a coach reaches for FIRST for each muscle. Without this the
   scorer cannot tell that a pullover is not a chest press, and novelty
   variants outrank the bench. */
const CANON = {
  chest:         /bench press|push-?up|chest press|\bdip\b|chest fly|dumbbell fly/i,
  lats:          /pull-?up|chin-?up|pulldown|barbell row|dumbbell row|t-bar row|seated row/i,
  'middle back': /\brow\b|face pull|rear delt|shrug/i,
  traps:         /shrug|farmer|upright/i,
  shoulders:     /overhead press|shoulder press|military|lateral raise|front raise|arnold/i,
  triceps:       /triceps extension|pushdown|close-?grip bench|skull|\bdip\b|kickback/i,
  biceps:        /\bcurl\b/i,
  forearms:      /wrist curl|farmer|grip|reverse curl/i,
  quadriceps:    /\bsquat\b|leg press|lunge|step-?up|leg extension/i,
  hamstrings:    /romanian|leg curl|deadlift|good morning|glute-?ham/i,
  glutes:        /hip thrust|glute bridge|\bsquat\b|lunge|kickback|hip extension/i,
  calves:        /calf raise|calf press/i,
  abdominals:    /crunch|plank|leg raise|rollout|sit-?up|hanging|dead ?bug/i,
  'lower back':  /hyperextension|back extension|good morning|superman/i,
  adductors:     /adduction|adductor|sumo|copenhagen/i,
  abductors:     /abduction|abductor|band walk|clamshell|side-?lying/i,
  neck:          /neck/i,
};

/* when time runs out, drop the least consequential muscles first */
const IMPORTANCE = ['quadriceps','chest','lats','hamstrings','shoulders','glutes','middle back',
  'triceps','biceps','abdominals','lower back','calves','traps','forearms','adductors','abductors','neck'];
const rank = (m) => { const i = IMPORTANCE.indexOf(m); return i < 0 ? 99 : i; };

/* Conservative exclusions when a joint is flagged. Not medical advice:
   these remove the movements most commonly aggravating, and the app
   says so. */
/* No trailing \b: exercise names pluralise ("Seated Good Mornings"), and a
   closing boundary silently failed to match those. */
export const INJURY_FILTERS = {
  knee:         /\b(jump|bound|plyo|box squat|sissy|hack squat|pistol|deep squat|leg extension|sprint|burpee)/i,
  shoulder:     /\b(behind the neck|upright row|dip|overhead|snatch|jerk|press behind)/i,
  'lower back': /\b(deadlift|good morning|bent over|hyperextension|sit-?up|russian twist|clean|snatch|toe touch|superman)/i,
};

const SLOTS = { 30: 4, 45: 5, 60: 6, 75: 7, 90: 8 };

/* strip qualifiers so wide-grip / close-grip / bent-arm variants of the
   same movement are not offered as "variety" */
const QUALIFIER = /\b(wide|close|narrow|medium|reverse|neutral|supinated|pronated|grip|incline|decline|flat|seated|standing|lying|kneeling|bent-?arm|straight-?arm|one|single|alternate|alternating|arm|leg|side|front|rear|high|low|cable|machine|barbell|dumbbell|smith|band|kettlebell|ez-?bar|e-z|with|the|to|on|of|and|a)\b/gi;
function stem(name) {
  return name.toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(QUALIFIER, ' ')
    .split(/\s+/).filter(Boolean).sort().join(' ');
}

function scoreExercise(e, muscle, opts) {
  let s = 0;
  const wantCompound = !SMALL.has(muscle);
  if (e.mechanic === 'compound') s += wantCompound ? 30 : 8;
  if (e.mechanic === 'isolation') s += wantCompound ? 10 : 22;
  if (CANON[muscle] && CANON[muscle].test(e.name)) s += 45;
  if (STAPLE.test(e.name)) s += 20;
  if (DISCOURAGED.test(e.name)) s -= 55;
  if (e.level === opts.level) s += 10;
  if (e.level === 'beginner' && opts.level === 'intermediate') s += 5;
  if (opts.level === 'beginner' && e.level === 'expert') s -= 25;
  if (['barbell', 'dumbbell', 'cable', 'machine'].includes(e.equipment)) s += 6;
  /* long names are usually obscure variants; prefer the plain movement */
  s -= Math.max(0, e.name.split(/\s+/).length - 3) * 3;
  return s;
}

const warmupsFor = (e) =>
  e.mechanic === 'compound' && ['barbell', 'dumbbell', 'machine', 'cable', 'e-z curl bar'].includes(e.equipment) ? 2
  : e.mechanic === 'compound' ? 1 : 1;

/* ~45 s under load per working set, ~30 s for a light ramp set */
export function sessionSeconds(items) {
  return items.reduce((t, it) =>
    t + it.warmups * (30 + 60) + it.sets * (45 + it.restSec), 0);
}
export const fmtMins = (secs) => `${Math.round(secs / 60)} min`;
export const fmtRest = (secs) => secs >= 60 ? `${secs / 60} min` : `${secs} s`;

export function buildPlan(all, opts) {
  const {
    days = 4, equipment = [], priority = [], level = 'intermediate',
    goal = 'hypertrophy', minutes = 60, variety = 0, difficulty = 'any',
    injuries = [], includeMobility = false,
  } = opts;

  const split = SPLITS[Math.min(6, Math.max(2, days))];
  const vol = VOLUME[level] || VOLUME.intermediate;
  const rx = GOALS[goal] || GOALS.hypertrophy;
  const slots = SLOTS[minutes] || 6;
  const eqSet = new Set(equipment);
  const prio = new Set(priority);
  const injuryRes = injuries.map(k => INJURY_FILTERS[k]).filter(Boolean);

  const usable = all.filter(e => {
    if (e.category === 'stretching' || e.category === 'cardio') return false;
    if (difficulty !== 'any' && (LEVEL_RANK[e.level] ?? 1) > LEVEL_RANK[difficulty]) return false;
    if (injuryRes.some(re => re.test(e.name))) return false;
    if (!eqSet.size) return true;
    const eq = e.equipment && e.equipment !== 'None' ? e.equipment : 'body only';
    return eqSet.has(eq);
  });

  /* how many sessions own each muscle -> spread its weekly volume over them */
  const freq = {};
  for (const d of split.days) for (const m of d.muscles) freq[m] = (freq[m] || 0) + 1;

  const volume = {};
  for (const m of MUSCLES) volume[m] = 0;
  const usedIds = new Set();
  const usedStems = new Set();
  const sessions = [];

  const pickFor = (muscle) => {
    const pool = usable
      .filter(e => e.primaryMuscles.includes(muscle))
      .sort((a, b) => scoreExercise(b, muscle, opts) - scoreExercise(a, muscle, opts));
    const fresh = pool.filter(e => !usedIds.has(e.id) && !usedStems.has(stem(e.name)));
    const avail = fresh.length ? fresh : pool.filter(e => !usedIds.has(e.id));
    if (!avail.length) return pool[0] || null;
    return avail[(variety + MUSCLES.indexOf(muscle)) % Math.min(avail.length, 5)];
  };

  /* priority muscles earn the full set count; everything else gets a
     maintenance dose, which is both better programming and buys the time
     that calves, traps and forearms were being squeezed out of */
  const setsFor = (ex, muscle) => {
    const base = ex.mechanic === 'compound' ? vol.setsCompound : vol.setsIsolation;
    return prio.has(muscle) ? base : Math.max(2, base - 1);
  };

  const addItem = (items, muscle, ex) => {
    const isCompound = ex.mechanic === 'compound';
    const item = {
      exercise: ex, muscle,
      sets: setsFor(ex, muscle),
      reps: isCompound ? rx.compound : rx.isolation,
      restSec: isCompound ? rx.restC : rx.restI,
      rir: rx.rir,
      warmups: warmupsFor(ex),
      priority: prio.has(muscle),
    };
    items.push(item);
    usedIds.add(ex.id);
    usedStems.add(stem(ex.name));
    volume[muscle] += item.sets;
    for (const s of ex.secondaryMuscles) {
      if (s !== muscle && s in volume) volume[s] += item.sets * 0.5;
    }
    return item;
  };

  /* Session length now governs the session: keep adding while the estimated
     time (warm-ups, work and rest) still fits, instead of counting slots. */
  const budget = minutes * 60;
  const fits = (items, ex, muscle) => {
    const isC = ex.mechanic === 'compound';
    const probe = {
      sets: prio.has(muscle)
        ? (isC ? vol.setsCompound : vol.setsIsolation)
        : Math.max(2, (isC ? vol.setsCompound : vol.setsIsolation) - 1),
      restSec: isC ? rx.restC : rx.restI,
      warmups: warmupsFor(ex),
    };
    return sessionSeconds([...items, probe]) <= budget * 1.05 && items.length < slots + 2;
  };

  for (const day of split.days) {
    const ordered = [...day.muscles].sort((a, b) =>
      ((prio.has(b) ? 1 : 0) - (prio.has(a) ? 1 : 0)) || (rank(a) - rank(b)));
    const items = [];
    /* several passes: one exercise rarely covers a muscle's share, and a
       single pass left 30-minute sessions inside a 60-minute budget */
    for (let round = 0; round < 3; round++) {
      let added = false;
      for (const muscle of ordered) {
        const weekly = prio.has(muscle) ? vol.target : vol.maintain;
        const share = weekly / (freq[muscle] || 1);
        const already = items.filter(i => i.muscle === muscle).reduce((n, i) => n + i.sets, 0);
        if (already >= share) continue;
        const ex = pickFor(muscle);
        if (ex && fits(items, ex, muscle)) { addItem(items, muscle, ex); added = true; }
      }
      if (!added) break;
    }
    sessions.push({ name: day.name, items });
  }

  /* fill pass: spend leftover time on anything still at zero */
  const uncovered = () => MUSCLES.filter(m =>
    volume[m] === 0
    && (!OPT_IN_ONLY.has(m) || prio.has(m))
    && usable.some(e => e.primaryMuscles.includes(m)));
  for (const s of sessions) {
    for (const m of uncovered().sort((a, b) => rank(a) - rank(b))) {
      const ex = pickFor(m);
      if (ex && fits(s.items, ex, m)) addItem(s.items, m, ex);
    }
  }

  /* Trunk work is cheap and gets squeezed out by big lifts, so guarantee
     one per session that owns it rather than letting time drop it. */
  for (let i = 0; i < sessions.length; i++) {
    const day = split.days[i], s = sessions[i];
    const wantsCore = day.muscles.some(m => CORE_SET.has(m));
    if (!wantsCore || s.items.some(it => CORE_SET.has(it.muscle))) continue;
    const m = day.muscles.find(x => CORE_SET.has(x));
    const ex = pickFor(m);
    if (ex) addItem(s.items, m, ex);
  }

  for (const s of sessions) orderSession(s.items);

  if (includeMobility) {
    const stretches = all.filter(e => e.category === 'stretching');
    for (const s of sessions) {
      const target = s.items[0]?.muscle;
      const pick = stretches.find(e => e.primaryMuscles.includes(target)) || stretches[0];
      if (pick) s.finisher = { exercise: pick, sets: 2, reps: '30 s hold', restSec: 30, warmups: 0 };
    }
  }

  const base = {
    split: split.name, sessions, volume, target: vol.target, goal, level, variety,
    freq, slots, minutes,
    ctx: { usable, prio, opts, hasEquip: eqSet.size > 0, vol, rx, all },
  };
  base.schedule = scheduleFor(sessions.length);
  retally(base);
  return base;
}

/* Fatigue order: compounds first, never the same muscle twice in a row,
   trunk work last so bracing is intact for the loaded lifts. */
function orderSession(items) {
  items.sort((a, b) => {
    const ca = CORE_SET.has(a.muscle) ? 1 : 0, cb = CORE_SET.has(b.muscle) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    const ma = a.exercise.mechanic === 'compound' ? 0 : 1;
    const mb = b.exercise.mechanic === 'compound' ? 0 : 1;
    return ma - mb;
  });
  for (let i = 1; i < items.length; i++) {
    if (items[i].muscle === items[i - 1].muscle) {
      const j = items.findIndex((it, k) => k > i && it.muscle !== items[i - 1].muscle);
      if (j > -1) [items[i], items[j]] = [items[j], items[i]];
    }
  }
  return items;
}

/* spread training days so rest lands between them */
function scheduleFor(n) {
  const D = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const layouts = {
    2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4],
    5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5],
  };
  return (layouts[n] || [0, 1, 2, 3, 4, 5]).map(i => D[i]);
}

/* ---------- weekly progression: double progression, week 4 deloads ---------- */
export const BLOCK = [
  { week: 1, label: 'Week 1 · introduce', setDelta: 0, rirNote: 'Leave 2–3 reps in reserve. Establish loads you can repeat.' },
  { week: 2, label: 'Week 2 · build',     setDelta: 0, rirNote: 'Same loads, aim for the top of each rep range.' },
  { week: 3, label: 'Week 3 · push',      setDelta: 1, rirNote: 'Add a set to priority work. 1 rep in reserve.' },
  { week: 4, label: 'Week 4 · deload',    setDelta: -1, deload: true, rirNote: 'Half the sets, same loads. Recover so week 5 can climb.' },
];

export function applyWeek(plan, weekIndex) {
  const spec = BLOCK[weekIndex] || BLOCK[0];
  const sessions = plan.sessions.map(s => ({
    ...s,
    items: s.items.map(it => {
      let sets = it.sets;
      if (spec.deload) sets = Math.max(1, Math.round(it.sets / 2));
      else if (spec.setDelta && it.priority) sets = it.sets + spec.setDelta;
      return { ...it, sets, warmups: spec.deload ? Math.max(0, it.warmups - 1) : it.warmups };
    }),
  }));
  return { ...plan, sessions, weekSpec: spec };
}

/* ---------- swapping ---------- */
export function alternativesFor(plan, muscle, current, { relative = 'all', limit = 12 } = {}) {
  const { usable, opts } = plan.ctx;
  const taken = new Set();
  for (const s of plan.sessions) for (const i of s.items) taken.add(i.exercise.id);
  taken.delete(current.id);
  const cur = LEVEL_RANK[current.level] ?? 1;

  return usable
    .filter(e => {
      if (!e.primaryMuscles.includes(muscle)) return false;
      if (taken.has(e.id) || e.id === current.id) return false;
      const r = LEVEL_RANK[e.level] ?? 1;
      if (relative === 'easier') return r < cur;
      if (relative === 'harder') return r > cur;
      if (relative === 'same') return r === cur;
      return true;
    })
    .sort((a, b) => {
      const ra = LEVEL_RANK[a.level] ?? 1, rb = LEVEL_RANK[b.level] ?? 1;
      if (relative === 'easier' && ra !== rb) return ra - rb;
      if (relative === 'harder' && ra !== rb) return rb - ra;
      return scoreExercise(b, muscle, opts) - scoreExercise(a, muscle, opts);
    })
    .slice(0, limit);
}

export function relativeTo(candidate, current) {
  const a = LEVEL_RANK[candidate.level] ?? 1, b = LEVEL_RANK[current.level] ?? 1;
  return a < b ? 'easier' : a > b ? 'harder' : 'same';
}

export function swapExercise(plan, dayIndex, itemIndex, exercise) {
  const item = plan.sessions[dayIndex].items[itemIndex];
  const { vol, rx } = plan.ctx;
  const isCompound = exercise.mechanic === 'compound';
  item.exercise = exercise;
  item.sets = isCompound ? vol.setsCompound : vol.setsIsolation;
  item.reps = isCompound ? rx.compound : rx.isolation;
  item.restSec = isCompound ? rx.restC : rx.restI;
  item.warmups = warmupsFor(exercise);
  retally(plan);
  return plan;
}

/* ---------- tally, coverage, warnings ---------- */
export const PATTERN_CHECK = [
  ['squat',           /\bsquat|leg press|hack|step-?up\b/i],
  ['hinge',           /deadlift|hip thrust|glute bridge|good morning|romanian|swing|hyperextension|leg curl/i],
  ['horizontal push', /bench press|push-?up|chest press|fly|flye|dip/i],
  ['vertical push',   /overhead|shoulder press|military|handstand|lateral raise/i],
  ['horizontal pull', /row|face pull|rear delt/i],
  ['vertical pull',   /pull-?up|chin-?up|pulldown|pullover/i],
  ['trunk',           /plank|crunch|sit-?up|rollout|leg raise|twist|hold|carry/i],
];

export function retally(plan) {
  const volume = {};
  for (const m of MUSCLES) volume[m] = 0;
  const freqSeen = {};
  for (const s of plan.sessions) {
    const seen = new Set();
    for (const it of s.items) {
      volume[it.muscle] += it.sets;
      seen.add(it.muscle);
      for (const sec of it.exercise.secondaryMuscles) {
        if (sec !== it.muscle && sec in volume) volume[sec] += it.sets * 0.5;
      }
    }
    for (const m of seen) freqSeen[m] = (freqSeen[m] || 0) + 1;
  }
  plan.volume = volume;
  plan.actualFreq = freqSeen;
  plan.duration = plan.sessions.map(s => sessionSeconds(s.items));
  plan.patterns = patternCoverage(plan);
  plan.warnings = warningsFor(plan);
  return plan;
}

function patternCoverage(plan) {
  const names = plan.sessions.flatMap(s => s.items.map(i => i.exercise.name));
  return PATTERN_CHECK.map(([label, re]) => ({ label, present: names.some(n => re.test(n)) }));
}

function warningsFor(plan) {
  const { volume, target, ctx, actualFreq, duration, minutes } = plan;
  const { prio, usable, hasEquip } = ctx;
  const w = [];

  /* a muscle at zero used to produce no warning at all */
  const zero = MUSCLES.filter(m => !volume[m] && m !== 'neck' && usable.some(e => e.primaryMuscles.includes(m)));
  if (zero.length) w.push({ kind: 'gap', text: `Not trained at all this week: ${zero.join(', ')}.` });

  for (const m of prio) {
    if (volume[m] < target * 0.7) {
      w.push({ kind: 'short', text: `${m}: ${round(volume[m])} sets against a ${target}-set target. ${
        hasEquip ? 'The equipment selected limits what can be programmed.' : 'Add a day or lengthen sessions.'}` });
    }
    if ((actualFreq[m] || 0) < 2) {
      w.push({ kind: 'freq', text: `${m} is trained once a week. Two or more exposures beat one at the same volume.` });
    }
  }
  for (const m of MUSCLES) {
    if (!prio.has(m) && volume[m] > 0 && volume[m] < 4) {
      w.push({ kind: 'low', text: `${m}: ${round(volume[m])} sets, below the ~4 needed to maintain.` });
    }
  }
  const missing = plan.patterns.filter(p => !p.present).map(p => p.label);
  if (missing.length) w.push({ kind: 'pattern', text: `No ${missing.join(', ')} movement in the week.` });

  duration.forEach((secs, i) => {
    if (secs > minutes * 60 * 1.15) {
      w.push({ kind: 'time', text: `${plan.sessions[i].name} needs about ${fmtMins(secs)} including warm-ups and rest, over your ${minutes}-minute target.` });
    }
  });
  return w;
}

export const round = (n) => Math.round(n * 10) / 10;

export function balance(volume) {
  const push = PUSH.reduce((s, m) => s + (volume[m] || 0), 0);
  const pull = PULL.reduce((s, m) => s + (volume[m] || 0), 0);
  const post = ['hamstrings', 'glutes', 'lower back'].reduce((s, m) => s + (volume[m] || 0), 0);
  const ant = ['quadriceps', 'chest', 'abdominals'].reduce((s, m) => s + (volume[m] || 0), 0);
  return { push: round(push), pull: round(pull), posterior: round(post), anterior: round(ant) };
}
