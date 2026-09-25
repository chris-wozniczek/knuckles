# Knuckles

**An air MPC for trap beats. You play it with your bare hands.**

![Knuckles: 16 MPC pads played by hand in the air](docs/hero.png)

**Live demo: https://chris-wozniczek.github.io/knuckles/**

Knuckles uses your webcam to turn your hands into an MPC-style drum machine. Jab at the 16 pads in the air, slide gliding 808s up and down with your right hand, speed up hi-hat rolls, then clench a fist and open it to drop the beat. The 140 BPM trap beat underneath keeps it sounding good, and every note snaps to a dark scale (F Hijaz by default).

It's a companion to [Handel](https://github.com/chris-wozniczek/handel), the same idea done as a calm air orchestra.

## How to use

1. Open the live demo. The attract screen already plays a beat with simulated hands. Press **Hear the beat** to turn the sound on.
2. Press **Start camera** and allow access. Step back about an arm's length and keep both hands in frame.
3. Pick a mode in the dock (or press keys `1`–`4`):

| Mode | What your hands do |
| --- | --- |
| **Pads** | Tap into a pad with your index fingertip (or pinch over it) to hit it. Bottom row: kick, snare, clap, rim. Then hats and log drum, four 808 notes, and flute, horn, riser and crash on top. |
| **808** | Right-hand height picks the 808 note, with glide. Pinch adds an extra hit, left-hand openness adds drive, a fist hits the kick. |
| **Hat Rolls** | Raise your right hand to go from 1/8 to 1/64 hi-hat rolls. Left-hand height sweeps the filter. Hold a fist to cut the beat and open it to **drop**. |
| **Flute** | Right-hand height plays a tribal flute lead over the beat. Pinch adds an accent, left-hand openness adds vibrato, a fist hits a boom. |

Pick the groove with the **Beat** menu (or press `B`): **Tribal Trap** (140 BPM, flute hook), **Drill** (142, sliding 808s, skippy hats, bells), **Phonk** (130, cowbell melody, Memphis bounce) or **Boom Bap** (90, swung drums, Rhodes keys). Each beat sets its own tempo, groove and key.

Moving your hands apart makes the room (reverb) bigger. Press **Record** (or `R`) for a 15-second clip with sound, ready to post. Press `?` for help at any time.

| | |
| --- | --- |
| ![Pads mode](docs/pads.png) | ![Hat Rolls mode](docs/rolls.png) |

## How it works

- **Hand tracking:** MediaPipe Tasks Vision `HandLandmarker` runs in the browser (WASM + GPU delegate, falling back to CPU if the GPU fails) and tracks 21 landmarks on each of two hands. Landmarks are smoothed, then turned into continuous controls (height, openness, distance between hands, speed) and events (pinch, fist, fist release, downward jab).
- **Sound:** Tone.js / Web Audio. One step sequencer drives four beat presets (tempo, swing, kick and snare patterns, hat style, 808 slides, key and a melody voice: flute, FM bells, a pitched cowbell or Rhodes-style keys). The default Tribal Trap plays a syncopated four-bar kick, clap and snare on 3, hats with rolls, a gliding 808 (sine plus saturation), a flute motif in the Hijaz scale, horn stabs and a dark pad. Everything goes through a bus compressor, reverb, delay and a limiter. Live hits are scheduled against the sequencer so they never collide.
- **Visuals:** a WebGL shader draws the mirrored webcam as gold and purple halftone over rising smoke that reacts to the kick and to the audio spectrum. A 2D canvas on top draws the MPC pads, the step-sequencer LCD, note and roll ladders, hand skeletons, trails and particles.
- **Demo mode:** the attract screen drives the same gesture and audio pipeline with choreographed synthetic hands, so it looks alive before you allow the camera.
- **Recording:** `canvas.captureStream(30)` plus a `MediaStreamAudioDestinationNode` go into `MediaRecorder` (MP4 where supported, otherwise WebM). The clip is created and downloaded locally.

No build step: plain HTML, CSS and ES modules. Libraries and the model load from jsDelivr and Google's public model bucket.

## Privacy

Knuckles runs on your device and nothing is uploaded. Webcam frames, landmarks and audio never leave the browser: there is no backend, no analytics and no API keys. Recordings exist only on your machine until you share them.

## Run locally

```bash
git clone https://github.com/chris-wozniczek/knuckles.git
cd knuckles
python3 -m http.server 8000
# open http://localhost:8000 in Chrome
```

The camera needs `localhost` or HTTPS. To test without a webcam, launch Chrome with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=hands.mjpeg`.

## Built for Hackyard Yard #3: One Screen

Everything happens on a single screen: modes, key picker, help and the recorded clip are overlays, not pages. All code was written during the build week (Sep 21–25, 2026) by [Devin](https://devin.ai) (Cognition AI) for Krzysztof Woźniczek. No beat or audio from any existing track is used; every sound is synthesized live in the browser.

## License

[MIT](LICENSE)
