# Attribution and licences

This project combines four third-party sources. Each keeps its own licence.

## 3D anatomy — `data/anatomy.glb`

467 individually named muscle meshes, redistributed here in Draco-compressed form
(a modification of the original, which the share-alike terms cover).

> BodyParts3D, © The Database Center for Life Science, licensed under
> CC Attribution-Share Alike 2.1 Japan.
> Z-Anatomy by Gauthier Kervyn, licensed under CC BY-SA 4.0.

Obtained via [JohanBellander/BodyExplorer](https://github.com/JohanBellander/BodyExplorer).

- Licence: **CC BY-SA** (2.1 JP / 4.0)
- Share-alike: any modified version of this mesh data must stay under CC BY-SA.

## Head scan — `data/head.glb`

Head scan by **Lee Perry-Smith**, [Infinite-Realities](https://ir-ltd.net/).
Distributed with three.js as `LeePerrySmith.glb`.

- Licence: **CC BY 3.0** — attribution required, redistribution and modification permitted.
- Used here untextured, clipped to head and neck.

## Exercise data — `data/exercises.json`

873 exercises from [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db).

- Licence: **Unlicense** (public domain).
- Exercise photographs are loaded at runtime from that repository rather than
  vendored here, to keep this repository small.

## three.js — `vendor/`

[three.js](https://github.com/mrdoob/three.js) r169, MIT licence.
Includes `GLTFLoader`, `DRACOLoader`, `OrbitControls`, `BufferGeometryUtils`
and the Draco decoder.

## This application's own code

`app.js`, `styles.css`, `index.html`, `serve.py` — MIT.

Note that the CC BY-SA terms attach to the anatomy mesh data, not to this
application's source. The two are distributed together but licensed separately.
