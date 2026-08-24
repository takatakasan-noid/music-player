const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const SCOPES = "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file";
const AUDIO_EXT = [".mp3", ".m4a", ".wav", ".ogg", ".aac", ".flac", ".webm"];
const PLAYLISTS_FILE_NAME = "playlists.json";

const Drive = {
  accessToken: null,
  tokenClient: null,
  playlistsFileId: null,

  isAudioName(name) {
    const n = name.toLowerCase();
    return AUDIO_EXT.some((ext) => n.endsWith(ext));
  },

  initTokenClient(onToken) {
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) {
          onToken(null);
          return;
        }
        this.accessToken = resp.access_token;
        onToken(this.accessToken);
      },
    });
  },

  signIn() {
    // 初回は同意画面が必要な分だけ表示され、許可済みなら自動で（無言で）ログインされる
    this.tokenClient.requestAccessToken({ prompt: "" });
  },

  async apiFetch(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${this.accessToken}`,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Drive API error ${res.status}: ${text}`);
    }
    return res;
  },

  async listFiles() {
    const q = encodeURIComponent(`'${CONFIG.FOLDER_ID}' in parents and trashed = false`);
    const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime,createdTime)");
    const orderBy = encodeURIComponent("modifiedTime desc");
    const url = `${DRIVE_API}/files?q=${q}&fields=${fields}&orderBy=${orderBy}&pageSize=1000`;
    const res = await this.apiFetch(url);
    const data = await res.json();
    return data.files || [];
  },

  async getLibrary() {
    const files = await this.listFiles();
    this.playlistsFileId = null;
    const songs = [];
    for (const f of files) {
      if (f.name === PLAYLISTS_FILE_NAME) {
        this.playlistsFileId = f.id;
        continue;
      }
      if (!this.isAudioName(f.name)) continue;
      const dot = f.name.lastIndexOf(".");
      const title = dot === -1 ? f.name : f.name.slice(0, dot);
      songs.push({ id: f.id, title, artist: "", file: f.name, createdTime: f.createdTime });
    }
    return songs;
  },

  async getPlaylists() {
    if (!this.playlistsFileId) {
      return [];
    }
    try {
      const res = await this.apiFetch(`${DRIVE_API}/files/${this.playlistsFileId}?alt=media`);
      return await res.json();
    } catch (e) {
      return [];
    }
  },

  async savePlaylists(playlists) {
    const body = JSON.stringify(playlists, null, 2);
    if (this.playlistsFileId) {
      await this.apiFetch(`${DRIVE_UPLOAD_API}/files/${this.playlistsFileId}?uploadType=media`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
      });
      return;
    }
    const metadata = { name: PLAYLISTS_FILE_NAME, parents: [CONFIG.FOLDER_ID] };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([body], { type: "application/json" }));
    const res = await this.apiFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    this.playlistsFileId = data.id;
  },

  async fetchAudioObjectUrl(fileId) {
    const res = await this.apiFetch(`${DRIVE_API}/files/${fileId}?alt=media`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  async uploadFiles(fileList) {
    const uploaded = [];
    for (const file of Array.from(fileList)) {
      if (!this.isAudioName(file.name)) continue;
      const metadata = { name: file.name, parents: [CONFIG.FOLDER_ID] };
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      form.append("file", file);
      const res = await this.apiFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,createdTime`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      const dot = data.name.lastIndexOf(".");
      const title = dot === -1 ? data.name : data.name.slice(0, dot);
      uploaded.push({ id: data.id, title, artist: "", file: data.name, createdTime: data.createdTime });
    }
    return uploaded;
  },
};
