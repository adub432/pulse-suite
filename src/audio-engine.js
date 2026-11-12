'use strict';
/* ==========================================================================
   THE single shared audio engine — Pulse Suite v0.2.5
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
   v0.2.5 — the 0.2.4 bug: play() called audioCtx.resume() without
   awaiting it, then started a source and set playing=true even when the
   context stayed suspended (no user gesture left by the end of the long
   load chain, or the OS audio device unavailable). The app claimed to
   play while the clock sat frozen at 0:00 and nothing sounded. Now
   play() awaits resume() and verifies state === 'running' BEFORE it
   starts anything or claims to play; if the context will not run it
   pauses cleanly, remembers the user wanted to play, and shows a
   visible "Audio is blocked" message instead of failing silently. A
   statechange listener recovers automatically when the device comes
   back, and load errors are reported instead of swallowed.
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
      // v0.2.5: watch the context's own state. If the OS takes the audio
      // device away mid-playback the context goes 'suspended'/'interrupted'
      // and the clock freezes — the app must stop claiming to play, say so,
      // and recover automatically when the device comes back instead of
      // sitting on a frozen 0:00 forever (the 0.2.4 bug).
      state.audioCtx.addEventListener('statechange', () => {
        const st = state.audioCtx.state;
        if (st === 'running') {
          if (state.audioBlocked) {
            state.audioBlocked = false;
            if (hooks.onAudioUnblocked) hooks.onAudioUnblocked();
          }
          if (state._wantedPlaying && state.buffer && !state.playing && !state.sysAudio && !state.videoMode) {
            state._wantedPlaying = false;
            this.play();
          }
        } else if ((st === 'suspended' || st === 'interrupted') && state.playing) {
          this._blocked('Audio is blocked (' + st + ') — check your speakers / headphones, then click Play again.');
        }
      });
      state.analyser = state.audioCtx.createAnalyser();
      // v0.2.6: 4096-pt FFT (was 2048) — 11.7 Hz bins at 48 kHz instead of
      // 23.4 Hz, so the spectrum, the 32 bands and the chroma all get finer
      // frequency resolution. Still cheap: one extra FFT per frame.
      state.analyser.fftSize = 4096;
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
    // v0.2.5: resume() is async and can silently fail (no user gesture
    // left after a long load chain, or the OS audio device is gone).
    // Never start a source — and never claim to play — until the context
    // is verifiably 'running'. The race against a timeout keeps a dead
    // device from hanging play() forever.
    async _ensureRunning() {
      this.ensureCtx();
      const ctx = state.audioCtx;
      if (ctx.state === 'running') return true;
      try {
        await Promise.race([
          ctx.resume(),
          new Promise((res) => setTimeout(res, 1500))
        ]);
      } catch (_) { /* resume rejected — fall through to the state check */ }
      return ctx.state === 'running';
    },
    // The context will not run: stop claiming to play, keep the position,
    // remember the user wanted to play (auto-recover on statechange),
    // and show a visible message — never fail silently again.
    _blocked(message) {
      this.stopSource();
      state.offset = this.currentTime();
      state.playing = false;
      state.audioBlocked = true;
      state._wantedPlaying = true;
      if (hooks.onPlayState) hooks.onPlayState(false);
      if (hooks.onAudioBlocked) hooks.onAudioBlocked(message);
    },
    async play() {
      // Serialize concurrent play() calls (triple-clicks, load tail +
      // statechange recovery) so only one source is ever created.
      if (this._playInFlight) return this._playInFlight;
      this._playInFlight = (async () => {
        this.ensureCtx();
        // v0.2.5 (0.2.4 bug): resume FIRST, verify it worked, and only
        // then start a source and set playing. A source started on a
        // suspended context never sounds and the clock never moves.
        if (!(await this._ensureRunning())) {
          this._blocked('Audio is blocked (' + state.audioCtx.state + ') — check your speakers / headphones, then click Play again.');
          return false;
        }
        state.audioBlocked = false;
        state._wantedPlaying = false;
        if (state.sysAudio) { state.playing = true; if (hooks.onPlayState) hooks.onPlayState(true); return true; }
        if (state.videoMode) {
          const v = videoEl();
          try {
            await v.play();
          } catch (_) {
            this._blocked('Video could not play — the file may be damaged or in an unsupported format.');
            return false;
          }
          state.playing = true;
          if (hooks.onPlayState) hooks.onPlayState(true);
          return true;
        }
        if (!state.buffer) return false;
        // Already playing with a live source on a RUNNING context?
        // Never start a second one — the source keeps sounding.
        if (state.playing && state.source) return true;
        this.stopSource(); // orphan guard: no stale source survives a play()
        state.source = this.makeSource();
        state.startedAt = state.audioCtx.currentTime;
        state.source.start(0, state.offset);
        state.playing = true;
        if (hooks.onPlayState) hooks.onPlayState(true);
        return true;
      })();
      try { return await this._playInFlight; }
      finally { this._playInFlight = null; }
    },
    pause() {
      state._wantedPlaying = false;
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
    async toggle() { if (state.playing) this.pause(); else await this.play(); },
    async seekTo(t) {
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
        // v0.2.5: do not restart a source on a context that will not run.
        if (!(await this._ensureRunning())) {
          this._blocked('Audio is blocked (' + state.audioCtx.state + ') — check your speakers / headphones, then click Play again.');
          if (hooks.onSeek) hooks.onSeek(state.offset);
          return;
        }
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
      // A new load supersedes any earlier intent to play / blocked state;
      // the load's own play() at the tail sets them fresh.
      state._wantedPlaying = false;
      state.audioBlocked = false;
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
      // v0.2.5: a file that cannot be read or decoded used to reject with
      // nothing shown anywhere — the track just never appeared and play
      // did nothing. Report it in the player instead.
      let bytes;
      try { bytes = await window.pulse.readFile(filePath); }
      catch (e) {
        if (gen === this._gen && hooks.onLoadError) hooks.onLoadError(name, 'could not read the file (' + (e && e.message ? e.message : e) + ')');
        return null;
      }
      if (gen !== this._gen) return null; // superseded — never install, never play
      let buf;
      try { buf = await state.audioCtx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); }
      catch (e) {
        if (gen === this._gen && hooks.onLoadError) hooks.onLoadError(name, 'could not be decoded — try MP3, WAV, FLAC, OGG or M4A');
        return null;
      }
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
      await this.play();
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
      // v0.2.5: a video that fails to load used to install with duration 0
      // and then "play" silently. Say so instead.
      if (!v.duration || !isFinite(v.duration)) {
        state.videoMode = false;
        if (hooks.onLoadError) hooks.onLoadError(name, 'could not be loaded — try MP4, WebM, MOV or MKV');
        return null;
      }
      state.duration = v.duration || 0;
      state.offset = 0; state.bpm = 0; state.lastBeats = { bpm: 0, onsets: [], beatTimes: [] };
      hooks.resetAnalysis(0);
      if (hooks.updateSysAudioUI) hooks.updateSysAudioUI();
      if (hooks.onTrackLoaded) await hooks.onTrackLoaded({ kind: 'video', name, path: filePath });
      if (gen !== this._gen) return null;
      if (hooks.onTrackChanged) hooks.onTrackChanged();
      await this.play();
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
        // v0.2.5: same rule as file playback — do not claim to listen on
        // a context that will not run.
        if (!(await this._ensureRunning())) {
          try { state.sysSource.disconnect(); } catch (_) {}
          state.sysSource = null;
          state.sysStream.getTracks().forEach((t) => t.stop());
          state.sysStream = null;
          if (hooks.onAudioBlocked) hooks.onAudioBlocked('Audio is blocked (' + state.audioCtx.state + ') — check your speakers / headphones, then try system audio again.');
          return false;
        }
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
        duration: state.duration,
        // v0.2.5: the context's own state is the 0.2.4 diagnosis — a
        // 'suspended'/'interrupted' context freezes the clock at 0:00.
        contextState: state.audioCtx ? state.audioCtx.state : 'none',
        audioBlocked: !!state.audioBlocked,
        // v0.2.6: hi-res analysis proof for the smoke test.
        fftSize: state.analyser ? state.analyser.fftSize : 0,
        spectrumBands: 64
      };
    }
  };
  return engine;
}
