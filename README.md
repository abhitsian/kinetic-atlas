# Kinetic Atlas

873 exercises mapped onto a real 3D anatomical model. Pick an exercise and the
muscles it trains light up on the body; click a muscle and the library filters to
every exercise that trains it.

**Live: https://abhitsian.github.io/kinetic-atlas/**

## What it does

- **Real anatomy, not a diagram.** The figure is a cadaver-derived model with 467
  individually named muscle meshes. 281 of them map onto the exercise dataset's 17
  muscle labels; the rest (hand and foot intrinsics, larynx, diaphragm, ligaments)
  render as neutral tissue.
- **Primary vs assisting.** Selecting a muscle returns exercises where it is the
  *primary mover*. A toggle widens this to include exercises where it only assists,
  and those are tagged and sorted last.
- **Coverage mode** repaints the whole body by how many exercises train each muscle,
  turning the figure from a picker into a read-out.
- **Movement patterns** (hinge, squat, vertical pull, …) are *derived* from the
  exercise name, mechanic and force. The dataset has no pattern field, so this is
  inference; it shows `—` rather than guessing when nothing matches.
- **Shareable state.** Filters and the selected exercise live in the URL, e.g.
  `?muscle=lats&equipment=barbell&role=any`.

## Running locally

```
python3 serve.py 5231
```

then open http://localhost:5231.

`serve.py` exists rather than `python -m http.server` for two reasons: it sends
`no-store` so edits are never masked by browser caching, and it threads requests so
the 4.8 MB model and the exercise JSON don't starve each other on first load.

## Layout

```
index.html     markup
styles.css     design tokens and all styling
app.js         scene, model loading, muscle mapping, filtering, UI
data/          anatomy.glb (Draco, 4.8 MB), head.glb, exercises.json, muscle_group_map.json
vendor/        three.js r169 + loaders + Draco decoder, all local
```

There is no build step and no runtime network dependency except the exercise
photographs, which are loaded from the free-exercise-db repository.

## Two things worth knowing if you fork this

- **GLTFLoader sanitises node names.** `left biceps brachii` arrives as
  `left_biceps_brachii`, so any name lookup must normalise both sides or it fails
  silently on every mesh.
- **The anatomy source is Z-up in millimetres**, so it needs
  `rotation.x = -Math.PI/2` and `scale 0.001`.

## Licences

The anatomy meshes are CC BY-SA and the head scan is CC BY 3.0 — attribution is
required and is shown in the app. Application code is MIT.
See [ATTRIBUTION.md](ATTRIBUTION.md) for the full breakdown.
