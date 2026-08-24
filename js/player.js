// ---- DOM refs ----
const audio = document.getElementById("audio");
const songListEl = document.getElementById("song-list");
const emptyMessageEl = document.getElementById("empty-message");
const nowPlayingEl = document.querySelector("#now-playing .np-title");
const playBtn = document.getElementById("play-btn");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const repeatBtnEl = document.getElementById("repeat-btn");
const seekBar = document.getElementById("seek-bar");
const currentTimeEl = document.getElementById("current-time");
const durationEl = document.getElementById("duration");
const playlistListEl = document.getElementById("playlist-list");
const newPlaylistBtn = document.getElementById("new-playlist-btn");
const currentViewTitleEl = document.getElementById("current-view-title");
const dropzoneEl = document.getElementById("dropzone");
const fileInputEl = document.getElementById("file-input");
const addBtnLabel = document.getElementById("add-btn-label");
const connectBtnEl = document.getElementById("connect-btn");

// ---- State ----
let library = [];
let playlists = [];
let currentView = { type: "library" };
let displayedQueue = [];
let playbackQueue = [];
let playbackIndex = -1;
let repeatMode = "none"; // "none" | "one" | "all"
let isSeeking = false;
let currentObjectUrl = null;
let signedIn = false;

function formatTime(sec) {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ---- View / rendering ----
const RECENT_DAYS = 7;

function computeDisplayedQueue() {
  if (currentView.type === "library") return library.slice();
  if (currentView.type === "recent") {
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    return library
      .filter((s) => s.createdTime && new Date(s.createdTime).getTime() >= cutoff)
      .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
  }
  const pl = playlists.find((p) => p.id === currentView.id);
  if (!pl) return [];
  return pl.songFiles.map((f) => library.find((s) => s.file === f)).filter(Boolean);
}

function highlightActiveRow() {
  const activeFile = playbackQueue[playbackIndex] ? playbackQueue[playbackIndex].file : null;
  document.querySelectorAll(".song-item").forEach((el) => {
    el.classList.toggle("active", activeFile !== null && el.dataset.file === activeFile);
  });
}

function renderPlaylistPanel() {
  playlistListEl.innerHTML = "";

  const libLi = document.createElement("li");
  libLi.className = "playlist-item" + (currentView.type === "library" ? " active" : "");
  libLi.innerHTML = `<span class="icon">${Icons.list}</span> すべての曲`;
  libLi.addEventListener("click", () => selectView({ type: "library" }));
  playlistListEl.appendChild(libLi);

  const recentLi = document.createElement("li");
  recentLi.className = "playlist-item" + (currentView.type === "recent" ? " active" : "");
  recentLi.innerHTML = `<span class="icon">${Icons.clock}</span> 今週の新着`;
  recentLi.addEventListener("click", () => selectView({ type: "recent" }));
  playlistListEl.appendChild(recentLi);

  playlists.forEach((pl) => {
    const li = document.createElement("li");
    li.className =
      "playlist-item" + (currentView.type === "playlist" && currentView.id === pl.id ? " active" : "");

    const name = document.createElement("span");
    name.className = "playlist-name";
    name.textContent = pl.name;
    name.addEventListener("click", () => selectView({ type: "playlist", id: pl.id }));

    const actions = document.createElement("span");
    actions.className = "playlist-actions";

    const renameBtn = document.createElement("button");
    renameBtn.className = "icon-btn small";
    renameBtn.innerHTML = `<span class="icon">${Icons.edit}</span>`;
    renameBtn.title = "名前を変更";
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      renamePlaylist(pl.id);
    });

    const delBtn = document.createElement("button");
    delBtn.className = "icon-btn small";
    delBtn.innerHTML = `<span class="icon">${Icons.trash}</span>`;
    delBtn.title = "削除";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deletePlaylist(pl.id);
    });

    actions.appendChild(renameBtn);
    actions.appendChild(delBtn);
    li.appendChild(name);
    li.appendChild(actions);
    playlistListEl.appendChild(li);
  });
}

function renderSongList() {
  displayedQueue = computeDisplayedQueue();
  songListEl.innerHTML = "";
  const isPlaylistView = currentView.type === "playlist";

  if (displayedQueue.length === 0) {
    emptyMessageEl.style.display = "block";
    if (!signedIn) {
      emptyMessageEl.textContent = "「🔐 Googleでログイン」してください。";
    } else if (isPlaylistView) {
      emptyMessageEl.textContent = "このプレイリストにはまだ曲がありません。「すべての曲」から追加してください。";
    } else if (currentView.type === "recent") {
      emptyMessageEl.textContent = `直近${RECENT_DAYS}日以内に追加された曲はありません。`;
    } else {
      emptyMessageEl.textContent = "曲がありません。上の「＋ 曲を追加」またはドラッグ&ドロップで追加してください。";
    }
  } else {
    emptyMessageEl.style.display = "none";
  }

  displayedQueue.forEach((song, i) => {
    const li = document.createElement("li");
    li.className = "song-item";
    li.dataset.file = song.file;

    if (isPlaylistView) {
      li.draggable = true;
      li.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", song.file);
        e.dataTransfer.effectAllowed = "move";
      });
      li.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        li.classList.add("drag-over");
      });
      li.addEventListener("dragleave", () => li.classList.remove("drag-over"));
      li.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        li.classList.remove("drag-over");
        const draggedFile = e.dataTransfer.getData("text/plain");
        if (draggedFile && draggedFile !== song.file) {
          reorderPlaylist(currentView.id, draggedFile, song.file);
        }
      });
    }

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.innerHTML = isPlaylistView ? `<span class="icon">${Icons.grip}</span>` : "";

    const index = document.createElement("div");
    index.className = "song-index";
    index.textContent = i + 1;

    const info = document.createElement("div");
    info.className = "song-info";
    const title = document.createElement("div");
    title.className = "song-title";
    title.textContent = song.title || song.file;
    info.appendChild(title);
    if (song.artist) {
      const artist = document.createElement("div");
      artist.className = "song-artist";
      artist.textContent = song.artist;
      info.appendChild(artist);
    }

    const action = document.createElement("div");
    action.className = "song-action";
    if (isPlaylistView) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "icon-btn";
      removeBtn.innerHTML = `<span class="icon">${Icons.x}</span>`;
      removeBtn.title = "プレイリストから削除";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeFromPlaylist(currentView.id, song.file);
      });
      action.appendChild(removeBtn);
    } else {
      const select = document.createElement("select");
      select.className = "add-to-playlist";
      const defaultOpt = document.createElement("option");
      defaultOpt.textContent = playlists.length ? "+ プレイリストに追加" : "プレイリストなし";
      defaultOpt.value = "";
      select.appendChild(defaultOpt);
      playlists.forEach((pl) => {
        const opt = document.createElement("option");
        opt.value = pl.id;
        opt.textContent = pl.name;
        select.appendChild(opt);
      });
      select.disabled = playlists.length === 0;
      select.addEventListener("click", (e) => e.stopPropagation());
      select.addEventListener("change", () => {
        if (select.value) {
          addToPlaylist(select.value, song.file);
          select.value = "";
        }
      });
      action.appendChild(select);
    }

    li.appendChild(handle);
    li.appendChild(index);
    li.appendChild(info);
    li.appendChild(action);

    li.addEventListener("click", () => playAt(i));
    songListEl.appendChild(li);
  });

  highlightActiveRow();
}

function selectView(view) {
  currentView = view;
  if (view.type === "library") {
    currentViewTitleEl.textContent = "すべての曲";
  } else if (view.type === "recent") {
    currentViewTitleEl.textContent = `🆕 今週の新着（直近${RECENT_DAYS}日）`;
  } else {
    const pl = playlists.find((p) => p.id === view.id);
    currentViewTitleEl.textContent = pl ? pl.name : "";
  }
  renderPlaylistPanel();
  renderSongList();
}

// ---- Playlist CRUD ----
function createPlaylist() {
  const name = prompt("新しいプレイリストの名前を入力してください");
  if (!name || !name.trim()) return;
  const pl = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name.trim(), songFiles: [] };
  playlists.push(pl);
  Drive.savePlaylists(playlists);
  selectView({ type: "playlist", id: pl.id });
}

function renamePlaylist(id) {
  const pl = playlists.find((p) => p.id === id);
  if (!pl) return;
  const name = prompt("新しい名前を入力してください", pl.name);
  if (!name || !name.trim()) return;
  pl.name = name.trim();
  Drive.savePlaylists(playlists);
  selectView(currentView);
}

function deletePlaylist(id) {
  const pl = playlists.find((p) => p.id === id);
  if (!pl) return;
  if (!confirm(`「${pl.name}」を削除しますか？`)) return;
  playlists = playlists.filter((p) => p.id !== id);
  Drive.savePlaylists(playlists);
  if (currentView.type === "playlist" && currentView.id === id) {
    selectView({ type: "library" });
  } else {
    renderPlaylistPanel();
  }
}

function addToPlaylist(playlistId, file) {
  const pl = playlists.find((p) => p.id === playlistId);
  if (!pl) return;
  if (!pl.songFiles.includes(file)) {
    pl.songFiles.push(file);
    Drive.savePlaylists(playlists);
  }
}

function removeFromPlaylist(playlistId, file) {
  const pl = playlists.find((p) => p.id === playlistId);
  if (!pl) return;
  pl.songFiles = pl.songFiles.filter((f) => f !== file);
  Drive.savePlaylists(playlists);
  renderSongList();
}

function reorderPlaylist(playlistId, draggedFile, targetFile) {
  const pl = playlists.find((p) => p.id === playlistId);
  if (!pl) return;
  const fromIdx = pl.songFiles.indexOf(draggedFile);
  if (fromIdx === -1) return;
  pl.songFiles.splice(fromIdx, 1);
  const toIdx = pl.songFiles.indexOf(targetFile);
  pl.songFiles.splice(toIdx === -1 ? pl.songFiles.length : toIdx, 0, draggedFile);
  Drive.savePlaylists(playlists);
  renderSongList();
}

// ---- Adding files ----
async function handleFiles(fileList) {
  if (!signedIn) {
    alert("曲を追加するには、まず「🔐 Googleでログイン」してください。");
    return;
  }
  const added = await Drive.uploadFiles(fileList);
  if (added.length === 0) return;
  library.push(...added);
  if (currentView.type === "playlist") {
    const pl = playlists.find((p) => p.id === currentView.id);
    if (pl) {
      added.forEach((s) => {
        if (!pl.songFiles.includes(s.file)) pl.songFiles.push(s.file);
      });
      await Drive.savePlaylists(playlists);
    }
  }
  renderSongList();
}

// ---- Playback ----
function playAt(displayIndex) {
  playbackQueue = displayedQueue.slice();
  playbackIndex = displayIndex;
  playCurrent();
}

function playAtQueueIndex(index) {
  playbackIndex = index;
  playCurrent();
}

async function playCurrent() {
  const song = playbackQueue[playbackIndex];
  if (!song) return;
  nowPlayingEl.textContent = `${song.title} を読み込み中...`;
  highlightActiveRow();
  try {
    const url = await Drive.fetchAudioObjectUrl(song.id);
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = url;
    audio.src = url;
    await audio.play();
    nowPlayingEl.textContent = song.artist ? `${song.title} - ${song.artist}` : song.title;
    document.title = `▶ ${song.title} | My BroadCast`;
  } catch (e) {
    nowPlayingEl.textContent = `${song.title} の再生に失敗しました`;
  }
}

function togglePlay() {
  if (playbackIndex === -1) {
    if (displayedQueue.length > 0) playAt(0);
    return;
  }
  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
}

const REPEAT_CYCLE = ["none", "all", "one"];
function setRepeatMode(mode) {
  repeatMode = mode;
  repeatBtnEl.classList.remove("repeat-off", "repeat-all", "repeat-one");
  if (mode === "none") {
    repeatBtnEl.innerHTML = `<span class="icon">${Icons.repeat}</span>`;
    repeatBtnEl.classList.add("repeat-off");
    repeatBtnEl.title = "繰り返し: なし";
  } else if (mode === "all") {
    repeatBtnEl.innerHTML = `<span class="icon">${Icons.repeat}</span>`;
    repeatBtnEl.classList.add("repeat-all");
    repeatBtnEl.title = "繰り返し: 全曲";
  } else {
    repeatBtnEl.innerHTML = `<span class="icon">${Icons.repeatOne}</span>`;
    repeatBtnEl.classList.add("repeat-one");
    repeatBtnEl.title = "繰り返し: 1曲";
  }
}

audio.addEventListener("play", () => {
  playBtn.innerHTML = `<span class="icon">${Icons.pause}</span>`;
});
audio.addEventListener("pause", () => {
  playBtn.innerHTML = `<span class="icon">${Icons.play}</span>`;
});
audio.addEventListener("ended", () => {
  if (repeatMode === "one") {
    audio.currentTime = 0;
    audio.play();
    return;
  }
  const isLast = playbackIndex >= playbackQueue.length - 1;
  if (isLast && repeatMode !== "all") {
    playBtn.innerHTML = `<span class="icon">${Icons.play}</span>`;
    return;
  }
  playAtQueueIndex((playbackIndex + 1) % playbackQueue.length);
});
audio.addEventListener("timeupdate", () => {
  if (isSeeking) return;
  seekBar.value = audio.currentTime;
  currentTimeEl.textContent = formatTime(audio.currentTime);
});
audio.addEventListener("loadedmetadata", () => {
  seekBar.max = audio.duration;
  durationEl.textContent = formatTime(audio.duration);
});

seekBar.addEventListener("input", () => {
  isSeeking = true;
  currentTimeEl.textContent = formatTime(seekBar.value);
});
seekBar.addEventListener("change", () => {
  audio.currentTime = seekBar.value;
  isSeeking = false;
});

playBtn.addEventListener("click", togglePlay);
prevBtn.addEventListener("click", () => {
  if (playbackQueue.length === 0) return;
  playAtQueueIndex((playbackIndex - 1 + playbackQueue.length) % playbackQueue.length);
});
nextBtn.addEventListener("click", () => {
  if (playbackQueue.length === 0) return;
  playAtQueueIndex((playbackIndex + 1) % playbackQueue.length);
});
repeatBtnEl.addEventListener("click", () => {
  const idx = REPEAT_CYCLE.indexOf(repeatMode);
  setRepeatMode(REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length]);
});
setRepeatMode("none");

newPlaylistBtn.addEventListener("click", createPlaylist);

// ---- Drag & drop / file picker to add songs ----
let dragCounter = 0;
dropzoneEl.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer.types.includes("Files")) return;
  e.preventDefault();
  dragCounter++;
  dropzoneEl.classList.add("drag-active");
});
dropzoneEl.addEventListener("dragover", (e) => {
  if (!e.dataTransfer.types.includes("Files")) return;
  e.preventDefault();
});
dropzoneEl.addEventListener("dragleave", () => {
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) dropzoneEl.classList.remove("drag-active");
});
dropzoneEl.addEventListener("drop", (e) => {
  if (!e.dataTransfer.types.includes("Files")) return;
  e.preventDefault();
  dragCounter = 0;
  dropzoneEl.classList.remove("drag-active");
  handleFiles(e.dataTransfer.files);
});

addBtnLabel.addEventListener("click", (e) => {
  if (!signedIn) {
    e.preventDefault();
    alert("曲を追加するには、まず「🔐 Googleでログイン」してください。");
  }
});
fileInputEl.addEventListener("change", () => {
  if (fileInputEl.files.length) handleFiles(fileInputEl.files);
  fileInputEl.value = "";
});

// ---- Google sign-in ----
function setConnectUI(mode) {
  connectBtnEl.classList.remove("state-none", "state-connected", "state-loading", "state-error");
  if (mode === "connected") {
    connectBtnEl.classList.add("state-connected");
    connectBtnEl.title = "ログイン中";
    connectBtnEl.innerHTML = `<span class="icon">${Icons.checkCircle}</span>`;
  } else if (mode === "loading") {
    connectBtnEl.classList.add("state-loading");
    connectBtnEl.title = "読み込み中...";
    connectBtnEl.innerHTML = `<span class="icon">${Icons.lock}</span>`;
  } else if (mode === "error") {
    connectBtnEl.classList.add("state-error");
    connectBtnEl.title = "ログインに失敗しました（クリックして再試行）";
    connectBtnEl.innerHTML = `<span class="icon">${Icons.alertTriangle}</span>`;
  } else {
    connectBtnEl.classList.add("state-none");
    connectBtnEl.title = "Googleでログイン";
    connectBtnEl.innerHTML = `<span class="icon">${Icons.lock}</span>`;
  }
}

async function loadFromDrive() {
  setConnectUI("loading");
  try {
    library = await Drive.getLibrary();
    playlists = await Drive.getPlaylists();
    signedIn = true;
    setConnectUI("connected");
    selectView({ type: "library" });
  } catch (e) {
    signedIn = false;
    setConnectUI("error");
  }
}

let autoSignInAttempt = false;

connectBtnEl.addEventListener("click", () => {
  if (!Drive.tokenClient) return;
  autoSignInAttempt = false;
  Drive.signIn();
});

function onGisLoad() {
  Drive.initTokenClient((token) => {
    if (token) {
      loadFromDrive();
      return;
    }
    if (autoSignInAttempt) {
      // ページを開いた直後の自動ログイン試行が失敗しても、エラー扱いにはしない
      autoSignInAttempt = false;
      setConnectUI("none");
    } else {
      setConnectUI("error");
    }
  });
  autoSignInAttempt = true;
  Drive.signIn();
}

setConnectUI("none");
selectView({ type: "library" });
