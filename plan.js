/* ============================================================
   plan.js — weekly programming over the exercise library.

   IMPORTANT: free-exercise-db carries no sets, reps, rest, tempo or
   progression fields. Everything numeric below is standard training
   guidance applied on top of the data, not read out of it. The app
   labels it as such rather than implying the dataset prescribes it.

   Guidance encoded here:
   - 10–20 hard sets per muscle per week drives hypertrophy; roughly
     4–6 sets maintains. Beginners sit at the low end.
   - Splitting a muscle's volume over 2+ sessions beats one weekly
     hammering at matched volume, so splits repeat muscles across days.
   - Compounds go first while you are fresh; small muscles (arms,
     calves, neck) are legitimately isolation-trained.
   - Assisting work is real but partial: secondary involvement counts
     as half a set toward weekly volume.
   ============================================================ */

export const MUSCLES = [
  'abdominals','abductors','adductors','biceps','calves','chest','forearms','glutes',
  'hamstrings','lats','lower back','middle back','neck','quadriceps','shoulders','traps','triceps'
];

const PUSH = ['chest', 'shoulders', 'triceps'];
const PULL = ['lats', 'middle back', 'traps', 'biceps', 'forearms'];
const LEGS = ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'];
const CORE = ['abdominals', 'lower back'];
const UPPER = [...PUSH, ...PULL];
const LOWER = [...LEGS, ...CORE];

/* muscles small enough that isolation is the honest default */
const SMALL = new Set(['biceps', 'triceps', 'forearms', 'calves', 'neck', 'abductors', 'adductors', 'traps']);

/* days per week -> named sessions and the muscles each one owns */
const SPLITS = {
  2: { name: 'Full body ×2', days: [
    { name: 'Full body A', muscles: ['quadriceps', 'chest', 'lats', 'shoulders', 'abdominals'] },
    { name: 'Full body B', muscles: ['hamstrings', 'glutes', 'middle back', 'chest', 'triceps', 'biceps'] },
  ]},
  3: { name: 'Full body ×3', days: [
    { name: 'Full body A', muscles: ['quadriceps', 'chest', 'lats', 'shoulders', 'abdominals'] },
    { name: 'Full body B', muscles: ['hamstrings', 'glutes', 'middle back', 'triceps', 'calves'] },
    { name: 'Full body C', muscles: ['quadriceps', 'chest', 'lats', 'biceps', 'lower back'] },
  ]},
  4: { name: 'Upper / Lower ×2', days: [
    { name: 'Upper A', muscles: ['chest', 'lats', 'shoulders', 'triceps', 'biceps'] },
    { name: 'Lower A', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'abdominals'] },
    { name: 'Upper B', muscles: ['middle back', 'shoulders', 'chest', 'biceps', 'triceps', 'traps'] },
    { name: 'Lower B', muscles: ['hamstrings', 'glutes', 'quadriceps', 'lower back', 'calves'] },
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
    { name: 'Pull A', muscles: PULL },
    { name: 'Legs A', muscles: [...LEGS, 'abdominals'] },
    { name: 'Push B', muscles: [...PUSH, 'abdominals'] },
    { name: 'Pull B', muscles: [...PULL, 'lower back'] },
    { name: 'Legs B', muscles: LEGS },
  ]},
};

/* weekly set targets: [priority muscle, everything else] */
const VOLUME = {
  beginner:     { target: 10, maintain: 5,  setsCompound: 3, setsIsolation: 2 },
  intermediate: { target: 15, maintain: 8,  setsCompound: 4, setsIsolation: 3 },
  advanced:     { target: 19, maintain: 10, setsCompound: 4, setsIsolation: 3 },
};

const GOALS = {
  strength:    { compound: '4–6',  isolation: '6–8',   restC: '3 min',    restI: '2 min' },
  hypertrophy: { compound: '6–10', isolation: '10–15', restC: '2–3 min',  restI: '60–90 s' },
  endurance:   { compound: '12–15', isolation: '15–20', restC: '60–90 s', restI: '45 s' },
};

/* roughly how many working exercises fit a session */
const SLOTS = { 30: 4, 45: 5, 60: 6, 75: 7, 90: 8 };

function scoreExercise(e, muscle, opts) {
  let s = 0;
  const wantCompound = !SMALL.has(muscle);
  if (e.mechanic === 'compound') s += wantCompound ? 30 : 8;
  if (e.mechanic === 'isolation') s += wantCompound ? 10 : 22;
  if (e.level === opts.level) s += 10;
  if (e.level === 'beginner' && opts.level === 'intermediate') s += 5;
  if (opts.level === 'beginner' && e.level === 'expert') s -= 25;
  /* prefer loadable equipment for progression, but never require it */
  if (['barbell', 'dumbbell', 'cable', 'machine'].includes(e.equipment)) s += 6;
  if (e.category === 'stretching' || e.category === 'cardio') s -= 40;
  return s;
}

export function buildPlan(all, opts) {
  const {
    days = 4, equipment = [], priority = [], level = 'intermediate',
    goal = 'hypertrophy', minutes = 60,
  } = opts;

  const split = SPLITS[Math.min(6, Math.max(2, days))];
  const vol = VOLUME[level] || VOLUME.intermediate;
  const reps = GOALS[goal] || GOALS.hypertrophy;
  const slots = SLOTS[minutes] || 6;
  const eqSet = new Set(equipment);
  const prio = new Set(priority);

  const usable = all.filter(e => {
    if (e.category === 'stretching' || e.category === 'cardio') return false;
    if (!eqSet.size) return true;
    const eq = e.equipment && e.equipment !== 'None' ? e.equipment : 'body only';
    return eqSet.has(eq);
  });

  const volume = {};          /* muscle -> weekly working sets */
  for (const m of MUSCLES) volume[m] = 0;
  const used = new Set();
  const sessions = [];

  for (const day of split.days) {
    /* priority muscles get first claim on the limited slots */
    const ordered = [...day.muscles].sort((a, b) =>
      (prio.has(b) ? 1 : 0) - (prio.has(a) ? 1 : 0));
    const items = [];

    for (const muscle of ordered) {
      if (items.length >= slots) break;
      const cap = prio.has(muscle) ? vol.target : vol.maintain;
      if (volume[muscle] >= cap) continue;

      const pool = usable
        .filter(e => e.primaryMuscles.includes(muscle))
        .sort((a, b) => scoreExercise(b, muscle, opts) - scoreExercise(a, muscle, opts));
      const pick = pool.find(e => !used.has(e.id)) || pool[0];
      if (!pick) continue;
      used.add(pick.id);

      const isCompound = pick.mechanic === 'compound';
      const sets = isCompound ? vol.setsCompound : vol.setsIsolation;
      items.push({
        exercise: pick,
        muscle,
        sets,
        reps: isCompound ? reps.compound : reps.isolation,
        rest: isCompound ? reps.restC : reps.restI,
        priority: prio.has(muscle),
      });

      volume[muscle] += sets;
      for (const s of pick.secondaryMuscles) {
        if (s !== muscle && s in volume) volume[s] += sets * 0.5;
      }
    }

    /* compounds first: heaviest systemic work while you are fresh */
    items.sort((a, b) => (a.exercise.mechanic === 'compound' ? 0 : 1)
                       - (b.exercise.mechanic === 'compound' ? 0 : 1));
    sessions.push({ name: day.name, items });
  }

  /* ---- honest reporting of where the week falls short ---- */
  const warnings = [];
  for (const m of prio) {
    if (volume[m] < vol.target * 0.7) {
      warnings.push(`${m}: ${round(volume[m])} sets against a ${vol.target}-set target. ${
        eqSet.size ? 'The selected equipment limits what can be programmed.' : 'Add a day or lengthen sessions.'}`);
    }
  }
  for (const m of MUSCLES) {
    if (!prio.has(m) && volume[m] > 0 && volume[m] < 4) {
      warnings.push(`${m}: ${round(volume[m])} sets, below the ~4 needed to maintain.`);
    }
  }
  if (eqSet.size) {
    const missing = [...prio].filter(m => !usable.some(e => e.primaryMuscles.includes(m)));
    for (const m of missing) {
      warnings.push(`${m}: no exercise in the library trains this with the equipment selected.`);
    }
  }

  return { split: split.name, sessions, volume, warnings, target: vol.target, goal, level };
}

export const round = (n) => Math.round(n * 10) / 10;

/* push:pull balance across the week — the imbalance people actually carry */
export function balance(volume) {
  const push = PUSH.reduce((s, m) => s + (volume[m] || 0), 0);
  const pull = PULL.reduce((s, m) => s + (volume[m] || 0), 0);
  const post = ['hamstrings', 'glutes', 'lower back'].reduce((s, m) => s + (volume[m] || 0), 0);
  const ant = ['quadriceps', 'chest', 'abdominals'].reduce((s, m) => s + (volume[m] || 0), 0);
  return { push: round(push), pull: round(pull), posterior: round(post), anterior: round(ant) };
}
