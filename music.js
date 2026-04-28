(() => {
  const MUSIC_KEY = "temps-music-state-v1";
  const musicPlaylist = [
    { title: "Emerald Canopy", src: "audio/1_emerald_canopy.flac" },
    { title: "Frostbound Echoes", src: "audio/2_frostbound_echoes.flac" },
    { title: "Verdant Labyrinth", src: "audio/3_verdant_labyrinth.flac" },
    { title: "Abyssal Dreams", src: "audio/4_abyssal_dreams.flac" },
    { title: "Crimson Decay", src: "audio/5_crimson_decay.flac" },
    { title: "Celestial Radiance", src: "audio/6_celestial_radiance.flac" },
    { title: "Stone Whispers", src: "audio/7_stone_whispers.flac" },
    { title: "Neon Spores", src: "audio/8_neon_spores.flac" },
    { title: "Infernal Heartbeat", src: "audio/9_infernal_heartbeat.flac" },
    { title: "Apex Confrontation", src: "audio/10_apex_confrontation.mp3" },
    { title: "Sands of Time", src: "audio/11_sands_of_time.mp3" },
    { title: "Hurry Up", src: "audio/12_hurry_up.flac" }    
  ];

  const audio = document.getElementById("bgMusic");
  const toggleBtn = document.getElementById("musicToggle");
  const status = document.getElementById("musicStatus");

  if (!audio) return;

  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(MUSIC_KEY)) || {};
    } catch {
      return {};
    }
  })();

  const clampIndex = (i) => ((i % musicPlaylist.length) + musicPlaylist.length) % musicPlaylist.length;

  let trackIndex = Number.isInteger(saved.trackIndex) ? saved.trackIndex : 0;
  let musicEnabled = !!saved.enabled;
  let hasUserGesture = false;

  const savedTrackIndex = Number.isInteger(saved.trackIndex) ? saved.trackIndex : 0;
  const savedTime = Number.isFinite(saved.time) ? saved.time : 0;

  const setTrack = (i, restoreProgress = false) => {
    trackIndex = clampIndex(i);
    const track = musicPlaylist[trackIndex];
    if (!track || !track.src) return;

    audio.src = track.src;
    audio.volume = 0.5;
    audio.load();

    if (restoreProgress && trackIndex === clampIndex(savedTrackIndex) && savedTime > 0) {
      audio.currentTime = savedTime;
    } else {
      audio.currentTime = 0;
    }
  };

  const saveState = () => {
    localStorage.setItem(
      MUSIC_KEY,
      JSON.stringify({
        enabled: musicEnabled,
        trackIndex,
        time: Number.isFinite(audio.currentTime) ? audio.currentTime : 0
      })
    );
  };

  const updateUi = () => {
    if (!toggleBtn) return;
    toggleBtn.textContent = musicEnabled ? "🔊" : "🔇";
    toggleBtn.setAttribute("aria-pressed", String(musicEnabled));
    if (status) status.textContent = musicEnabled ? `Playing: ${trackIndex + 1}` : "Music Off";
  };

  const tryPlay = async () => {
    if (!musicEnabled || !hasUserGesture) return;
    try {
      await audio.play();
      if (status) status.textContent = "Playing";
    } catch (err) {
      console.error("Playback failed:", err);
      musicEnabled = false;
      if (status) status.textContent = "Tap again to enable";
      updateUi();
    }
  };

  const onFirstGesture = () => {
    if (!hasUserGesture) {
      hasUserGesture = true;
      if (musicEnabled) tryPlay();
    }
  };

  setTrack(trackIndex, true);  // set source on load
  updateUi();

  audio.addEventListener("ended", () => {
    setTrack(trackIndex + 1, false);  // avoid stale time carryover to next track
    saveState();
    tryPlay();
  });

  audio.addEventListener("timeupdate", saveState);

  if (toggleBtn) {
    toggleBtn.addEventListener("click", async () => {
      musicEnabled = !musicEnabled;
      hasUserGesture = true;
      if (musicEnabled) {
        await tryPlay();
      } else {
        audio.pause();
        if (status) status.textContent = "Music Off";
      }
      saveState();
      updateUi();
    });
  }

  document.addEventListener("pointerdown", onFirstGesture, { once: true, capture: true });
  document.addEventListener("keydown", onFirstGesture, { once: true, capture: true });
  window.addEventListener("beforeunload", saveState);
})();
