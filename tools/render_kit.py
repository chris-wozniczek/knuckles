"""Renders the Knuckles drum kit one-shots (original sounds, MIT like the rest of the repo).
Run: python3 tools/render_kit.py  (needs numpy + scipy)"""
import os
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'audio')
rng = np.random.default_rng(7)

def t(sec): return np.arange(int(sec * SR)) / SR
def env(tt, decay, attack=0.0005):
    a = np.clip(tt / attack, 0, 1) if attack > 0 else 1
    return a * np.exp(-tt / decay)
def filt(x, kind, f, order=2):
    sos = butter(order, f, btype=kind, fs=SR, output='sos')
    return sosfilt(sos, x)
def sat(x, drive): return np.tanh(x * drive) / np.tanh(drive)
def noise(n): return rng.uniform(-1, 1, n)
def sweep_sine(tt, f0, f1, k):
    f = f1 + (f0 - f1) * np.exp(-tt * k)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)
def norm(x, peak=0.94):
    x = x - np.mean(x[:64]) * 0
    return x / (np.max(np.abs(x)) + 1e-9) * peak
def fade(x, ms=4):
    n = int(SR * ms / 1000); x[-n:] *= np.linspace(1, 0, n); return x

def save(name, x, stereo=None):
    x = fade(norm(x))
    path = os.path.join(OUT, name + '.wav')
    data = x if stereo is None else np.stack([x, fade(norm(stereo))], 1)
    wavfile.write(path, SR, (data * 32767).astype(np.int16))

def metal(tt, freqs=(205.3, 304.4, 369.6, 522.7, 540.0, 800.0), mult=1.0):
    x = sum(np.sign(np.sin(2 * np.pi * f * mult * tt + rng.uniform(0, 6.28))) for f in freqs)
    return x / len(freqs)

# Kick: punchy trap kick, click + pitch-swept body, saturated
tt = t(0.55)
body = sweep_sine(tt, 260, 46, 28) * env(tt, 0.2)
click = filt(noise(len(tt)), 'highpass', 2500) * env(tt, 0.004)
save('kick', sat(body * 1.2 + click * 0.5, 2.4))

# Snare: tonal body + bright noise crack, a little saturation and room
tt = t(0.42)
tone = (np.sin(2 * np.pi * 185 * tt) * 0.6 + np.sin(2 * np.pi * 330 * tt) * 0.3) * env(tt, 0.05)
nz = filt(noise(len(tt)), 'bandpass', [1800, 9000]) * env(tt, 0.11)
crack = filt(noise(len(tt)), 'highpass', 4000) * env(tt, 0.012)
room = filt(noise(len(tt)), 'bandpass', [900, 5000]) * env(tt, 0.2) * 0.12
save('snare', sat(tone + nz * 0.9 + crack * 0.6 + room, 1.8))

# Clap: four staggered bursts and a short tail, stereo spread
def clap(seed_shift):
    tt = t(0.5); x = np.zeros(len(tt))
    for i, d in enumerate([0, 0.011, 0.022, 0.034 + seed_shift]):
        n0 = int(d * SR); seg = tt[: len(tt) - n0]
        x[n0:] += noise(len(seg)) * env(seg, 0.008 if i < 3 else 0.16) * (0.8 if i < 3 else 1)
    return sat(filt(x, 'bandpass', [900, 6500]), 1.6)
save('clap', clap(0), clap(0.003))

# Hats: 808-style six-square metal through a bright bandpass
tt = t(0.09)
save('hat', filt(filt(metal(tt), 'bandpass', [6500, 15000]) * env(tt, 0.022) + filt(noise(len(tt)), 'highpass', 9000) * env(tt, 0.01) * 0.4, 'highpass', 6000))
tt = t(0.6)
save('ohat', filt(metal(tt), 'bandpass', [6000, 15000]) * env(tt, 0.17) + filt(noise(len(tt)), 'highpass', 8000) * env(tt, 0.12) * 0.3)

# Rim: short woody click
tt = t(0.08)
save('rim', sat(np.sin(2 * np.pi * 1650 * tt) * env(tt, 0.012) + filt(noise(len(tt)), 'bandpass', [2000, 6000]) * env(tt, 0.004), 2))

# Snap: finger snap
tt = t(0.25)
save('snap', filt(noise(len(tt)), 'bandpass', [1800, 5000]) * env(tt, 0.03) + filt(noise(len(tt)), 'highpass', 5000) * env(tt, 0.004) * 0.6)

# Crash: long metallic wash
tt = t(1.8)
save('crash', filt(metal(tt, mult=2.7) * 0.6 + noise(len(tt)) * 0.7, 'highpass', 4500) * env(tt, 0.6, 0.003))

# 808: distorted sine at A1 (pitch-shifted at playback), long tail
tt = t(2.6)
f = 55.0 * (1 + 0.9 * np.exp(-tt * 40))
ph = 2 * np.pi * np.cumsum(f) / SR
x808 = np.sin(ph) * env(tt, 1.1, 0.002)
x808 = sat(x808 * 1.0 + 0.25 * np.sin(2 * ph) * env(tt, 0.4), 3.2)
x808 += filt(noise(len(tt)), 'highpass', 3000) * env(tt, 0.003) * 0.25
save('808', filt(x808, 'lowpass', 2800))
print('ok')
