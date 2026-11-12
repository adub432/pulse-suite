'use strict';
/* ==========================================================================
   THE single shared audio engine — Pulse Suite v0.2.4
   --------------------------------------------------------------------------
   One AudioContext, one analyser chain, ONE audible source at a time.
   Every tab reads from this engine; no tab owns a player of its own.
   Load once (Play tab, drag-and-drop, Open Audio, Cut's track button) and
   the track, its play/pause state, position and analysis carry to every
   tab — Visualize, Glitch, ASCII, Cut, Cook, Mission Control all read the
   same engine. Switching tabs never starts a second playback and never
   resets the position. Play/pause/seek from any tab drive the same
   playback. Loading a new track stops the old one FIRST (synchronously,
   before any await), and a load-generation counter means a stale async
   load can never clobber a newer one or start a second source — that
   race was the 0.2.3 bug: two overlapping loads each called play() and
   the first source kept sounding after the second took over `state.source`.
   System audio (Toaster-style feed) runs through the same engine and the
   same analyser, so it can never double up with a loaded file either.
   The engine operates on the app's shared `state` object so the render
   loop and every consumer keep reading `state.*` exactly as before.
   ========================================================================== */
function createAudioEngine(state, hooks) {
  const videoEl = () => document.getElementById('play-video');

  const engine = {
    _gen: 0,            // load generation — stale loads return null, never play
    _contexts: 0,       // AudioContexts ever created (must stay 1)
    _sourcesCreated: 0, // BufferSources ever created (smoke-test counter)
    _liveSources: 0,    // BufferSources started and not yet ended/stopped

    /* ---------- context: created once, never again ---------- */
    ensureCtx() {
      if (state.audioCtx) return;
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this._contexts++;
      state.analyser = state.audioCtx.createAnalyser();
      state.analyser.fftSize = 2048;
      state.analyser.smoothingTimeConstant = 0.82;
      // Slow analyser for the chroma (Toaster's fast/mid/slow architecture):
      // 8192 FFT gives 5.86 Hz bins at 48 kHz, so a 55 Hz bass note stops
      // smearing across semitones. AnalyserNodes pass audio through, so
      // chaining is free — the slow one just listens in.
      state.analyserSlow = state.audioCtx.createAnalyser();
      state.analyserSlow.fftSize = 8192;
      state.analyserSlow.smoothingTimeConstant = 0.82;
      state.gain = state.audioCtx.createGain();
      state.gain.gain.value = 0.9;
      state.mediaDest = state.audioCtx.createMediaStreamDestination();
      state.analyser.connect(state.analyserSlow);
      state.analyserSlow.connect(state.gain);
      state.gain.connect(state.audioCtx.destination);
      state.gain.connect(state.mediaDest);
      if (hooks.onContextReady) hooks.onContextReady();
    },
    ensureVideoSource() {
      if (state.mediaElSource) return;
      const v = videoEl();
      state.mediaElSource = state.audioCtx.createMediaElementSource(v);
      state.mediaElSource.connect(state.analyser);
    },

    /* ---------- source bookkeeping: at most one live source ---------- */
    _release(src) {
      if (src && src._counted) { src._counted = false; this._liveSources = Math.max(0, this._liveSources - 1); }
    },
    stopSource() {
      const src = state.source;
      state.source = null;
      if (!src) return;
      try { src.stop(); } catch (_) { /* already ended — nothing to stop */ }
      this._release(src);
    },
    makeSource() {
      const src = state.audioCtx.createBufferSource();
      src.buffer = state.buffer;
      src.connect(state.analyser);
      src._counted = true;
      this._sourcesCreated++;
      this._liveSources++;
      src.onended = () => {
        this._release(src);
        // Stopped by pause/seek/load (state.source moved on or cleared)?
        // Then this is not a natural end — do not advance the queue.
        if (state.source !== src) return;
        if (state.playing && this.currentTime() >= state.duration - 0.05) {
          state.playing = false;
          state.offset = 0;
          if (hooks.onPlayState) hooks.onPlayState(false);
          if (hooks.onEnded) hooks.onEnded();
        }
      };
      return src;
    },

    /* ---------- transport: idempotent, orphan-proof ---------- */
    play() {
      this.ensureCtx();
      state.audioCtx.resume();
      if (state.sysAudio) { state.playing = true; if (hooks.onPlayState) hooks.onPlayState(true); return; }
      if (state.videoMode) {
        const v = videoEl();
        v.play().catch(() => {});
        state.playing = true;
        if (hooks.onPlayState) hooks.onPlayState(true);
        return;
      }
      if (!state.buffer) return;
      // Already playing with a live source? Never start a second one.
      if (state.playing && state.source) return;
      this.stopSource(); // orphan guard: no stale source survives a play()
      state.source = this.makeSource();
      state.startedAt = state.audioCtx.currentTime;
      state.source.start(0, state.offset);
      state.playing = true;
      if (hooks.onPlayState) hooks.onPlayState(true);
    },
    pause() {
      if (state.sysAudio) { state.playing = false; if (hooks.onPlayState) hooks.onPlayState(false); return; }
      if (state.videoMode) {
        const v = videoEl();
        v.pause();
        state.playing = false;
        if (hooks.onPlayState) hooks.onPlayState(false);
        return;
      }
      if (!state.source) { state.playing = false; if (hooks.onPlayState) hooks.onPlayState(false); return; }
      state.offset = this.currentTime();
      this.stopSource();
      state.playing = false;
      if (hooks.onPlayState) hooks.onPlayState(false);
    },
    toggle() { state.playing ? this.pause() : this.play(); },
    seekTo(t) {
      if (state.sysAudio) return;
      if (state.videoMode) {
        const v = videoEl();
        v.currentTime = Math.max(0, Math.min(state.duration, t));
        if (hooks.onSeek) hooks.onSeek(v.currentTime);
        return;
      }
      if (!state.buffer) return;
      const wasPlaying = state.playing;
      if (wasPlaying) this.stopSource();
      state.offset = Math.max(0, Math.min(state.duration, t));
      if (wasPlaying) {
        state.source = this.makeSource();
        state.startedAt = state.audioCtx.currentTime;
        state.source.start(0, state.offset);
      }
      if (hooks.onSeek) hooks.onSeek(state.offset);
    },
    currentTime() {
      if (state.sysAudio) return state.audioCtx ? Math.max(0, state.audioCtx.currentTime - state.sysStartedAt) : 0;
      if (state.videoMode) { const v = videoEl(); return v ? v.currentTime : 0; }
      if (!state.buffer) return 0;
      if (state.playing) return Math.min(state.duration, state.offset + (state.audioCtx.currentTime - state.startedAt));
      return state.offset;
    },
    /* Stop everything audible, right now — the first thing any load does. */
    stopAll() {
      this.stopSource();
      const v = videoEl();
      if (v) { try { v.pause(); } catch (_) {} }
      this.stopSystemAudio(true);
      state.playing = false;
      if (hooks.onPlayState) hooks.onPlayState(false);
    },

    /* ---------- loading: generation-guarded, old track stops first ---------- */
    async loadAudio(filePath, name) {
      const gen = ++this._gen;
      this.ensureCtx();
      // Synchronous stop BEFORE any await: the old track is silent from here.
      this.stopAll();
      const v = videoEl();
      if (v) { v.removeAttribute('src'); v.load(); v.classList.add('hidden'); }
      state.videoMode = false;
      const bytes = await window.pulse.readFile(filePath);
      if (gen !== this._gen) return null; // superseded — never install, never play
      const buf = await state.audioCtx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      if (gen !== this._gen) return null;
      state.source = null; state.buffer = buf; state.duration = buf.duration;
      state.offset = 0; state.playing = false; state.particles = [];
      state.trackName = name; state.trackPath = filePath;
      const det = hooks.detectBeats(buf);
      state.bpm = det.bpm; state.lastBeats = det;
      state.barSeconds = state.bpm ? 240 / state.bpm : 4;
      hooks.resetAnalysis(state.bpm);
      if (hooks.updateSysAudioUI) hooks.updateSysAudioUI();
      if (hooks.onTrackLoaded) await hooks.onTrackLoaded({ kind: 'audio', name, path: filePath });
      if (gen !== this._gen) return null;
      if (hooks.onTrackChanged) hooks.onTrackChanged();
      this.play();
      return { buffer: buf, det };
    },
    async loadVideo(filePath, name) {
      const gen = ++this._gen;
      this.ensureCtx();
      this.stopAll();
      state.videoMode = true; state.buffer = null; state.source = null;
      state.trackName = name; state.trackPath = filePath;
      const v = videoEl();
      v.classList.remove('hidden');
      v.src = window.pulse.fileUrl(filePath);
      this.ensureVideoSource();
      await new Promise((res) => { v.onloadedmetadata = res; v.onerror = res; });
      if (gen !== this._gen) { try { v.pause(); } catch (_) {} return null; }
      state.duration = v.duration || 0;
      state.offset = 0; state.bpm = 0; state.lastBeats = { bpm: 0, onsets: [], beatTimes: [] };
      hooks.resetAnalysis(0);
      if (hooks.updateSysAudioUI) hooks.updateSysAudioUI();
      if (hooks.onTrackLoaded) await hooks.onTrackLoaded({ kind: 'video', name, path: filePath });
      if (gen !== this._gen) return null;
      if (hooks.onTrackChanged) hooks.onTrackChanged();
      this.play();
      return { duration: state.duration };
    },

    /* ---------- system audio (Toaster-style feed) — same engine ---------- */
    async startSystemAudio() {
      this.ensureCtx();
      const msg = document.getElementById('sysaudio-msg');
      /* Linux has no loopback source in Electron's desktop capture —
         attempting the capture here kills the renderer outright in this
         environment, so gate it and say so plainly. Windows/macOS go
         through the real capture below. */
      if (window.pulse.platform === 'linux') {
        if (msg) msg.textContent = 'System audio capture is not available on Linux — Electron has no loopback source here. It works on Windows and macOS. File playback still works.';
        return false;
      }
      try {
        const sources = await window.pulse.systemAudioSources();
        if (!sources || sources.error || !sources.length) {
          if (msg) msg.textContent = 'System audio capture is not available on this machine — loopback needs Windows or macOS. File playback still works.';
          return false;
        }
        const src = sources[0];
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: src.id } },
          video: false
        });
        // A file track was playing? Stop it first — one audible source.
        if (state.playing) this.pause();
        this.stopSystemAudio(true);
        state.sysStream = stream;
        state.sysSource = state.audioCtx.createMediaStreamSource(stream);
        state.sysSource.connect(state.analyser);
        state.gain.gain.value = 0; // analyse only — don't double the audio through the speakers
        state.sysAudio = true; state.playing = true;
        state.sysStartedAt = state.audioCtx.currentTime;
        hooks.resetAnalysis(0);
        if (hooks.updateSysAudioUI) hooks.updateSysAudioUI();
        if (hooks.onSysAudioStarted) hooks.onSysAudioStarted(src);
        if (hooks.onPlayState) hooks.onPlayState(true);
        if (msg) msg.textContent = '';
        return true;
      } catch (e) {
        if (msg) msg.textContent = 'Could not start system audio capture (' + (e && e.message ? e.message : e) + '). On Windows/macOS this needs the loopback source; on Linux it is unavailable.';
        return false;
      }
    },
    stopSystemAudio(silent) {
      if (state.sysSource) { try { state.sysSource.disconnect(); } catch (_) {} state.sysSource = null; }
      if (state.sysStream) { state.sysStream.getTracks().forEach((t) => t.stop()); state.sysStream = null; }
      if (state.sysAudio) {
        state.sysAudio = false; state.playing = false;
        if (state.gain) state.gain.gain.value = 0.9;
        if (hooks.updateSysAudioUI) hooks.updateSysAudioUI();
        if (!silent && hooks.onPlayState) hooks.onPlayState(false);
      }
    },

    /* ---------- smoke-test handle: prove there's only ever one ---------- */
    debug() {
      return {
        audioContexts: this._contexts,
        sourcesCreated: this._sourcesCreated,
        liveSources: this._liveSources,
        playing: state.playing,
        sysAudio: state.sysAudio,
        videoMode: state.videoMode,
        trackName: state.trackName,
        position: this.currentTime(),
        duration: state.duration
      };
    }
  };
  return engine;
}
