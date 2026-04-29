(() => {
  const MUSIC_KEY = "temps-music-state-v1";
  const VOLUME_STEPS = [0, 0.33, 0.67];
  const VOLUME_ICONS = ["🔇", "🔉", "🔊"];
  const VOLUME_LABELS = ["0", "33", "67"];

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

  const SCORE_LOOPS = {
    good: [
      "audio/vivaldi_winter_mvt1_john_harrison.mp3",
      "audio/vivaldi_winter_mvt2_john_harrison.mp3",
      "audio/vivaldi_winter_mvt3_john_harrison.mp3"
    ],
    bad: [
      "audio/chopin_prelude_opus28n4_ivan_ilić.ogg",
      "audio/gluck_melodie_jan_kubelik.mp3"
    ]
  };

  const audio = document.getElementById("bgMusic");
  const toggleBtn = document.getElementById("musicToggle");
  const status = document.getElementById("musicStatus");

  if (!audio) return;

  const safeReadStorage = () => {
    try {
      return JSON.parse(localStorage.getItem(MUSIC_KEY)) || {};
    } catch {
      return {};
    }
  };
  const saved = safeReadStorage();

  const clampIndex = (i) => ((i % musicPlaylist.length) + musicPlaylist.length) % musicPlaylist.length;

  let trackIndex = Number.isInteger(saved.trackIndex) ? saved.trackIndex : 0;
  const savedTrackIndex = Number.isInteger(saved.trackIndex) ? saved.trackIndex : 0;
  const savedTime = Number.isFinite(saved.time) ? saved.time : 0;

  const fallbackStep = 2;  // default 67% volume
  // use saved step if valid, otherwise fall back to default
  let volumeStep = (Number.isInteger(saved.volumeStep) && saved.volumeStep >= 0 && saved.volumeStep < VOLUME_STEPS.length) ? saved.volumeStep : fallbackStep;

  let hasUserGesture = false;
  let isApplyingSavedTime = true;
  let scoreMode = null;
  let scoreTrackIndex = 0;

  const setTrack = (i, restoreProgress = false) => {
    scoreMode = null;
    trackIndex = clampIndex(i);
    const track = musicPlaylist[trackIndex];
    if (!track || !track.src) return;

    audio.src = track.src;
    applyVolume();
    audio.load();

    if (restoreProgress && isApplyingSavedTime && trackIndex === clampIndex(savedTrackIndex) && savedTime > 0) {
      audio.currentTime = Math.max(0, savedTime);
    } else {
      audio.currentTime = 0;
    }
    isApplyingSavedTime = false;
  };

  const setScoreTrack = () => {
    const list = SCORE_LOOPS[scoreMode];
    if (!list || !list.length) return;
    const track = list[scoreTrackIndex];
    audio.src = track;
    applyVolume();
    audio.load();
    audio.currentTime = 0;
  };

  const startScoreLoop = (mode) => {
    if (!SCORE_LOOPS[mode]) return;
    scoreMode = mode;
    scoreTrackIndex = 0;
    setScoreTrack();
    hasUserGesture = true;
    if (isMusicEnabled()) tryPlay();
  };

  const applyVolume = () => {
    const vol = VOLUME_STEPS[volumeStep];
    audio.volume = vol;
    audio.muted = vol === 0;
  };

  const isMusicEnabled = () => volumeStep > 0;

  const saveState = () => {
    try {
      localStorage.setItem(
        MUSIC_KEY,
        JSON.stringify({
          trackIndex,
          volumeStep,
          time: Number.isFinite(audio.currentTime) ? audio.currentTime : 0
        })
      );
    } catch {}
  };

  const updateUi = () => {
    if (!toggleBtn) return;
    const vol = VOLUME_STEPS[volumeStep];
    toggleBtn.textContent = VOLUME_ICONS[volumeStep];
    toggleBtn.setAttribute("aria-pressed", String(isMusicEnabled()));
    toggleBtn.setAttribute("aria-label", `Music volume: ${VOLUME_LABELS[volumeStep]}`);
    toggleBtn.title = `Volume ${VOLUME_LABELS[volumeStep]}`;
    toggleBtn.setAttribute("aria-label", `Volume ${VOLUME_LABELS[volumeStep]}%`);

    if (status) status.textContent = isMusicEnabled()
      ? `Playing: ${trackIndex + 1} (${VOLUME_LABELS[volumeStep]})`
      : "Music Off";
  };

  const tryPlay = async () => {
    if (!isMusicEnabled() || !hasUserGesture) return;
    try {
      await audio.play();
      if (status) status.textContent = "Playing";
    } catch (err) {
      console.error("Playback failed:", err);
      volumeStep = 0;  // keep enabled state as muted fallback when autoplay blocked
      applyVolume();
      if (status) status.textContent = "Tap again to enable";
      updateUi();
      saveState();
    }
  };

  const cycleVolume = () => {
    volumeStep = (volumeStep + 1) % VOLUME_STEPS.length;
    applyVolume();
    updateUi();

    if (isMusicEnabled()) {
      hasUserGesture = true;
      tryPlay();
    } else {
      audio.pause();
      if (status) status.textContent = "Music Off";
    }

    saveState();
  };

  const onFirstGesture = () => {
    if (!hasUserGesture) {
      hasUserGesture = true;
      if (isMusicEnabled()) tryPlay();
    }
  };

  setTrack(trackIndex, true);
  applyVolume();
  updateUi();

  audio.addEventListener("ended", () => {
    if (scoreMode) {
      const list = SCORE_LOOPS[scoreMode];
      if (list && list.length) {
        scoreTrackIndex = (scoreTrackIndex + 1) % list.length;
        setScoreTrack();
        tryPlay();
        return;
      }
      scoreMode = null;
    }

    setTrack(trackIndex + 1, false);
    saveState();
    tryPlay();
  });

  audio.addEventListener("timeupdate", saveState);

  if (toggleBtn) {
    toggleBtn.addEventListener("click", cycleVolume);
    toggleBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cycleVolume();
      }
    });
  }

  window.playGoodScoreMusic = () => startScoreLoop("good");
  window.playBadScoreMusic = () => startScoreLoop("bad");
  window.stopScoreMusicLoop = () => {
    scoreMode = null;
    setTrack(trackIndex, false);
  };

  window.playMusic = () => {
    hasUserGesture = true;
    setTrack(trackIndex, false);
    if (isMusicEnabled()) tryPlay();
  };
  window.playMusicPlaylist = window.playMusic;
  window.playMusicGood = window.playGoodScoreMusic;
  window.playMusicBad = window.playBadScoreMusic;

  document.addEventListener("pointerdown", onFirstGesture, { once: true, capture: true });
  document.addEventListener("keydown", onFirstGesture, { once: true, capture: true });
  window.addEventListener("beforeunload", saveState);
})();
