/* ============================================================
   audit.js — read someone's existing routine and report what it misses.

   This is the reverse of the planner. The planner writes a week; this
   reads one you already do and paints its blind spots on the body.

   Trackers record what you did. Almost nothing reports what you left
   out, because an omission produces no row anywhere. The findings below
   are all absences.
   ============================================================ */

import { MUSCLES, PATTERN_CHECK, balance, round } from './plan.js';

/* ---------- matching typed text against the 873-name library ---------- */

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/* Common gym shorthand the library does not use. */
const ALIAS = {
  ohp: 'barbell shoulder press', bp: 'barbell bench press - medium grip',
  rdl: 'romanian deadlift', sldl: 'stiff leg barbell deadlift',
  'lat pulldown': 'wide-grip lat pulldown', pulldown: 'wide-grip lat pulldown',
  pullup: 'pullups', 'pull up': 'pullups', 'pull ups': 'pullups',
  chinup: 'chin-up', 'chin up': 'chin-up',
  pushup: 'pushups', 'push up': 'pushups', 'press up': 'pushups',
  situp: 'sit-up', 'sit up': 'sit-up',
  skullcrusher: 'lying triceps press', 'skull crusher': 'lying triceps press',
  hipthrust: 'barbell hip thrust', 'calf raise': 'standing calf raises',
  'lat raise': 'side lateral raise', 'lateral raise': 'side lateral raise',
  'front raise': 'front dumbbell raise', 'seated row': 'seated cable rows',
  fly: 'dumbbell flyes', flye: 'dumbbell flyes', flies: 'dumbbell flyes',
  flyes: 'dumbbell flyes', pushdown: 'triceps pushdown',
  'tricep pushdown': 'triceps pushdown', shrug: 'barbell shrug',
  hyperextension: 'hyperextensions (back extensions)',
  'back extension': 'hyperextensions (back extensions)',
  'leg extension': 'leg extensions', 'leg curl': 'lying leg curls',
  dips: 'dips - chest version', crunch: 'cross-body crunch',
  crunches: 'cross-body crunch', lunge: 'barbell lunge',
  'preacher curl': 'preacher curl', 'hammer curl': 'hammer curls',
  'incline dumbbell press': 'incline dumbbell press',
  /* Single words that name a family. Without these the scorer picks the
     shortest name containing the word, which returns Bench Dips for
     "bench" and Squat Jerk for "squat". */
  bench: 'barbell bench press - medium grip',
  squat: 'barbell squat',
  deadlift: 'barbell deadlift',
  row: 'bent over barbell row',
  curl: 'barbell curl',
  press: 'barbell bench press - medium grip',
};

/* shorthand that appears inside a longer phrase */
const WORD_ALIAS = { db: 'dumbbell', bb: 'barbell', ez: 'e-z', tri: 'triceps', bi: 'biceps' };

function expand(q) {
  let s = norm(q);
  /* alias values are written the way a person says them, so they carry
     hyphens the library names lose in normalisation. Normalise them too. */
  if (ALIAS[s]) return norm(ALIAS[s]);
  s = s.split(' ').map(w => WORD_ALIAS[w] || w).join(' ');
  return ALIAS[s] ? norm(ALIAS[s]) : s;
}

/* Score a library entry against a typed query. Exact beats prefix beats
   "contains every word", and shorter names win ties because the library
   is full of obscure variants of the movement people actually mean. */
export function matchExercise(all, query) {
  const q = expand(query);
  if (!q) return null;
  const qt = q.split(' ');
  let best = null, bestScore = 0;

  for (const e of all) {
    const n = norm(e.name);
    let score = 0;
    if (n === q) score = 1000;
    else if (n.startsWith(q)) score = 700;
    else if (n.includes(q)) score = 550;
    else {
      const nt = new Set(n.split(' '));
      const hit = qt.filter(t => nt.has(t)).length;
      if (hit === qt.length) score = 400;
      else if (hit >= Math.ceil(qt.length * 0.7)) score = 200 + hit * 10;
      else continue;
    }
    score -= Math.max(0, n.split(' ').length - qt.length) * 6;   /* prefer the plain movement */
    if (e.mechanic === 'compound') score += 4;
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return bestScore >= 150 ? best : null;
}

/* ---------- rung 1: pick a shape ---------- */

export const SPLITS = [
  { id: 'ppl', name: 'Push / Pull / Legs', sub: '3 days', days: [
    { name: 'Push', ex: ['bench press', 'barbell shoulder press', 'incline dumbbell press', 'lateral raise', 'triceps pushdown'] },
    { name: 'Pull', ex: ['pullups', 'bent over barbell row', 'face pull', 'barbell curl', 'hammer curl'] },
    { name: 'Legs', ex: ['barbell squat', 'romanian deadlift', 'leg press', 'leg curl', 'calf raise'] },
  ]},
  { id: 'ul', name: 'Upper / Lower', sub: '4 days', days: [
    { name: 'Upper A', ex: ['bench press', 'bent over barbell row', 'barbell shoulder press', 'lat pulldown', 'barbell curl', 'triceps pushdown'] },
    { name: 'Lower A', ex: ['barbell squat', 'romanian deadlift', 'leg press', 'calf raise', 'plank'] },
    { name: 'Upper B', ex: ['incline dumbbell press', 'pullups', 'dumbbell shoulder press', 'face pull', 'hammer curl', 'skull crusher'] },
    { name: 'Lower B', ex: ['barbell deadlift', 'leg extension', 'leg curl', 'lunge', 'crunch'] },
  ]},
  { id: 'fb', name: 'Full body', sub: '3 days', days: [
    { name: 'Day A', ex: ['barbell squat', 'bench press', 'bent over barbell row', 'plank'] },
    { name: 'Day B', ex: ['romanian deadlift', 'barbell shoulder press', 'lat pulldown', 'crunch'] },
    { name: 'Day C', ex: ['leg press', 'incline dumbbell press', 'pullups', 'barbell curl'] },
  ]},
  { id: 'bro', name: 'One muscle a day', sub: '5 days, the classic bro split', days: [
    { name: 'Chest', ex: ['bench press', 'incline dumbbell press', 'dumbbell flyes', 'dips', 'pushups'] },
    { name: 'Back', ex: ['pullups', 'bent over barbell row', 'lat pulldown', 'one-arm dumbbell row', 'shrug'] },
    { name: 'Shoulders', ex: ['barbell shoulder press', 'lateral raise', 'front raise', 'face pull', 'shrug'] },
    { name: 'Arms', ex: ['barbell curl', 'hammer curl', 'preacher curl', 'triceps pushdown', 'skull crusher'] },
    { name: 'Legs', ex: ['barbell squat', 'leg press', 'leg extension', 'leg curl', 'calf raise'] },
  ]},
  { id: 'mirror', name: 'Chest and arms mostly', sub: '4 days, what most gyms actually look like', days: [
    { name: 'Chest', ex: ['bench press', 'incline dumbbell press', 'dumbbell flyes', 'dips'] },
    { name: 'Arms', ex: ['barbell curl', 'hammer curl', 'triceps pushdown', 'skull crusher'] },
    { name: 'Shoulders and chest', ex: ['barbell shoulder press', 'lateral raise', 'incline dumbbell press'] },
    { name: 'Back', ex: ['lat pulldown', 'seated row'] },
  ]},
  { id: 'home', name: 'Bodyweight at home', sub: '3 days, no equipment', days: [
    { name: 'Day A', ex: ['pushups', 'bodyweight squat', 'plank'] },
    { name: 'Day B', ex: ['pullups', 'lunge', 'crunch'] },
    { name: 'Day C', ex: ['dips', 'bodyweight squat', 'plank'] },
  ]},
];

/* ---------- turning a described routine into something tallyable ---------- */

const DEFAULT_SETS = 3;

export function buildAuditPlan(all, days) {
  const sessions = days.map(d => ({
    name: d.name,
    items: (d.items || []).map(it => {
      const ex = it.exercise || matchExercise(all, it.q);
      if (!ex) return null;
      return {
        exercise: ex,
        muscle: ex.primaryMuscles[0] || 'abdominals',
        sets: it.sets || DEFAULT_SETS,
        reps: '—', restSec: 90, rir: '', warmups: 0, priority: false,
      };
    }).filter(Boolean),
  })).filter(s => s.items.length);

  return {
    sessions,
    split: `${sessions.length} sessions a week`,
    target: 15,
    minutes: 60,
    duration: sessions.map(() => 0),
    schedule: sessions.map((_, i) => ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i] || ''),
    ctx: { usable: all, prio: new Set(), hasEquip: false, opts: {}, vol: null, rx: null },
  };
}

/* ---------- the findings ---------- */

const NEEDS_DIRECT = ['lower back', 'hamstrings', 'glutes', 'calves', 'abdominals', 'middle back', 'lats'];

export function auditFindings(plan) {
  const { volume, actualFreq, patterns } = plan;
  const out = [];
  const total = plan.sessions.reduce((s, d) => s + d.items.reduce((n, i) => n + i.sets, 0), 0);

  /* an omission produces no row anywhere else, which is why it survives */
  const never = MUSCLES.filter(m => !volume[m] && m !== 'neck');
  if (never.length) out.push({
    kind: 'gap', title: 'Never trained',
    body: `${never.join(', ')} get no work at all in this week.`,
  });

  const thin = MUSCLES.filter(m => volume[m] > 0 && volume[m] < 4 && m !== 'neck');
  if (thin.length) out.push({
    kind: 'low', title: 'Below maintenance',
    body: `${thin.map(m => `${m} (${round(volume[m])})`).join(', ')}. Around 4 to 6 sets a week holds a muscle where it is.`,
  });

  const once = MUSCLES.filter(m => volume[m] >= 6 && (actualFreq[m] || 0) < 2);
  if (once.length) out.push({
    kind: 'freq', title: 'Trained once a week',
    body: `${once.join(', ')} carry real volume but get one session. Splitting the same sets over two days generally does more.`,
  });

  const missing = patterns.filter(p => !p.present).map(p => p.label);
  if (missing.length) out.push({
    kind: 'pattern', title: 'Movement patterns missing',
    body: `No ${missing.join(', ')} anywhere in the week.`,
  });

  const bal = balance(volume);
  if (bal.push > bal.pull * 1.4) out.push({
    kind: 'balance', title: 'Pushing outweighs pulling',
    body: `${bal.push} push sets against ${bal.pull} pull. Rough parity is the usual advice, and shoulders tend to complain first.`,
  });
  if (bal.anterior > bal.posterior * 1.4) out.push({
    kind: 'balance', title: 'Front outweighs back',
    body: `${bal.anterior} sets on quads, chest and abs against ${bal.posterior} on hamstrings, glutes and lower back.`,
  });

  const direct = NEEDS_DIRECT.filter(m => volume[m] > 0 && volume[m] < 6
    && !plan.sessions.some(s => s.items.some(i => i.muscle === m)));
  if (direct.length) out.push({
    kind: 'indirect', title: 'Only worked indirectly',
    body: `${direct.join(', ')} pick up sets as assistance but never get an exercise of their own.`,
  });

  if (!out.length) out.push({
    kind: 'ok', title: 'Nothing obvious missing',
    body: `Every muscle group gets work, all movement patterns appear, and push and pull are close to balanced across ${total} sets.`,
  });

  return { findings: out, total, balance: bal };
}
