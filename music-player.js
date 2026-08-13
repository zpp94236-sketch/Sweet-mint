/* =========================================================
 * 甜薄荷 · 音响（音乐播放器）
 * Phase 1: 首页 + 歌曲列表 + 迷你播放条 + 播放功能
 * ========================================================= */
(function () {
    'use strict';

    // ===== 播放器状态 =====
    const player = {
        audio: new Audio(),
        current: null,      // 当前播放的 track 对象
        playlist: [],       // 当前播放队列
        index: 0,
        playing: false,
        duration: 0,
        currentTime: 0,
        mode: 'sequence'    // sequence / shuffle / repeat
    };

    // 缓存
    let musicCache = {
        tracks: [],
        likes: [],
        history: [],
        recommendation: null,
        loaded: false,
        loading: false
    };

    // ===== Audio 事件绑定 =====
    player.audio.addEventListener('timeupdate', () => {
        player.currentTime = player.audio.currentTime;
        player.duration = player.audio.duration || 0;
        updateMiniBar();
    });
    player.audio.addEventListener('ended', () => {
        playNext();
    });
    player.audio.addEventListener('play', () => {
        player.playing = true;
        updateMiniBar();
    });
    player.audio.addEventListener('pause', () => {
        player.playing = false;
        updateMiniBar();
    });

    // ===== 数据加载 =====
    async function loadMusicData(force) {
        if (musicCache.loading) return;
        if (musicCache.loaded && !force) return;
        if (!isSupabaseConfigured()) { musicCache.loaded = true; return; }
        musicCache.loading = true;
        try {
            const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
            const h = getSupabaseHeaders();
            const [tracksRes, likesRes, historyRes, recRes] = await Promise.all([
                fetch(base + '/rest/v1/music_tracks?select=*&order=created_at.desc&limit=200', { headers: h }),
                fetch(base + '/rest/v1/music_likes?select=*', { headers: h }),
                fetch(base + '/rest/v1/music_play_history?select=*,music_tracks(*)&order=played_at.desc&limit=20', { headers: h }),
                fetch(base + '/rest/v1/music_recommendations?select=*,music_tracks(*)&order=recommended_at.desc&limit=1', { headers: h })
            ]);
            musicCache.tracks = tracksRes.ok ? await tracksRes.json() : [];
            musicCache.likes = likesRes.ok ? await likesRes.json() : [];
            musicCache.history = historyRes.ok ? await historyRes.json() : [];
            const recs = recRes.ok ? await recRes.json() : [];
            musicCache.recommendation = recs.length ? recs[0] : null;
            musicCache.loaded = true;
        } catch (e) {
            console.warn('音乐数据加载失败:', e);
            musicCache.loaded = true;
        } finally {
            musicCache.loading = false;
        }
    }

    function isLiked(trackId, who) {
        return musicCache.likes.some(l => l.track_id === trackId && l.liked_by === who);
    }

    async function toggleLike(trackId, who) {
        if (!isSupabaseConfigured()) return;
        const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
        const h = getSupabaseHeaders();
        const existing = musicCache.likes.find(l => l.track_id === trackId && l.liked_by === who);
        if (existing) {
            await fetch(base + '/rest/v1/music_likes?id=eq.' + existing.id, { method: 'DELETE', headers: h });
            musicCache.likes = musicCache.likes.filter(l => l.id !== existing.id);
        } else {
            const res = await fetch(base + '/rest/v1/music_likes', {
                method: 'POST',
                headers: Object.assign({}, h, { 'Prefer': 'return=representation' }),
                body: JSON.stringify({ track_id: trackId, liked_by: who })
            });
            if (res.ok) {
                const data = await res.json();
                musicCache.likes.push(data[0] || data);
            }
        }
    }

    async function recordPlay(trackId) {
        if (!isSupabaseConfigured()) return;
        const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
        const h = Object.assign({}, getSupabaseHeaders(), { 'Prefer': 'return=minimal' });
        fetch(base + '/rest/v1/music_play_history', {
            method: 'POST', headers: h,
            body: JSON.stringify({ track_id: trackId })
        }).catch(() => {});
    }

    // ===== 播放控制 =====
    function playTrack(track, queue) {
        if (!track || !track.file_url) return;
        player.current = track;
        if (queue) {
            player.playlist = queue;
            player.index = queue.findIndex(t => t.id === track.id);
        }
        player.audio.src = track.file_url;
        player.audio.play().catch(() => {});
        player.playing = true;
        recordPlay(track.id);
        updateMiniBar();
        updatePlayingHighlight();
    }

    function togglePlay() {
        if (!player.current) return;
        if (player.playing) player.audio.pause();
        else player.audio.play().catch(() => {});
    }

    function playNext() {
        if (!player.playlist.length) return;
        if (player.mode === 'repeat') {
            player.audio.currentTime = 0;
            player.audio.play().catch(() => {});
            return;
        }
        if (player.mode === 'shuffle') {
            player.index = Math.floor(Math.random() * player.playlist.length);
        } else {
            player.index = (player.index + 1) % player.playlist.length;
        }
        playTrack(player.playlist[player.index]);
    }

    function playPrev() {
        if (!player.playlist.length) return;
        if (player.mode === 'shuffle') {
            player.index = Math.floor(Math.random() * player.playlist.length);
        } else {
            player.index = (player.index - 1 + player.playlist.length) % player.playlist.length;
        }
        playTrack(player.playlist[player.index]);
    }

    function seekTo(percent) {
        if (!player.duration) return;
        player.audio.currentTime = player.duration * percent;
    }

    function formatDuration(sec) {
        if (!sec || isNaN(sec)) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return m + ':' + String(s).padStart(2, '0');
    }

    // ===== 迷你播放条 =====
    function updateMiniBar() {
        const bar = document.getElementById('musicMiniBar');
        if (!bar) return;
        if (!player.current) { bar.style.display = 'none'; return; }
        bar.style.display = 'flex';
        const progress = player.duration ? (player.currentTime / player.duration * 100) : 0;
        bar.innerHTML =
            '<div class="mini-bar-progress" style="width:' + progress.toFixed(1) + '%"></div>' +
            '<img class="mini-bar-cover" src="' + (player.current.cover_url || '') + '" onerror="this.style.display=\'none\'">' +
            '<div class="mini-bar-info">' +
                '<div class="mini-bar-title">' + escapeHtml(player.current.title) + '</div>' +
                '<div class="mini-bar-artist">' + escapeHtml(player.current.artist || '') + '</div>' +
            '</div>' +
            '<button class="mini-bar-btn" onclick="window._musicPlayer.playPrev()"><i data-lucide="skip-back"></i></button>' +
            '<button class="mini-bar-btn mini-bar-play" onclick="window._musicPlayer.togglePlay()"><i data-lucide="' + (player.playing ? 'pause' : 'play') + '"></i></button>' +
            '<button class="mini-bar-btn" onclick="window._musicPlayer.playNext()"><i data-lucide="skip-forward"></i></button>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function updatePlayingHighlight() {
        document.querySelectorAll('.music-track-item').forEach(el => {
            el.classList.toggle('now-playing', el.dataset.id === (player.current && player.current.id));
        });
    }

    // ===== 页面渲染 =====
    function renderMusicHome() {
        const allCount = musicCache.tracks.length;
        const userLikes = musicCache.likes.filter(l => l.liked_by === 'user').length;
        const aiLikes = musicCache.likes.filter(l => l.liked_by === 'ai').length;
        const rec = musicCache.recommendation;

        // 推荐卡片
        let recHtml = '';
        if (rec && rec.music_tracks) {
            const t = rec.music_tracks;
            recHtml = '<div class="music-rec-card" onclick="window._musicPlayer.playTrackById(\'' + t.id + '\')">' +
                '<div class="music-rec-left">' +
                    '<div class="music-rec-label">🎵 晏晏今天推荐</div>' +
                    '<div class="music-rec-title">' + escapeHtml(t.title) + '</div>' +
                    '<div class="music-rec-artist">' + escapeHtml(t.artist || '') + '</div>' +
                    (rec.message ? '<div class="music-rec-msg">"' + escapeHtml(rec.message) + '"</div>' : '') +
                '</div>' +
                '<div class="music-rec-play">▶</div>' +
            '</div>';
        }

        // 四个入口
        const entries = [
            { icon: '🎵', name: '全部音乐', count: allCount, view: 'musicAll' },
            { icon: '❤️', name: '我的喜欢', count: userLikes, view: 'musicUserLikes' },
            { icon: '💜', name: '晏晏喜欢', count: aiLikes, view: 'musicAiLikes' },
            { icon: '📁', name: '歌单列表', count: '', view: 'musicPlaylists' }
        ];
        const entriesHtml = '<div class="music-entries">' + entries.map(e =>
            '<div class="music-entry" onclick="bedroomGo(\'' + e.view + '\',{})">' +
                '<div class="music-entry-icon">' + e.icon + '</div>' +
                '<div class="music-entry-name">' + e.name + '</div>' +
                (e.count !== '' ? '<div class="music-entry-count">' + e.count + '</div>' : '') +
            '</div>'
        ).join('') + '</div>';

        // Storage 同步按钮
        const syncBtn = '<button class="btn-secondary" style="width:100%;justify-content:center;margin-bottom:16px;" onclick="window._musicPlayer.syncFromStorage()">🔄 从 Storage 同步歌曲</button>';

        // 最近播放
        const history = musicCache.history.slice(0, 6);
        let historyHtml = '';
        if (history.length) {
            historyHtml = '<div class="music-section-head"><span class="music-section-title">最近播放</span><button class="music-play-all-btn" onclick="window._musicPlayer.playAll(\'history\')">▶ 播放全部</button></div>' +
                '<div class="music-track-list">' + history.map(h => {
                    const t = h.music_tracks;
                    if (!t) return '';
                    return renderTrackItem(t);
                }).join('') + '</div>';
        }

        return '<div class="music-home">' +
            '<div class="music-home-header"><span class="music-home-title">Music</span></div>' +
            recHtml +
            entriesHtml +
            syncBtn +
            historyHtml +
            '<div id="musicMiniBar" class="music-mini-bar" style="display:none;"></div>' +
        '</div>';
    }

    function renderTrackItem(t) {
        const isPlaying = player.current && player.current.id === t.id;
        return '<div class="music-track-item' + (isPlaying ? ' now-playing' : '') + '" data-id="' + t.id + '" onclick="window._musicPlayer.playTrackById(\'' + t.id + '\')">' +
            '<img class="music-track-cover" src="' + (t.cover_url || '') + '" onerror="this.classList.add(\'no-cover\')">' +
            '<div class="music-track-info">' +
                '<div class="music-track-title">' + escapeHtml(t.title) + '</div>' +
                '<div class="music-track-artist">' + escapeHtml(t.artist || '') + '</div>' +
            '</div>' +
            '<button class="music-track-like" onclick="event.stopPropagation();window._musicPlayer.handleLike(\'' + t.id + '\')">' +
                (isLiked(t.id, 'user') ? '❤️' : '♡') +
            '</button>' +
        '</div>';
    }

    function renderTrackList(title, tracks) {
        if (!tracks.length) return '<div class="bedroom-empty">还没有歌曲</div>';
        return '<div class="music-section-head"><span class="music-section-title">' + escapeHtml(title) + '</span><button class="music-play-all-btn" onclick="window._musicPlayer.playAll(\'current\')">▶ 播放全部</button></div>' +
            '<div class="music-track-list">' + tracks.map(t => renderTrackItem(t)).join('') + '</div>' +
            '<div id="musicMiniBar" class="music-mini-bar" style="display:none;"></div>';
    }

    // ===== 页面路由 =====
    function renderMusicPage(view) {
        if (view === 'musicHome') return renderMusicHome();
        if (view === 'musicAll') {
            window._musicPlayer._currentList = musicCache.tracks;
            return renderTrackList('全部音乐 · ' + musicCache.tracks.length + ' 首', musicCache.tracks);
        }
        if (view === 'musicUserLikes') {
            const liked = musicCache.tracks.filter(t => isLiked(t.id, 'user'));
            window._musicPlayer._currentList = liked;
            return renderTrackList('我的喜欢 · ' + liked.length + ' 首', liked);
        }
        if (view === 'musicAiLikes') {
            const liked = musicCache.tracks.filter(t => isLiked(t.id, 'ai'));
            window._musicPlayer._currentList = liked;
            return renderTrackList('晏晏喜欢 · ' + liked.length + ' 首', liked);
        }
        if (view === 'musicPlaylists') {
            return '<div class="bedroom-empty">歌单功能即将上线～</div>' +
                '<div id="musicMiniBar" class="music-mini-bar" style="display:none;"></div>';
        }
        return '';
    }

    // ===== 交互 =====
    function playTrackById(id) {
        const track = musicCache.tracks.find(t => t.id === id);
        if (!track) return;
        const queue = window._musicPlayer._currentList || musicCache.tracks;
        playTrack(track, queue);
    }

    function playAll(source) {
        let queue = [];
        if (source === 'history') {
            queue = musicCache.history.map(h => h.music_tracks).filter(Boolean);
        } else {
            queue = window._musicPlayer._currentList || musicCache.tracks;
        }
        if (queue.length) playTrack(queue[0], queue);
    }

    async function handleLike(trackId) {
        await toggleLike(trackId, 'user');
        // 重新渲染当前页
        const content = document.getElementById('bedroomContent');
        if (content) {
            const view = bedroomStack[bedroomStack.length - 1];
            if (view && view.startsWith('music')) {
                content.innerHTML = renderMusicPage(view);
                updateMiniBar();
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
    }

    // ===== 上传功能 =====
    function renderUploadForm() {
        return '<div class="music-upload-form">' +
            '<div class="form-group"><label>选择音频文件</label><input type="file" id="musicFileInput" accept=".mp3,.flac,.wav,.ogg,.m4a"></div>' +
            '<div class="form-group"><label>歌名</label><input type="text" id="musicTitleInput" placeholder="歌曲名称"></div>' +
            '<div class="form-group"><label>歌手</label><input type="text" id="musicArtistInput" placeholder="歌手名"></div>' +
            '<div class="form-group"><label>专辑（可选）</label><input type="text" id="musicAlbumInput" placeholder="专辑名"></div>' +
            '<button class="btn-primary bedroom-save-btn" onclick="window._musicPlayer.uploadTrack()">上传</button>' +
        '</div>';
    }

    async function uploadTrack() {
        const fileInput = document.getElementById('musicFileInput');
        const title = document.getElementById('musicTitleInput').value.trim();
        const artist = document.getElementById('musicArtistInput').value.trim();
        const album = document.getElementById('musicAlbumInput').value.trim();

        if (!fileInput.files[0]) { alert('请选择音频文件'); return; }
        if (!title) { alert('请填写歌名'); return; }

        const file = fileInput.files[0];
        const fileName = Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.' + file.name.split('.').pop();

        if (!isSupabaseConfigured()) { alert('请先配置云端同步'); return; }
        const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
        const key = state.memorySystem.settings.supabaseKey;

        showToast('上传中...');

        try {
            // 上传文件到 Storage
            const uploadRes = await fetch(base + '/storage/v1/object/music/' + fileName, {
                method: 'POST',
                headers: {
                    'apikey': key,
                    'Authorization': 'Bearer ' + key,
                    'Content-Type': file.type || 'audio/mpeg'
                },
                body: file
            });
            if (!uploadRes.ok) throw new Error('文件上传失败 HTTP ' + uploadRes.status);

            const fileUrl = base + '/storage/v1/object/public/music/' + fileName;

            // 写入数据库
            const h = Object.assign({}, getSupabaseHeaders(), { 'Prefer': 'return=representation' });
            const dbRes = await fetch(base + '/rest/v1/music_tracks', {
                method: 'POST', headers: h,
                body: JSON.stringify({ title, artist, album, file_url: fileUrl })
            });
            if (!dbRes.ok) throw new Error('数据库写入失败');

            showToast('上传成功！');
            await loadMusicData(true);
            bedroomStack = bedroomStack.slice(0, -1);
            bedroomStack.push('musicHome');
            renderBedroom();
        } catch (e) {
            alert('上传失败: ' + e.message);
        }
    }

    async function syncFromStorage() {
        if (!isSupabaseConfigured()) { alert('请先配置云端同步'); return; }
        const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
        const key = state.memorySystem.settings.supabaseKey;

        showToast('正在扫描...');
        try {
            // 列出 Storage 中 music bucket 的所有文件
            const res = await fetch(base + '/storage/v1/object/list/music', {
                method: 'POST',
                headers: {
                    'apikey': key,
                    'Authorization': 'Bearer ' + key,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prefix: '', limit: 500, offset: 0, sortBy: { column: 'name', order: 'asc' } })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const files = await res.json();

            // 获取已有记录的 file_url
            const existing = new Set(musicCache.tracks.map(t => t.file_url));

            let added = 0;
            const h = Object.assign({}, getSupabaseHeaders(), { 'Prefer': 'return=minimal' });

            for (const f of files) {
                if (!f.name || f.name.startsWith('.')) continue;
                const fileUrl = base + '/storage/v1/object/public/music/' + encodeURIComponent(f.name);
                if (existing.has(fileUrl)) continue;

                // 从文件名解析歌手和歌名（格式：Artist - Title.mp3）
                const nameNoExt = f.name.replace(/\.[^.]+$/, '');
                let title = nameNoExt, artist = '';
                const sep = nameNoExt.indexOf(' - ');
                if (sep > 0) {
                    artist = nameNoExt.slice(0, sep).trim();
                    title = nameNoExt.slice(sep + 3).trim();
                }

                await fetch(base + '/rest/v1/music_tracks', {
                    method: 'POST', headers: h,
                    body: JSON.stringify({ title, artist, file_url: fileUrl })
                });
                added++;
            }

            showToast('扫描完成，新增 ' + added + ' 首');
            await loadMusicData(true);
            const content = document.getElementById('bedroomContent');
            if (content) {
                content.innerHTML = renderMusicHome();
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        } catch (e) {
            alert('扫描失败: ' + e.message);
        }
    }

    // ===== 暴露接口 =====
    window._musicPlayer = {
        loadData: loadMusicData,
        renderPage: renderMusicPage,
        renderUpload: renderUploadForm,
        playTrackById,
        playAll,
        togglePlay,
        playNext,
        playPrev,
        handleLike,
        uploadTrack,
        syncFromStorage,
        getPlayer: () => player,
        _currentList: null
    };

})();
