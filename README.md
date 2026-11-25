# Grip

Game cameras. Shots place the camera; a director picks, blends, mixes and sequences them; nothing loses the player.

No renderer and no page: each frame, put `director.view` on your camera. 2D and 3D, perspective and orthographic. About 10 KB gzipped. No dependencies.

```ts
import { Director, follow } from 'grip';

const cam = new Director();
const car = { position: [0, 0.6, 0], heading: 0 };   // keep these up to date
cam.add('chase', follow(car, { distance: 8, height: 3 }));
cam.cut('chase');

// every frame
cam.aspect = width / height;
const view = cam.update(dt);   // view.position, view.rotation (unit quaternion), view.fov, view.size, view.shift
```

## Subjects

A subject is `{ position, heading?, radius? }`: a plain object you keep up to date. `heading` is radians, 0 looking down -z, turning left positive; leave it out and Grip uses the way it moves. Grip measures speed itself, and treats a jump bigger than `teleport` (6 units) in one frame as a teleport: the shot snaps instead of reading it as speed.

## Shots

| Shot | For |
| --- | --- |
| `follow(subject, { distance, height, side, ahead, lag, leash, swing, maxSwing })` | Chase cameras, third person: behind the way it faces. |
| `orbit(subject \| null, { yaw, pitch, distance, ranges, drift, flat, panRoom })` | Third person, viewers, menus. `turn`, `zoomBy`, `panBy`, `goTo`, `behind`, `fit`, `forward`. |
| `side(subject, { yaw, pitch, distance, screen, deadZone, ahead })` | Side-on and top-down: never turns, slides to keep the subject in a dead zone. |
| `fixed(eye, subject, { deadZone, lag })` | A camera that stays put and turns to watch. |
| `rail(path, { duration, from, to, ease, speed, track, offset, look, bank })` | Cranes, dollies, flythroughs, coasters, tracking shots. `look` is `'along'`, a subject, or points along the way. |
| `look(head, { yaw, pitch, pitchRange })` | First person. `turn`, `face`, `forward`. |
| `group(members, { padding, sizeRange, keep })` | Fits everyone in: brawlers, co-op. `keep` is the one never lost. |
| `still(eye, at)` | Locked off. |

Every shot also takes: `fov`, `size` (orthographic half height), `zoom`, `dutch` (roll, degrees), `shift`, `lift` (how high on the subject to look), `hold` (keeps the subject this wide by the lens: with a moving camera, a dolly zoom), `room` (a box the camera can't leave), `blocked(from, to)` (walls between camera and subject: return how far along the way is clear), `near` (the closest a wall can push the camera in: any closer and it rises over the wall or swings round it), `shake: { amount, angle, move, speed }`, `guard`, `free`. They're all plain fields: change them as you go.

`path(points, closed?)` is a smooth curve measured by distance, for rails.

## The director

- `cut(name)`, `blend(name, seconds, { ease, arc })`. `arc` swings round the subject instead of cutting across.
- `mix({ a: 0.3, b: 0.7 })` every frame, `mix(null)` to stop.
- `play([{ shot, hold, blend? }], { then, blendOut, loop, onShot, onEnd })`, `skip()`, `playing`.
- `kick({ from, push, shape, time, speed, radius, fade, trauma })`: a one-off push that travels out from `from` at `speed`, so a far camera feels it later and less. `shake(trauma)`.
- `snap()` after teleporting the player.
- `project(point)`, `inspect()`, `zones()`, `weightOf(name)`, `frameOf(name)` for drawing and panels.

## The rules

Each was a way a camera lost the player in our tests, and Grip can't do it:

- **A shot with a subject keeps it in the picture**, inside `guard.box` (0.8 of the way to the edge), and within `guard.far`; its camera stays in `room`. A rigid shot (side, group) slides; the others turn the least they can. Only a `free` shot, a cinematic one, may look away. They never step in on a shot that's set up right.
- **The director checks the finished picture again**, after blends and mixes, before it leaves.
- **Smoothing has a leash**: however fast the subject goes, the camera is never further behind than `leash`. Plain damping trails by speed times time.
- **Blends and mixes work on what the camera looks at**, not on rotations: a blend between two shots of a subject keeps it in view.
- **The rotation is rebuilt from scratch every frame**, from eye, target and up: it can't drift or come out the wrong length.
- **A wall never pushes the camera into the subject.** It comes in no closer than `near`; past that it rises over the wall or swings round it, the side that stays clear where the subject's heading, and doesn't sweep back through it on the way home.
- **A clock that jumps backwards counts as no time.**
- **No priorities**: you say which shot, so nothing can tie and hand the picture to the wrong camera.
- **Everything runs on the `dt` you pass**: pause or slow the game and shakes and kicks follow.

`trips` counts how often each rule had to step in.

## Input

`grip/input` is kept apart so the rest runs anywhere. `orbitHand(element, orbit)`: drag to turn, right-drag or two fingers to pan, scroll or pinch to zoom. `lookHand(element, look)`: captures the mouse where the browser allows, drags where it doesn't; a zoomed lens turns slower.

## The timeline

`grip/timeline` lays shots, values, sounds, events and kicks out against time, as a video editor lays out clips. A script is plain data, so it can be written by hand or by a tool, kept as JSON, and read in a diff.

```ts
import { Timeline, inspector, webAudio } from 'grip/timeline';

const tl = new Timeline({
    name: 'Reveal',
    tracks: [
        { kind: 'camera', clips: [
            { at: 0, length: 5, shot: 'crane' },
            { at: 5, length: 3, shot: 'close' },
            { at: 8, length: 4, shot: 'spin', blend: 1.2 }   // blends in from the picture before
        ] },
        { kind: 'value', name: 'fog', keys: [[0, 0.2], [8, 0.6], [12, 0.1, 'out']] },
        { kind: 'sound', clips: [{ at: 0, sound: 'drone' }, { at: 8, sound: 'launch' }] },
        { kind: 'event', marks: [{ at: 8, name: 'fire' }] },
        { kind: 'shake', kicks: [{ at: 8, push: [0, 0.35, 0], shape: 'rumble', time: 1.4 }] }
    ]
}, { director: cam, sounds: webAudio(audioCtx, buffers) });

tl.bind('fog', v => (fog = v));
tl.on('fire', () => launchRockets());
tl.onEnd = () => cam.blend('player', 1.5);
tl.play();

// every frame, before the director
tl.update(dt);
cam.update(dt);
```

- **Camera clips** cut, or blend in over `blend` seconds (`ease`, `arc`). The clip's shot wakes as it comes on, so a rail with a `duration` runs from its start.
- **Values** are keyframes `[time, value, ease?]`: a number or a list of them. `bind` calls you with the value on every update and seek; `value(name, t)` reads it at any time.
- **Sounds** go through a `SoundPlayer`: `webAudio(ctx, buffers, out)` is one, or bring your own.
- **Events** call `onEvent` and `on(name)` as playback passes them; **kicks** go to the director's shaker.
- `play(from?)`, `pause()` (the picture holds still), `stop()`, `skip()` (straight to the end, then `onEnd`), `speed`, `loop`.
- `seek(t)` lands exactly where playing would have: it replays the camera from the last cut. Events and sounds on the way are skipped; sounds that should be playing at `t` start part way in.
- `inspect()` says where it's at; `problems()` lists what's wrong with the script, such as shots the director doesn't have.

`inspector(tl, { parent })` puts a read-only view of it on the page: every track against time, what's on now, a playhead to scrub, play and pause. Its colours are CSS variables on `.grip-timeline`.

## Tests

`npm test` runs every way a camera can lose the player that Grip rules out, and the rest of what it and the timeline promise, headless in Node.

## Building

Not on npm yet. Copy `src/` into your project, or import `dist/grip.js` (types in `dist/types`).

```
npm install
npm test          type-check, then the tests
npm run build     dist/grip.js, input.js, timeline.js and their types
npm run size      what it weighs
```

## Where it came from

Grip grew out of trying [Klipp](https://github.com/pmndrs/klipp), the Cinemachine-style toolkit from pmndrs, on nine small games. The shots and flythroughs were lovely; the ways it lost the player were not. Grip keeps the first and designs out the second: each rule above is one of those ways.
