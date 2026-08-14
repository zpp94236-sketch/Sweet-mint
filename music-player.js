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
        // 如果全屏播放页打开着，切歌时重新渲染
        if (fullscreenOpen) {
            lyricsData = parseLrc(player.current.lyrics);
            currentLyricIdx = -1;
            renderFullscreenPlayer();
        }
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

    function iconPlay() { return '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; }
    function iconPause() { return '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>'; }
    function iconPrev() { return '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm12 0l-10 6 10 6z"/></svg>'; }
    function iconNext() { return '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l10-6L6 6z"/></svg>'; }
    function iconPlayBig() { return '<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; }
    function iconPauseBig() { return '<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>'; }

    // ===== 迷你播放条 =====
    function updateMiniBar() {
        const bar = document.getElementById('musicMiniBar');
        if (!bar) return;
        if (!player.current) { bar.style.display = 'none'; return; }
        bar.style.display = 'flex';
        const progress = player.duration ? (player.currentTime / player.duration * 100) : 0;

        // 只在歌曲切换时重建 DOM，否则只更新进度和按钮状态
        if (bar.dataset.trackId !== player.current.id) {
            bar.dataset.trackId = player.current.id;
            bar.innerHTML =
                '<div class="mini-bar-progress" id="miniBarProgress" style="width:' + progress.toFixed(1) + '%"></div>' +
                '<img class="mini-bar-cover" src="' + (player.current.cover_url || '') + '" onerror="this.style.display=\'none\'">' +
                '<div class="mini-bar-info" onclick="window._musicPlayer.openFullscreen()">' +
                    '<div class="mini-bar-title">' + escapeHtml(player.current.title) + '</div>' +
                    '<div class="mini-bar-artist">' + escapeHtml(player.current.artist || '') + '</div>' +
                '</div>' +
                '<button class="mini-bar-btn" onclick="window._musicPlayer.playPrev()"><i data-lucide="skip-back"></i></button>' +
                '<button class="mini-bar-btn mini-bar-play" id="miniBarPlayBtn" data-icon="' + (player.playing ? 'pause' : 'play') + '" onclick="window._musicPlayer.togglePlay()">' + (player.playing ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>' : '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>') + '</button>' +
                '<button class="mini-bar-btn" onclick="window._musicPlayer.playNext()"><i data-lucide="skip-forward"></i></button>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } else {
            // 只更新进度条
            const prog = document.getElementById('miniBarProgress');
            if (prog) prog.style.width = progress.toFixed(1) + '%';
            // 更新播放/暂停按钮
            const playBtn = document.getElementById('miniBarPlayBtn');
            if (playBtn) {
                const icon = player.playing ? 'pause' : 'play';
                if (playBtn.dataset.icon !== icon) {
                    playBtn.dataset.icon = icon;
                    playBtn.innerHTML = icon === 'pause'
                        ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>'
                        : '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
                }
            }
        }
    }

    function updatePlayingHighlight() {
        document.querySelectorAll('.music-track-item').forEach(el => {
            el.classList.toggle('now-playing', el.dataset.id === (player.current && player.current.id));
        });
    }

    // ===== 全屏播放页 =====
    let fullscreenOpen = false;
    let lyricsData = [];
    let currentLyricIdx = -1;

    function parseLrc(lrc) {
        if (!lrc) return [];
        const lines = lrc.split('\n');
        const result = [];
        lines.forEach(line => {
            const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
            if (match) {
                const time = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / (match[3].length === 3 ? 1000 : 100);
                const text = match[4].trim();
                if (text) result.push({ time, text });
            }
        });
        return result.sort((a, b) => a.time - b.time);
    }

    function openFullscreenPlayer() {
        if (!player.current) return;
        fullscreenOpen = true;
        fullscreenMode = 'vinyl';
        playlistVisible = false;
        lyricsData = parseLrc(player.current.lyrics);
        currentLyricIdx = -1;
        renderFullscreenPlayer();
        startFullscreenUpdate();
    }

    function closeFullscreenPlayer() {
        fullscreenOpen = false;
        stopFullscreenUpdate();
        const el = document.getElementById('musicFullscreen');
        if (el) el.remove();
    }

    let fullscreenRAF = null;
    function startFullscreenUpdate() {
        function tick() {
            if (!fullscreenOpen) return;
            updateFullscreenProgress();
            updateFullscreenLyric();
            fullscreenRAF = requestAnimationFrame(tick);
        }
        tick();
    }
    function stopFullscreenUpdate() {
        if (fullscreenRAF) { cancelAnimationFrame(fullscreenRAF); fullscreenRAF = null; }
    }

    function renderFullscreenPlayer() {
        let el = document.getElementById('musicFullscreen');
        if (!el) {
            el = document.createElement('div');
            el.id = 'musicFullscreen';
            el.className = 'music-fullscreen';
            document.body.appendChild(el);
        }
        const t = player.current;
        const hasCover = !!t.cover_url;
        const coverBg = hasCover ? t.cover_url : '';
        const coverHtml = hasCover
            ? '<img class="mf-vinyl-cover" src="' + t.cover_url + '">'
            : '<div class="mf-vinyl-cover mf-vinyl-default">🎵</div>';

        const showVinyl = fullscreenMode === 'vinyl';
        const showLyrics = fullscreenMode === 'lyrics';

        // 沉浸页三句歌词
        let immersiveLyricsHtml = '';
        if (showVinyl && lyricsData.length) {
            immersiveLyricsHtml = '<div class="mf-imm-lyrics" id="mfImmLyrics">' + renderImmersiveLyrics() + '</div>';
        }

        // 沉浸页歌名歌手（没歌词或歌词还没开始时显示）
        const showTitle = showVinyl && (!lyricsData.length || currentLyricIdx < 0);
        const titleHtml = '<div class="mf-imm-title" id="mfImmTitle" style="' + (showTitle ? '' : 'opacity:0;transform:translateY(20px);') + '">' +
            '<div class="mf-imm-song">' + escapeHtml(t.title) + '</div>' +
            '<div class="mf-imm-artist">' + escapeHtml(t.artist || '') + '</div>' +
        '</div>';

        el.innerHTML =
            // 背景层
            '<div class="mf-bg" style="' + (coverBg ? 'background-image:url(' + coverBg + ')' : '') + '"></div>' +
            '<div class="mf-bg-overlay"></div>' +

            // 沉浸页内容
            '<div class="mf-immersive" id="mfImmersive" style="' + (showVinyl ? '' : 'display:none;') + '" onclick="window._musicPlayer.toggleFullscreenMode()">' +
                '<div class="mf-vinyl-area">' +
                    '<div class="mf-vinyl-wrap-new' + (player.playing ? ' spinning' : '') + '" id="mfVinyl">' +
                        '<div class="mf-vinyl-new">' + coverHtml + '</div>' +
                    '</div>' +
                    '<div class="mf-tonearm' + (player.playing ? ' playing' : '') + '" id="mfTonearm">' +
                        '<div class="mf-tonearm-pivot"></div>' +
                        '<div class="mf-tonearm-rod"></div>' +
                        '<div class="mf-tonearm-head"></div>' +
                    '</div>' +
                '</div>' +
                '<div class="mf-imm-bottom">' +
                    titleHtml +
                    immersiveLyricsHtml +
                '</div>' +
                '' +
            '</div>' +

            // 歌词页内容
            '<div class="mf-lyrics-page" id="mfLyricsPage" style="' + (showLyrics ? '' : 'display:none;') + '">' +
                '<div class="mf-lp-header">' +
                    '<button class="mf-lp-back" onclick="window._musicPlayer.closeFullscreen()"><i data-lucide="chevron-down"></i></button>' +
                    '<div class="mf-lp-header-info">' +
                        '<div class="mf-lp-title">' + escapeHtml(t.title) + '</div>' +
                        '<div class="mf-lp-artist">' + escapeHtml(t.artist || '') + '</div>' +
                    '</div>' +
                    '<button class="mf-lp-headphone" onclick="window._musicPlayer.toggleListenTogether()"><i data-lucide="headphones"></i></button>' +
                '</div>' +
                '<div class="mf-lp-body" onclick="window._musicPlayer.toggleFullscreenMode()">' +
                    '<div class="mf-lp-lyrics" id="mfLpLyrics">' + renderFullLyricsHtml() + '</div>' +
                '</div>' +
                '<div class="mf-lp-controls">' +
                    '<div class="mf-progress-wrap">' +
                        '<span class="mf-time" id="mfTimeCur">' + formatDuration(player.currentTime) + '</span>' +
                        '<div class="mf-progress-bar" id="mfProgressBar">' +
                            '<div class="mf-progress-fill" id="mfProgressFill"></div>' +
                            '<div class="mf-progress-thumb" id="mfProgressThumb"></div>' +
                        '</div>' +
                        '<span class="mf-time" id="mfTimeTotal">' + formatDuration(player.duration) + '</span>' +
                    '</div>' +
                    '<div class="mf-lp-btns">' +
                        '<button class="mf-btn" onclick="window._musicPlayer.cycleMode()"><i data-lucide="' + getModeIcon() + '"></i></button>' +
                        '<button class="mf-btn" onclick="window._musicPlayer.playPrev()">' + iconPrev() + '</button>' +
                        '<button class="mf-btn mf-btn-play" onclick="window._musicPlayer.togglePlay()">' + (player.playing ? iconPause() : iconPlay()) + '</button>' +
                        '<button class="mf-btn" onclick="window._musicPlayer.playNext()">' + iconNext() + '</button>' +
                        '<button class="mf-btn" onclick="window._musicPlayer.handleLike(\'' + t.id + '\')"><i data-lucide="heart"></i></button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        if (typeof lucide !== 'undefined') lucide.createIcons();
        bindProgressDrag();

        // 阻止控制区冒泡
        ['mf-imm-controls', 'mf-lp-controls', 'mf-lp-header'].forEach(cls => {
            const c = el.querySelector('.' + cls);
            if (c) c.addEventListener('click', e => e.stopPropagation());
        });
    }

    function renderImmersiveLyrics() {
        if (!lyricsData.length || currentLyricIdx < 0) return '';
        const prev = currentLyricIdx > 0 ? lyricsData[currentLyricIdx - 1].text : '';
        const curr = lyricsData[currentLyricIdx] ? lyricsData[currentLyricIdx].text : '';
        const next = currentLyricIdx < lyricsData.length - 1 ? lyricsData[currentLyricIdx + 1].text : '';
        return (prev ? '<div class="mf-imm-line mf-imm-prev">' + escapeHtml(prev) + '</div>' : '') +
            '<div class="mf-imm-line mf-imm-curr">' + escapeHtml(curr) + '</div>' +
            (next ? '<div class="mf-imm-line mf-imm-next">' + escapeHtml(next) + '</div>' : '');
    }

    function renderFullLyricsHtml() {
        if (!lyricsData.length) return '<div class="mf-lyrics-empty">暂无歌词</div>';
        return lyricsData.map((l, i) =>
            '<div class="mf-lp-line' + (i === currentLyricIdx ? ' active' : '') + '">' + escapeHtml(l.text) + '</div>'
        ).join('');
    }

    function toggleFullscreenMode() {
        if (fullscreenMode === 'vinyl' && lyricsData.length) {
            fullscreenMode = 'lyrics';
        } else {
            fullscreenMode = 'vinyl';
        }
        renderFullscreenPlayer();
    }

    function renderPlaylistHtml() {
        return player.playlist.map((t, i) => {
            const isCurrent = player.current && player.current.id === t.id;
            return '<div class="mf-playlist-item' + (isCurrent ? ' mf-pl-active' : '') + '" onclick="window._musicPlayer.playFromPlaylist(' + i + ')">' +
                '<span class="mf-pl-idx">' + (i + 1) + '</span>' +
                '<div class="mf-pl-info">' +
                    '<div class="mf-pl-title">' + escapeHtml(t.title) + '</div>' +
                    '<div class="mf-pl-artist">' + escapeHtml(t.artist || '') + '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function togglePlaylist() {
        playlistVisible = !playlistVisible;
        const el = document.getElementById('mfPlaylist');
        if (el) el.style.display = playlistVisible ? 'flex' : 'none';
        // 滚动到当前播放的歌
        if (playlistVisible) {
            setTimeout(() => {
                const active = document.querySelector('.mf-pl-active');
                if (active) active.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }

    function playFromPlaylist(idx) {
        if (idx >= 0 && idx < player.playlist.length) {
            player.index = idx;
            playTrack(player.playlist[idx]);
        }
    }

    function renderLyricsHtml() {
        if (!lyricsData.length) return '<div class="mf-lyrics-empty">暂无歌词</div>';
        return lyricsData.map((l, i) =>
            '<div class="mf-lyric-line' + (i === currentLyricIdx ? ' active' : '') + '" data-idx="' + i + '">' + escapeHtml(l.text) + '</div>'
        ).join('');
    }

    function updateFullscreenProgress() {
        const fill = document.getElementById('mfProgressFill');
        const thumb = document.getElementById('mfProgressThumb');
        const timeCur = document.getElementById('mfTimeCur');
        const timeTotal = document.getElementById('mfTimeTotal');
        const vinyl = document.getElementById('mfVinyl');
        if (fill) {
            const pct = player.duration ? (player.currentTime / player.duration * 100) : 0;
            fill.style.width = pct + '%';
            if (thumb) thumb.style.left = pct + '%';
        }
        if (timeCur) timeCur.textContent = formatDuration(player.currentTime);
        if (timeTotal) timeTotal.textContent = formatDuration(player.duration);
        if (vinyl) vinyl.classList.toggle('spinning', player.playing);
        const tonearm = document.getElementById('mfTonearm');
        if (tonearm) tonearm.classList.toggle('playing', player.playing);

        // 同步所有播放/暂停按钮状态
        // 沉浸页按钮
        const immPlayBtn = document.querySelector('.mf-imm-btn-play');
        if (immPlayBtn) {
            const expected = player.playing ? iconPauseBig() : iconPlayBig();
            if (immPlayBtn.dataset.state !== (player.playing ? 'pause' : 'play')) {
                immPlayBtn.dataset.state = player.playing ? 'pause' : 'play';
                immPlayBtn.innerHTML = expected;
            }
        }
        // 歌词页按钮
        const lpPlayBtn = document.querySelector('.mf-lp-btns .mf-btn-play');
        if (lpPlayBtn) {
            const expected = player.playing ? iconPause() : iconPlay();
            if (lpPlayBtn.dataset.state !== (player.playing ? 'pause' : 'play')) {
                lpPlayBtn.dataset.state = player.playing ? 'pause' : 'play';
                lpPlayBtn.innerHTML = expected;
            }
        }
    }

    function updateFullscreenLyric() {
        if (!lyricsData.length) return;
        let idx = -1;
        for (let i = lyricsData.length - 1; i >= 0; i--) {
            if (player.currentTime >= lyricsData[i].time) { idx = i; break; }
        }
        if (idx === currentLyricIdx) return;
        currentLyricIdx = idx;

        // 沉浸页：更新三句歌词
        const immEl = document.getElementById('mfImmLyrics');
        if (immEl) immEl.innerHTML = renderImmersiveLyrics();

        // 沉浸页：歌名淡出
        const titleEl = document.getElementById('mfImmTitle');
        if (titleEl) {
            if (idx >= 0) {
                titleEl.style.opacity = '0';
                titleEl.style.transform = 'translateY(20px)';
            } else {
                titleEl.style.opacity = '1';
                titleEl.style.transform = 'translateY(0)';
            }
        }

        // 歌词页：高亮当前行
        const lpContainer = document.getElementById('mfLpLyrics');
        if (!lpContainer) return;
        lpContainer.querySelectorAll('.mf-lp-line').forEach((el, i) => {
            el.classList.toggle('active', i === idx);
        });
        const activeLine = lpContainer.querySelector('.mf-lp-line.active');
        if (activeLine) {
            activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function toggleListenTogether() {
        showToast('一起听功能即将上线～');
    }

    function bindProgressDrag() {
        const bar = document.getElementById('mfProgressBar');
        if (!bar) return;
        let dragging = false;
        function calcPercent(e) {
            const rect = bar.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        }
        bar.addEventListener('pointerdown', e => {
            dragging = true;
            const pct = calcPercent(e);
            seekTo(pct);
            bar.setPointerCapture(e.pointerId);
        });
        bar.addEventListener('pointermove', e => {
            if (!dragging) return;
            seekTo(calcPercent(e));
        });
        bar.addEventListener('pointerup', () => { dragging = false; });
        bar.addEventListener('pointercancel', () => { dragging = false; });
    }

    function getModeIcon() {
        if (player.mode === 'repeat') return 'repeat-1';
        if (player.mode === 'shuffle') return 'shuffle';
        return 'repeat';
    }

    function cycleMode() {
        const modes = ['sequence', 'repeat', 'shuffle'];
        const idx = modes.indexOf(player.mode);
        player.mode = modes[(idx + 1) % modes.length];
        renderFullscreenPlayer();
    }

    let fullscreenMode = 'vinyl'; // 'vinyl' | 'lyrics'
    let playlistVisible = false;

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

        // 最近播放
        const historyRaw = musicCache.history || [];
        const seen = new Set();
        const history = [];
        for (const h of historyRaw) {
            if (!h.music_tracks) continue;
            if (seen.has(h.music_tracks.id)) continue;
            seen.add(h.music_tracks.id);
            history.push(h);
            if (history.length >= 6) break;
        }
        let historyHtml = '';
        if (history.length) {
            historyHtml = '<div class="music-section-head"><span class="music-section-title">最近播放</span><button class="music-play-all-btn" onclick="window._musicPlayer.playAll(\'history\')">▶ 播放全部</button></div>' +
                '<div class="music-track-list">' + history.map(h => {
                    const t = h.music_tracks;
                    if (!t) return '';
                    return renderTrackItem(t);
                }).join('') + '</div>';
        }

        const hasPageBg = !!state.settings.musicPageBg;
        return '<div class="music-home' + (hasPageBg ? ' has-music-page-bg' : '') + '">' +
            recHtml +
            entriesHtml +
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
            '<button class="music-track-more" onclick="event.stopPropagation();window._musicPlayer.openTrackMenu(\'' + t.id + '\')">···</button>' +
        '</div>';
    }

    function renderTrackList(title, tracks) {
        if (!tracks.length) return '<div class="bedroom-empty">还没有歌曲</div>';
        const hasPageBg = !!state.settings.musicPageBg;
        return '<div class="' + (hasPageBg ? 'music-list-bg' : '') + '"><div class="music-section-head"><span class="music-section-title">' + escapeHtml(title) + '</span><button class="music-play-all-btn" onclick="window._musicPlayer.playAll(\'current\')">▶ 播放全部</button></div>' +
            '<div class="music-track-list">' + tracks.map(t => renderTrackItem(t)).join('') + '</div>' +
            '<div id="musicMiniBar" class="music-mini-bar" style="display:none;"></div></div>';
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

    function openTrackMenu(trackId) {
        const track = musicCache.tracks.find(t => t.id === trackId);
        if (!track) return;
        const html = '<div class="music-menu-title">' + escapeHtml(track.title) + '</div>' +
            '<button class="music-menu-item" onclick="window._musicPlayer.openEditTrack(\'' + trackId + '\')"><i data-lucide="pencil"></i>编辑信息</button>' +
            '<button class="music-menu-item music-menu-danger" onclick="window._musicPlayer.deleteTrack(\'' + trackId + '\')"><i data-lucide="trash-2"></i>删除歌曲</button>';
        openInfoSheet('歌曲操作', html);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function openEditTrack(trackId) {
        const track = musicCache.tracks.find(t => t.id === trackId);
        if (!track) return;
        const html = '<div class="music-edit-form">' +
            '<div class="form-group"><label>歌名</label><input type="text" id="editTrackTitle" value="' + escapeHtml(track.title || '') + '" placeholder="歌曲名称"></div>' +
            '<div class="form-group"><label>歌手</label><input type="text" id="editTrackArtist" value="' + escapeHtml(track.artist || '') + '" placeholder="歌手名"></div>' +
            '<div class="form-group"><label>专辑</label><input type="text" id="editTrackAlbum" value="' + escapeHtml(track.album || '') + '" placeholder="专辑名（可选）"></div>' +
            '<div class="form-group"><label>封面</label><div style="display:flex;align-items:center;gap:12px;">' +
                (track.cover_url ? '<img src="' + track.cover_url + '" style="width:56px;height:56px;border-radius:8px;object-fit:cover;">' : '<div style="width:56px;height:56px;border-radius:8px;background:var(--primary-lighter);display:flex;align-items:center;justify-content:center;">🎵</div>') +
                '<label class="wp-btn wp-btn-pick" for="editTrackCoverInput" style="cursor:pointer;">选择图片</label>' +
                (track.cover_url ? '<button class="wp-btn wp-btn-clear" onclick="window._musicPlayer.clearTrackCover(\'' + trackId + '\')">清除</button>' : '') +
            '</div>' +
            '<input type="file" id="editTrackCoverInput" accept="image/*" style="display:none;" onchange="window._musicPlayer.handleCoverPick(\'' + trackId + '\',event)">' +
            '</div>' +
            '<button class="btn-primary" style="width:100%;justify-content:center;margin-top:14px;" onclick="window._musicPlayer.saveEditTrack(\'' + trackId + '\')">保存</button>' +
        '</div>';
        openInfoSheet('编辑歌曲信息', html);
    }

    async function saveEditTrack(trackId) {
        const title = document.getElementById('editTrackTitle').value.trim();
        const artist = document.getElementById('editTrackArtist').value.trim();
        const album = document.getElementById('editTrackAlbum').value.trim();
        if (!title) { alert('歌名不能为空'); return; }
        if (!isSupabaseConfigured()) return;
        const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
        const h = Object.assign({}, getSupabaseHeaders(), { 'Prefer': 'return=minimal' });
        try {
            const res = await fetch(base + '/rest/v1/music_tracks?id=eq.' + trackId, {
                method: 'PATCH', headers: h,
                body: JSON.stringify({ title, artist, album })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            // 更新本地缓存
            const track = musicCache.tracks.find(t => t.id === trackId);
            if (track) { track.title = title; track.artist = artist; track.album = album; }
            closeInfoSheet();
            showToast('已保存');
            // 重新渲染当前页
            const content = document.getElementById('bedroomContent');
            if (content) {
                const view = bedroomStack[bedroomStack.length - 1];
                if (view && view.startsWith('music')) {
                    content.innerHTML = renderMusicPage(view);
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            }
        } catch (e) {
            alert('保存失败: ' + e.message);
        }
    }

    async function deleteTrack(trackId) {
        if (!confirm('确定删除这首歌？')) return;
        if (!isSupabaseConfigured()) return;
        const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
        const h = getSupabaseHeaders();
        try {
            await fetch(base + '/rest/v1/music_tracks?id=eq.' + trackId, { method: 'DELETE', headers: h });
            musicCache.tracks = musicCache.tracks.filter(t => t.id !== trackId);
            closeInfoSheet();
            showToast('已删除');
            const content = document.getElementById('bedroomContent');
            if (content) {
                const view = bedroomStack[bedroomStack.length - 1];
                if (view && view.startsWith('music')) {
                    content.innerHTML = renderMusicPage(view);
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            }
        } catch (e) {
            alert('删除失败: ' + e.message);
        }
    }

    async function handleCoverPick(trackId, e) {
        const file = e.target.files[0];
        if (!file) return;
        if (!isSupabaseConfigured()) { alert('请先配置云端同步'); return; }
        const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
        const key = state.memorySystem.settings.supabaseKey;

        const fileName = 'cover_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5) + '.' + file.name.split('.').pop();
        showToast('上传中...');
        try {
            const uploadRes = await fetch(base + '/storage/v1/object/covers/' + fileName, {
                method: 'POST',
                headers: {
                    'apikey': key,
                    'Authorization': 'Bearer ' + key,
                    'Content-Type': file.type || 'image/jpeg'
                },
                body: file
            });
            if (!uploadRes.ok) throw new Error('HTTP ' + uploadRes.status);
            const coverUrl = base + '/storage/v1/object/public/covers/' + fileName;

            const h = Object.assign({}, getSupabaseHeaders(), { 'Prefer': 'return=minimal' });
            await fetch(base + '/rest/v1/music_tracks?id=eq.' + trackId, {
                method: 'PATCH', headers: h,
                body: JSON.stringify({ cover_url: coverUrl })
            });

            const track = musicCache.tracks.find(t => t.id === trackId);
            if (track) track.cover_url = coverUrl;

            showToast('封面已更新');
            openEditTrack(trackId);
        } catch (err) {
            alert('上传失败: ' + err.message);
        }
        e.target.value = '';
    }

    async function clearTrackCover(trackId) {
        if (!isSupabaseConfigured()) return;
        const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
        const h = Object.assign({}, getSupabaseHeaders(), { 'Prefer': 'return=minimal' });
        await fetch(base + '/rest/v1/music_tracks?id=eq.' + trackId, {
            method: 'PATCH', headers: h,
            body: JSON.stringify({ cover_url: '' })
        });
        const track = musicCache.tracks.find(t => t.id === trackId);
        if (track) track.cover_url = '';
        showToast('已清除封面');
        openEditTrack(trackId);
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
        const storageHeaders = { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' };

        showToast('正在扫描...');
        try {
            // 分页列出 Storage 中所有文件
            let allFiles = [];
            let offset = 0;
            const pageSize = 100;
            while (true) {
                const res = await fetch(base + '/storage/v1/object/list/music', {
                    method: 'POST',
                    headers: storageHeaders,
                    body: JSON.stringify({ prefix: '', limit: pageSize, offset: offset, sortBy: { column: 'name', order: 'asc' } })
                });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const page = await res.json();
                if (!page.length) break;
                allFiles = allFiles.concat(page);
                if (page.length < pageSize) break;
                offset += pageSize;
            }

            // 分类：音频文件和歌词文件
            const audioFiles = [];
            const lrcFileNames = new Set();
            const coverFiles = new Map(); // nameNoExt -> fileName
            allFiles.forEach(f => {
                if (!f.name || f.name.startsWith('.')) return;
                const ext = f.name.split('.').pop().toLowerCase();
                const nameNoExt = f.name.replace(/\.[^.]+$/, '');
                if (ext === 'lrc') {
                    lrcFileNames.add(f.name);
                } else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
                    coverFiles.set(nameNoExt, f.name);
                } else if (['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) {
                    audioFiles.push(f);
                }
            });

            // 获取已有记录，统一解码比较
            const existingUrls = new Set();
            musicCache.tracks.forEach(t => {
                existingUrls.add(t.file_url);
                try { existingUrls.add(decodeURIComponent(t.file_url)); } catch(e) {}
                try { existingUrls.add(encodeURI(decodeURIComponent(t.file_url))); } catch(e) {}
            });

            let added = 0;
            const h = Object.assign({}, getSupabaseHeaders(), { 'Prefer': 'return=minimal' });

            for (const f of audioFiles) {
                const fileUrl = base + '/storage/v1/object/public/music/' + f.name;

                // 多种格式比对
                let exists = existingUrls.has(fileUrl);
                if (!exists) { try { exists = existingUrls.has(decodeURIComponent(fileUrl)); } catch(e) {} }
                if (!exists) { try { exists = existingUrls.has(encodeURI(fileUrl)); } catch(e) {} }
                if (exists) continue;

                // 从文件名解析歌手和歌名
                const nameNoExt = f.name.replace(/\.[^.]+$/, '');
                let title = nameNoExt, artist = '', album = '';
                const sep = nameNoExt.indexOf(' - ');
                if (sep > 0) {
                    artist = nameNoExt.slice(0, sep).trim();
                    title = nameNoExt.slice(sep + 3).trim();
                }

                // 获取歌词：优先 Storage 同名 .lrc
                let lyrics = '';
                const lrcName = nameNoExt + '.lrc';
                if (lrcFileNames.has(lrcName)) {
                    try {
                        const lrcUrl = base + '/storage/v1/object/public/music/' + lrcName;
                        const lrcRes = await fetch(lrcUrl);
                        if (lrcRes.ok) lyrics = await lrcRes.text();
                    } catch (e) { /* 忽略 */ }
                }

                // 兜底：LRCLIB
                if (!lyrics && title) {
                    try {
                        const lrcLibUrl = 'https://lrclib.net/api/get?artist_name=' + encodeURIComponent(artist) + '&track_name=' + encodeURIComponent(title);
                        const lrcLibRes = await fetch(lrcLibUrl);
                        if (lrcLibRes.ok) {
                            const lrcData = await lrcLibRes.json();
                            if (lrcData && lrcData.syncedLyrics) lyrics = lrcData.syncedLyrics;
                            else if (lrcData && lrcData.plainLyrics) lyrics = lrcData.plainLyrics;
                        }
                    } catch (e) { /* 忽略 */ }
                }

                // 检查有没有同名封面
                let cover_url = '';
                if (coverFiles.has(nameNoExt)) {
                    cover_url = base + '/storage/v1/object/public/music/' + coverFiles.get(nameNoExt);
                }

                await fetch(base + '/rest/v1/music_tracks', {
                    method: 'POST', headers: h,
                    body: JSON.stringify({ title, artist, album, file_url: fileUrl, lyrics, cover_url })
                });
                added++;
            }

            // === 补歌词：给已有但没歌词的歌补上 ===
            const tracksNoLyrics = musicCache.tracks.filter(t => !t.lyrics);
            let lyricsFound = 0;
            for (const t of tracksNoLyrics) {
                let lyrics = '';
                // 从 file_url 推断 lrc 路径
                const lrcUrl = t.file_url.replace(/\.[^.]+$/, '.lrc');
                try {
                    const lrcRes = await fetch(lrcUrl);
                    if (lrcRes.ok) {
                        const text = await lrcRes.text();
                        if (text && text.includes('[')) lyrics = text;
                    }
                } catch(e) {}

                // 兜底 LRCLIB
                if (!lyrics && t.title) {
                    try {
                        const url = 'https://lrclib.net/api/get?artist_name=' + encodeURIComponent(t.artist || '') + '&track_name=' + encodeURIComponent(t.title);
                        const res = await fetch(url);
                        if (res.ok) {
                            const data = await res.json();
                            if (data && data.syncedLyrics) lyrics = data.syncedLyrics;
                            else if (data && data.plainLyrics) lyrics = data.plainLyrics;
                        }
                    } catch(e) {}
                }

                if (lyrics) {
                    await fetch(base + '/rest/v1/music_tracks?id=eq.' + t.id, {
                        method: 'PATCH', headers: h,
                        body: JSON.stringify({ lyrics })
                    });
                    lyricsFound++;
                }
            }

            let msg = '扫描完成';
            if (added) msg += '，新增 ' + added + ' 首';
            if (lyricsFound) msg += '，补了 ' + lyricsFound + ' 首歌词';
            if (!added && !lyricsFound) msg += '，没有新内容';
            showToast(msg);

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

    async function fetchMissingLyrics() {
        if (!isSupabaseConfigured()) return;
        const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
        const key = state.memorySystem.settings.supabaseKey;
        const h = Object.assign({}, getSupabaseHeaders(), { 'Prefer': 'return=minimal' });

        const tracksWithoutLyrics = musicCache.tracks.filter(t => !t.lyrics);
        if (!tracksWithoutLyrics.length) { showToast('所有歌都有歌词了'); return; }

        showToast('正在查找歌词...');
        let found = 0;

        // 先检查 Storage 里有没有 .lrc 文件
        let lrcFiles = new Map();
        try {
            const res = await fetch(base + '/storage/v1/object/list/music', {
                method: 'POST',
                headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
                body: JSON.stringify({ prefix: '', limit: 500, offset: 0, sortBy: { column: 'name', order: 'asc' } })
            });
            if (res.ok) {
                const files = await res.json();
                files.forEach(f => {
                    if (f.name && f.name.endsWith('.lrc')) {
                        lrcFiles.set(f.name.replace(/\.lrc$/, ''), f.name);
                    }
                });
            }
        } catch (e) { /* 忽略 */ }

        for (const t of tracksWithoutLyrics) {
            let lyrics = '';
            const nameGuess = t.artist ? (t.artist + ' - ' + t.title) : t.title;

            // 优先 Storage .lrc
            if (lrcFiles.has(nameGuess)) {
                try {
                    const lrcUrl = base + '/storage/v1/object/public/music/' + lrcFiles.get(nameGuess);
                    const lrcRes = await fetch(lrcUrl);
                    if (lrcRes.ok) lyrics = await lrcRes.text();
                } catch (e) { /* 忽略 */ }
            }

            // 兜底 LRCLIB
            if (!lyrics) {
                try {
                    const url = 'https://lrclib.net/api/get?artist_name=' + encodeURIComponent(t.artist || '') + '&track_name=' + encodeURIComponent(t.title);
                    const res = await fetch(url);
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.syncedLyrics) lyrics = data.syncedLyrics;
                        else if (data && data.plainLyrics) lyrics = data.plainLyrics;
                    }
                } catch (e) { /* 忽略 */ }
            }

            if (lyrics) {
                await fetch(base + '/rest/v1/music_tracks?id=eq.' + t.id, {
                    method: 'PATCH', headers: h,
                    body: JSON.stringify({ lyrics })
                });
                found++;
            }
        }

        showToast('找到 ' + found + ' 首歌词');
        await loadMusicData(true);
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
        openTrackMenu,
        openEditTrack,
        saveEditTrack,
        deleteTrack,
        handleCoverPick,
        clearTrackCover,
        uploadTrack,
        syncFromStorage,
        fetchMissingLyrics,
        openFullscreen: openFullscreenPlayer,
        closeFullscreen: closeFullscreenPlayer,
        cycleMode,
        toggleFullscreenMode,
        togglePlaylist,
        playFromPlaylist,
        toggleListenTogether,
        getPlayer: () => player,
        _currentList: null
    };

})();
