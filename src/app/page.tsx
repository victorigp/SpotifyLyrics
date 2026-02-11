"use client";

import { useEffect, useState, useRef, useLayoutEffect } from "react";
import Image from "next/image";
import { useSession, signIn, signOut } from "next-auth/react";
import VideoBackground from "./VideoBackground";

interface Track {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string;
}

interface LyricsData {
  plainLyrics: string;
  syncedLyrics: string;
  instrumental: boolean;
  source?: string;
}

interface FloatingFeedback {
  id: number;
  text: string;
  type: 'positive' | 'negative';
}

const USE_LASTFM_COMPENSATION = true;
const LASTFM_POLLING_INTERVAL = 250;
const LASTFM_LATENCY_OFFSET = 2000;

export default function Home() {
  const [username, setUsername] = useState("");
  const [isSet, setIsSet] = useState(false);
  const [karaokeMode, setKaraokeMode] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true); // New state for video toggle
  const [skipVideoTrigger, setSkipVideoTrigger] = useState(0);
  const [videoStatus, setVideoStatus] = useState<'searching' | 'playing' | 'error'>('searching');
  const [videoProgress, setVideoProgress] = useState({ current: 0, total: 0, isDiscoveryComplete: false });

  const handleSkipVideo = () => {
    if (videoEnabled) {
      setSkipVideoTrigger(prev => prev + 1);
    }
  };
  const [lyricOffset, setLyricOffset] = useState(0);
  const [isFullScreenSupported, setIsFullScreenSupported] = useState(false);

  const [track, setTrack] = useState<Track | null>(null);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [currentSearchType, setCurrentSearchType] = useState<string>("auto");

  const [trackStartTime, setTrackStartTime] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  // Screen Wake Lock
  useEffect(() => {
    // Detect iOS devices
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

    setIsFullScreenSupported(
      !isIOS && typeof document !== 'undefined' && (
        !!document.fullscreenEnabled ||
        // @ts-ignore
        !!document.webkitFullscreenEnabled ||
        // @ts-ignore
        !!document.mozFullScreenEnabled ||
        // @ts-ignore
        !!document.msFullscreenEnabled
      )
    );

    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.log('Wake Lock is active');
        }
      } catch (err: any) {
        console.error(`${err.name}, ${err.message}`);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [feedbacks, setFeedbacks] = useState<FloatingFeedback[]>([]);

  const lockingTrackNameRef = useRef<string | null>(null);
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  const { data: session } = useSession();

  useEffect(() => {
    // Priority to Spotify Session
    if (session?.accessToken) {
      setIsSet(true);
      return;
    }

    const stored = localStorage.getItem("lastfm_username");
    if (stored) {
      setUsername(stored);
      setIsSet(true);
    }

    // Load video preference
    const savedVideoIdx = localStorage.getItem("video_enabled");
    if (savedVideoIdx !== null) {
      setVideoEnabled(savedVideoIdx === "true");
    }
  }, [session]);

  const handleSetUser = () => {
    if (username.trim()) {
      const cleanUser = username.trim();
      localStorage.setItem("lastfm_username", cleanUser);
      setUsername(cleanUser);
      setIsSet(true);
    }
  };

  const handleClearUser = () => {
    if (session) {
      signOut();
    } else {
      localStorage.removeItem("lastfm_username");
      setIsSet(false);
      setUsername("");
    }

    setTrack(null);
    setLyrics(null);
    setLyricOffset(0);
    setTrackStartTime(null);
    lockingTrackNameRef.current = null;
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(e => console.error(e));
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const triggerFeedback = (text: string, type: 'positive' | 'negative') => {
    const id = Date.now();
    setFeedbacks(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setFeedbacks(prev => prev.filter(f => f.id !== id));
    }, 1000);
  };

  const toggleVideoMode = () => {
    const newState = !videoEnabled;
    setVideoEnabled(newState);
    localStorage.setItem("video_enabled", String(newState));
  };

  const adjustOffset = (amount: number) => {
    setLyricOffset(prev => {
      const newOffset = prev + amount;
      if (track) {
        setCachedOffset(track.artist, track.name, newOffset);
        // Async save to KV (permanent) -> Send source
        const currentSource = session?.accessToken ? "spotify" : "lastfm";
        saveToKV(track.artist, track.name, newOffset, username || session?.user?.name || "unknown", undefined, currentSource);
      }
      return newOffset;
    });
    triggerFeedback(amount > 0 ? `+${amount}s` : `${amount}s`, amount > 0 ? 'positive' : 'negative');
  };

  const getCachedProvider = (artist: string, name: string) => {
    try {
      const key = `lyrics_provider_${artist}_${name}`;
      return localStorage.getItem(key);
    } catch (e) { return null; }
  };

  const setCachedProvider = (artist: string, name: string, provider: string) => {
    try {
      const key = `lyrics_provider_${artist}_${name}`;
      localStorage.setItem(key, provider);
    } catch (e) { }
  };

  const getCachedOffset = (artist: string, name: string) => {
    try {
      const key = `lyrics_offset_${artist}_${name}`;
      const saved = localStorage.getItem(key);
      return saved ? parseFloat(saved) : 0;
    } catch (e) { return 0; }
  };

  const setCachedOffset = (artist: string, name: string, offset: number) => {
    try {
      const key = `lyrics_offset_${artist}_${name}`;
      localStorage.setItem(key, offset.toString());
    } catch (e) { }
  };

  const saveToKV = async (artist: string, track: string, offset?: number, user?: string, lyrics?: any, source?: string) => {
    try {
      await fetch('/api/kv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist, track, offset, username: user?.trim(), lyrics, source }),
        cache: 'no-store'
      });
    } catch (e) { console.error("Error saving to KV", e); }
  };

  const fetchFromKV = async (artist: string, track: string, user?: string, source?: string) => {
    try {
      const url = `/api/kv?artist=${encodeURIComponent(artist.trim())}&track=${encodeURIComponent(track.trim())}&username=${encodeURIComponent(user?.trim() || '')}&source=${source || 'lastfm'}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (e) { console.error("Error fetching from KV", e); }
    return null;
  };


  useEffect(() => {
    if ((!isSet || !username) && !session?.accessToken) return;

    lockingTrackNameRef.current = null;

    const fetchNowPlaying = async () => {
      const requestStartTime = Date.now();
      try {
        let url = `/api/now-playing?`;
        if (session?.accessToken) {
          url += `token=${session.accessToken}`;
        } else {
          url += `username=${encodeURIComponent(username)}`;
        }

        const res = await fetch(url);
        if (!res.ok) return;

        const data = await res.json();

        if (data.isPlaying && data.track) {
          // --- CONTINUOUS SYNC (Every Poll) ---
          if (session?.accessToken && data.progress_ms !== undefined) {
            const absoluteStartTime = Date.now() - data.progress_ms;
            setTrackStartTime(prev => {
              // If unset, or drifted by > 1s (seek/pause), update it
              if (!prev || Math.abs(prev - absoluteStartTime) > 1000) {
                return absoluteStartTime;
              }
              return prev;
            });
          }

          if (!lockingTrackNameRef.current || lockingTrackNameRef.current !== data.track.name) {
            lockingTrackNameRef.current = data.track.name;
            if (searchAbortControllerRef.current) {
              searchAbortControllerRef.current.abort();
            }

            setTrack(data.track);
            setLyrics(null);
            setSkipVideoTrigger(0); // Reset Skip Counter
            setVideoProgress({ current: 0, total: 0, isDiscoveryComplete: false }); // Reset Progress

            setLyricOffset(0);

            const savedOffset = getCachedOffset(data.track.artist, data.track.name);
            setLyricOffset(savedOffset);

            setCurrentSearchType("auto");

            // LAST.FM MODE INITIAL SYNC (Only needed once per track)
            if (!session?.accessToken) {
              const startEstimation = USE_LASTFM_COMPENSATION ? (requestStartTime - LASTFM_LATENCY_OFFSET) : requestStartTime;
              setTrackStartTime(startEstimation);
            }

            fetchLyricsWithSteps(data.track);
          }
        } else {
          // If not playing, reset track to show Idle State
          setTrack(null);
          lockingTrackNameRef.current = null;
          if (searchAbortControllerRef.current) searchAbortControllerRef.current.abort();
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    };

    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, LASTFM_POLLING_INTERVAL);
    return () => {
      clearInterval(interval);
    }
  }, [isSet, username, session]);

  useEffect(() => {
    if (!trackStartTime) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setCurrentTime(now - trackStartTime);
    }, 100);
    return () => clearInterval(interval);
  }, [trackStartTime]);


  const fetchLyricsWithSteps = async (currentTrack: Track, specificType?: string) => {
    const controller = new AbortController();
    searchAbortControllerRef.current = controller;
    const signal = controller.signal;

    const baseParams = new URLSearchParams({
      track: currentTrack.name,
      artist: currentTrack.artist,
      album: currentTrack.album,
      duration: "0",
    });

    const handleSuccess = (data: any, type: string, skipKVSave = false) => {
      if (signal.aborted) return;
      setLyrics(data);
      setCurrentSearchType(type);
      setLoadingStatus(null);
      setCachedProvider(currentTrack.artist, currentTrack.name, type);

      // Save globally if it's a fresh find
      if (!skipKVSave) {
        saveToKV(currentTrack.artist, currentTrack.name, undefined, undefined, data);
      }
    };

    if (!specificType) {
      // 0. CHECK KV CACHE (GLOBAL LYRICS + USER OFFSET)
      setLoadingStatus("Consultando memoria permanente...");

      const currentSource = session?.accessToken ? "spotify" : "lastfm";
      const kvData = await fetchFromKV(currentTrack.artist, currentTrack.name, username || session?.user?.name || "unknown", currentSource);

      if (kvData?.lyrics && !signal.aborted) {
        if (kvData.offset !== undefined) {
          setLyricOffset(kvData.offset);
          setCachedOffset(currentTrack.artist, currentTrack.name, kvData.offset);
        }
        handleSuccess(kvData.lyrics, "cloud", true);
        return;
      }

      if (kvData?.offset !== undefined && !signal.aborted) {
        setLyricOffset(kvData.offset);
      }

      // 1. Check Local Preference
      const cachedType = getCachedProvider(currentTrack.artist, currentTrack.name);

      if (cachedType) {
        setLoadingStatus(`Cargando preferencia guardada (${cachedType})...`);
        try {
          const res = await fetch(`/api/lyrics?${baseParams}&type=${cachedType}`, { signal });
          if (res.ok) {
            const data = await res.json();
            if (data && !signal.aborted) {
              handleSuccess(data, cachedType);
              return;
            }
          }
        } catch (e) { }
      }

      setLyrics(null);

      setLoadingStatus("Buscando letra en LRCLIB - Exacto...");
      try {
        const res = await fetch(`/api/lyrics?${baseParams}&type=strict`, { signal });
        if (res.ok) {
          const data = await res.json();
          if (data && !signal.aborted) {
            handleSuccess(data, "strict");
            return;
          }
        }
      } catch (e) { }
      if (signal.aborted) return;

      setLoadingStatus("Buscando letra en LRCLIB - Difuso...");
      try {
        const res = await fetch(`/api/lyrics?${baseParams}&type=fuzzy`, { signal });
        if (res.ok) {
          const data = await res.json();
          if (data && !signal.aborted) {
            handleSuccess(data, "fuzzy");
            return;
          }
        }
      } catch (e) { }
      if (signal.aborted) return;

      setLoadingStatus("Buscando letra en Lyrics.ovh...");
      try {
        const res = await fetch(`/api/lyrics?${baseParams}&type=ovh`, { signal });
        if (res.ok) {
          const data = await res.json();
          if (data && !signal.aborted) {
            handleSuccess(data, "ovh");
            return;
          }
        }
      } catch (e) { }

      if (!signal.aborted) {
        setLoadingStatus(null);
        setCurrentSearchType("failed");
      }

    } else {
      setCurrentSearchType(specificType);
      const displayText = specificType === "strict" ? "LRCLIB - Exacto" : specificType === "fuzzy" ? "LRCLIB - Difuso" : "Lyrics.ovh";
      setLoadingStatus(`Buscando letra en ${displayText}...`);

      try {
        const res = await fetch(`/api/lyrics?${baseParams}&type=${specificType}`, { signal });
        if (res.ok) {
          const data = await res.json();
          if (data && !signal.aborted) {
            handleSuccess(data, specificType);
          }
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') console.error(e);
      }
      if (!signal.aborted && !lyrics) setLoadingStatus(null);
    }
  }

  const handleRetrySearch = () => {
    if (!track) return;

    let nextType = "strict";
    if (currentSearchType === "strict") {
      nextType = "fuzzy";
    } else if (currentSearchType === "fuzzy") {
      nextType = "ovh";
    } else if (currentSearchType === "ovh") {
      nextType = "strict";
    } else {
      nextType = "strict";
    }

    fetchLyricsWithSteps(track, nextType);
  };

  if (!isSet) {
    return (
      <div className="fixed inset-0 z-50 bg-black text-white flex flex-col items-center justify-center p-4 overflow-hidden">
        <div className="flex flex-col gap-4 landscape:gap-1 w-full max-w-sm">
          <h1 className="text-4xl landscape:text-2xl font-bold mb-8 landscape:mb-2 text-green-500 text-center">Spotify Lyrics</h1>
          <button
            onClick={() => signIn("spotify")}
            className="px-8 py-4 landscape:py-2 bg-[#1DB954] text-black rounded-lg font-bold hover:bg-green-400 transition flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" /></svg>
            Entrar con Spotify
          </button>

          <div className="flex items-center gap-4 my-2 landscape:my-1">
            <div className="h-px bg-gray-700 flex-1"></div>
            <span className="text-gray-500 text-sm">O</span>
            <div className="h-px bg-gray-700 flex-1"></div>
          </div>

          <input
            type="text"
            placeholder="Introduce tu usuario de Last.fm"
            className="p-4 landscape:p-2 rounded-lg bg-gray-800 text-white border border-gray-700"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <button onClick={handleSetUser} className="px-8 py-4 landscape:py-2 bg-green-600 rounded-lg font-bold hover:bg-green-700 transition">
            Entrar con Last.fm
          </button>
        </div>
      </div>
    );
  }

  const effectiveTime = (currentTime / 1000) + lyricOffset;

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-black text-white flex flex-col">


      <div className="absolute inset-0 z-0">
        {track?.albumArt && (
          <Image
            key={track.albumArt} // Force immediate remount on change
            src={track.albumArt}
            alt="Background"
            fill
            className="object-cover opacity-50 blur-sm scale-105" // Removed transitions for instant switch
            priority
          />
        )}
        <div className="absolute inset-0 bg-black/20" />
        {/* Background Video Layer - Always mounted to preserve state */}
        {track && (
          <div className={`absolute inset-0 transition-opacity duration-500 ${videoEnabled ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <VideoBackground
              key={track.name + track.artist}
              artist={track.artist}
              track={track.name}
              userId={session?.user?.email || session?.user?.name || username || "anonymous"}
              skipTrigger={skipVideoTrigger}
              onLoadStatus={setVideoStatus}
              onProgress={setVideoProgress}
            />
          </div>
        )}
      </div>

      <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden">
        {feedbacks.map(f => (
          <div
            key={f.id}
            className={`absolute right-10 top-1/2 transform -translate-y-1/2 text-4xl font-bold animate-float-fade ${f.type === 'positive' ? 'text-green-300' : 'text-red-500'
              }`}
          >
            {f.text}
          </div>
        ))}
      </div>

      <div className="relative z-10 flex flex-col h-full">
        <header className="h-[5%] min-h-[40px] shrink-0 flex flex-col justify-center items-center px-4 text-center z-20 bg-black/20 backdrop-blur-sm">
          {track ? (
            <div className="max-w-full">
              <h1 className="text-sm md:text-xl truncate drop-shadow-lg text-white">
                <span className="font-bold">{track.artist}</span> - {track.name}
              </h1>
            </div>
          ) : null}
        </header>

        <main className="flex-1 h-[90%] w-full flex justify-center items-center px-2 md:px-8 overflow-hidden relative">
          {/* User Indicator - Top Right of Main Body (Always Visible) */}
          {(session?.user?.name || username) && (
            <div className="absolute right-0 top-0 z-50 bg-black/60 backdrop-blur-md px-4 py-2 rounded-bl-2xl border-b border-l border-white/10 shadow-xl flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-wide">
                {session?.user?.name || username}
              </span>
            </div>
          )}

          {track ? (
            <>
              {/* Video Searching Indicator - Top Left of Main Body */}
              {videoEnabled && videoStatus === 'searching' && (
                <div className="absolute left-0 top-0 z-50 bg-black/60 backdrop-blur-md px-4 py-2 rounded-br-2xl flex items-center gap-3 animate-pulse border-b border-r border-white/10 shadow-xl">
                  <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  <span className="text-sm font-medium tracking-wide">
                    {videoProgress.isDiscoveryComplete && videoProgress.total > 0
                      ? `Cargando video ${videoProgress.current}/${videoProgress.total}`
                      : "Buscando video..."}
                  </span>
                </div>
              )}
              {loadingStatus ? (
                <div className="text-gray-200 font-medium text-xl italic bg-black/40 p-6 rounded-xl backdrop-blur-md animate-pulse">
                  {loadingStatus}
                </div>
              ) : lyrics ? (
                lyrics.instrumental ? (
                  <div className="flex flex-col items-center justify-center gap-6 animate-in fade-in zoom-in duration-500">
                    <span className="text-8xl md:text-9xl text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">♫</span>
                    <p className="text-2xl font-bold text-white drop-shadow-md">Instrumental</p>
                  </div>
                ) : (
                  karaokeMode ? (
                    <KaraokeView lyrics={lyrics.syncedLyrics || lyrics.plainLyrics} currentTime={effectiveTime} />
                  ) : (
                    <FullLyricsView lyrics={lyrics.syncedLyrics || lyrics.plainLyrics} currentTime={effectiveTime} />
                  )
                )
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 bg-black/40 p-6 rounded-xl backdrop-blur-md">
                  <span className="text-4xl">⚠️</span>
                  <p className="text-yellow-400 font-bold text-2xl text-center">Letra no encontrada</p>
                  <div className="flex gap-4 mt-4 pointer-events-auto">
                    <button
                      onClick={handleRetrySearch}
                      className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition"
                    >
                      Reintentar Búsqueda
                    </button>
                    <p className="text-xs text-gray-400 mt-2">(Prueba buscar en otro proveedor)</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            // Idle State UI
            <div className="flex flex-col items-center justify-center gap-6 animate-in fade-in zoom-in duration-500 opacity-80">
              <svg viewBox="0 0 24 24" className="w-24 h-24 text-[#1DB954]" fill="currentColor">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
              <div className="text-center space-y-2">
                <p className="text-xl md:text-3xl text-white font-bold drop-shadow-lg">
                  Esperando música...
                </p>
                <p className="text-sm md:text-lg text-gray-300">
                  Empieza a reproducir música en Spotify
                </p>
              </div>
            </div>
          )}
        </main>

        <footer className="h-[5%] min-h-[50px] shrink-0 flex justify-between items-center px-4 md:px-8 z-20 pb-safe w-full overflow-x-auto no-scrollbar">
          <button onClick={handleClearUser} title="Inicio" className="text-gray-300 hover:text-white transition group p-1 md:p-2 min-w-[24px] md:min-w-[30px] drop-shadow-md flex justify-center shrink-0">
            <span className="text-lg md:text-2xl">🏠</span>
          </button>

          {isFullScreenSupported && (
            <button onClick={toggleFullScreen} title="Pantalla Completa" className="text-gray-300 hover:text-white transition group p-1 md:p-2 min-w-[24px] md:min-w-[30px] drop-shadow-md flex justify-center shrink-0">
              <span className="text-lg md:text-2xl">⛶</span>
            </button>
          )}

          {/* Toggle Video Button */}
          <button onClick={toggleVideoMode} title={videoEnabled ? "Desactivar Vídeo" : "Activar Vídeo"} className="transition group p-1 md:p-2 drop-shadow-md flex justify-center relative hover:scale-110 active:scale-95 duration-200 shrink-0">
            <span className="text-xl md:text-2xl">{videoEnabled ? "🎬" : "📵"}</span>
            {!videoEnabled && (
              <span className="absolute inset-0 flex items-center justify-center text-red-500 text-3xl md:text-4xl pointer-events-none font-bold select-none drop-shadow-md" style={{ textShadow: "0 0 4px black" }}>
                ✕
              </span>
            )}
          </button>

          {/* Manual Video Skip Button (Clapperboard + Refresh) */}
          <button
            onClick={handleSkipVideo}
            disabled={!videoEnabled}
            title="Buscar siguiente vídeo"
            className={`transition group p-1 md:p-2 drop-shadow-md flex justify-center relative duration-200 shrink-0 ${!videoEnabled ? 'opacity-30 grayscale cursor-not-allowed' : 'hover:scale-110 active:scale-95 hover:rotate-12'}`}
          >
            <div className="relative w-6 h-6 md:w-8 md:h-8 flex items-center justify-center">
              <span className="text-xl md:text-2xl opacity-80">🎬</span>
              <span className="absolute -bottom-1 -right-1 text-xs md:text-lg font-bold bg-black/50 rounded-full w-4 h-4 md:w-5 md:h-5 flex items-center justify-center drop-shadow-lg text-white">↻</span>
            </div>
          </button>

          <button onClick={() => setKaraokeMode(!karaokeMode)} title="Modo Karaoke" className={`transition group p-1 md:p-2 drop-shadow-md flex justify-center relative shrink-0 ${karaokeMode ? "text-green-400" : "text-gray-300 hover:text-white"}`}>
            <span className="text-xl md:text-2xl">🎤</span>
            {!karaokeMode && (
              <span className="absolute inset-0 flex items-center justify-center text-red-500 text-3xl md:text-4xl pointer-events-none font-bold select-none drop-shadow-md" style={{ textShadow: "0 0 4px black" }}>
                ✕
              </span>
            )}
          </button>

          <button
            onClick={handleRetrySearch}
            title="Re-buscar Letra"
            className="text-gray-300 hover:text-white transition group p-1 md:p-2 drop-shadow-md flex justify-center relative hover:scale-110 active:scale-95 duration-200 shrink-0"
          >
            <div className="relative w-6 h-6 md:w-8 md:h-8 flex items-center justify-center">
              <span className="text-2xl md:text-4xl text-white font-bold drop-shadow-[0_0_2px_black]" style={{ textShadow: "0 0 4px black" }}>♫</span>
              <span className="absolute -bottom-1 -right-1 text-xs md:text-lg font-bold bg-black/50 rounded-full w-4 h-4 md:w-5 md:h-5 flex items-center justify-center drop-shadow-lg text-white">↻</span>
            </div>
          </button>

          <div className="flex justify-center gap-2 md:gap-8 items-center shrink-0">
            <button
              onClick={() => adjustOffset(0.5)}
              title="Adelantar 0.5s"
              className="text-green-600 hover:text-green-500 transition text-lg md:text-3xl font-black bg-transparent px-1 md:px-2"
              style={{
                filter: "drop-shadow(0 0 2px black)",
                textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000"
              }}
            >
              +0.5
            </button>
            <button
              onClick={() => adjustOffset(-0.5)}
              title="Retrasar 0.5s"
              className="text-red-600 hover:text-red-500 transition text-lg md:text-3xl font-black bg-transparent px-1 md:px-2"
              style={{
                filter: "drop-shadow(0 0 2px black)",
                textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000"
              }}
            >
              -0.5
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function parseLyrics(lyrics: string | null | undefined) {
  if (!lyrics) return { isSynced: false, content: "", lines: [] };
  const isSynced = /\[\d+:\d+\.\d+\]/.test(lyrics);
  if (!isSynced) return { isSynced: false, content: lyrics, lines: [] };

  const lines = lyrics.split("\n").map(line => {
    const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
    if (match) {
      const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
      return { time, text: match[3].trim() };
    }
    return null;
  }).filter(Boolean) as { time: number; text: string }[];
  return { isSynced: true, lines };
}

function AutoSizeText({
  text,
  maxFontSize = 300,
  minFontSize = 20,
  color = "text-white",
  opacity = 100,
  blur = false
}: { text: string; maxFontSize?: number; minFontSize?: number; color?: string; opacity?: number; blur?: boolean }) {

  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [fontSize, setFontSize] = useState(maxFontSize);
  const [ready, setReady] = useState(false);
  const [resizeTrigger, setResizeTrigger] = useState(0);

  // Re-run size calculation when text changes OR container resizes
  useLayoutEffect(() => {
    setReady(false);
    setFontSize(maxFontSize);
  }, [text, maxFontSize, resizeTrigger]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      setResizeTrigger(prev => prev + 1);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    let currentSize = fontSize;
    let iteration = 0;

    textEl.style.fontSize = `${currentSize}px`;

    const checkOverflow = () => {
      const heightOverflow = textEl.scrollHeight > container.clientHeight;
      const widthOverflow = textEl.scrollWidth > container.clientWidth;
      return heightOverflow || widthOverflow;
    };

    while (checkOverflow() && currentSize > minFontSize && iteration < 50) {
      currentSize *= 0.90;
      textEl.style.fontSize = `${currentSize}px`;
      iteration++;
    }

    setFontSize(currentSize);
    setReady(true);
  }, [text, fontSize, minFontSize]);

  const content = (!text || text.trim() === "" || text.includes("Instrumental"))
    ? <span style={{ fontSize: `${maxFontSize * 0.4}px`, lineHeight: 1 }}>♫</span>
    : text;

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center overflow-hidden px-1">
      <p
        ref={textRef}
        className={`text-center font-bold tracking-tight break-words whitespace-normal leading-tight transition-opacity duration-300 ${color} ${blur ? 'blur-[0.5px]' : ''}`}
        style={{
          fontSize: `${fontSize}px`,
          opacity: ready ? (opacity / 100) : 0,
          textShadow: "4px 4px 0px #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          maxWidth: '100%'
        }}
      >
        {content}
      </p>
    </div >
  );
}

function FullLyricsView({ lyrics, currentTime }: { lyrics: string; currentTime: number }) {
  const { isSynced, lines, content } = parseLyrics(lyrics);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSynced || !lines || !lines.length || !scrollRef.current) return;
    const activeIndex = lines.findIndex((line, i) => {
      const nextLine = lines[i + 1];
      return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
    });

    if (activeIndex !== -1) {
      const el = scrollRef.current.children[activeIndex] as HTMLElement;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [currentTime, isSynced, lines]);

  if (!isSynced) {
    return <div className="h-full overflow-y-auto w-full text-center p-4">
      {content ? (
        <pre className="whitespace-pre-wrap font-sans text-xl leading-relaxed text-gray-100">{content}</pre>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50">
          <span className="text-4xl text-white">♫</span>
          <p className="text-xl">Instrumental / Letra no disponible</p>
        </div>
      )}
    </div>;
  }
  const activeIndex = lines!.findIndex((line, i) => {
    const nextLine = lines![i + 1];
    return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
  });
  return (
    <div ref={scrollRef} className="h-full w-full overflow-y-auto px-2 py-10 flex flex-col items-center gap-6 no-scrollbar custom-mask">
      {lines!.map((line, i) => (
        <p
          key={i}
          className={`transition-all duration-300 text-center max-w-3xl cursor-pointer ${i === activeIndex ? "text-3xl md:text-5xl font-bold text-white scale-105" : "text-xl md:text-3xl text-gray-400 blur-[0.5px] hover:blur-none hover:text-gray-300"}`}
          style={{
            textShadow: i === activeIndex
              ? "2px 2px 0px #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000"
              : undefined
          }}
        >
          {line.text}
        </p>
      ))}
    </div>
  );
}

function KaraokeView({ lyrics, currentTime }: { lyrics: string; currentTime: number }) {
  const { isSynced, lines } = parseLyrics(lyrics);

  if (!isSynced) {
    return (
      <div className="flex flex-col items-center justify-center h-full max-w-4xl text-center gap-4">
        <p className="text-3xl font-bold text-white drop-shadow-md leading-relaxed whitespace-pre-wrap max-h-full overflow-y-auto p-4 mask-fade">
          {lyrics}
        </p>
        <p className="text-sm text-yellow-300 bg-black/50 px-3 py-1 rounded-full">No sincronizada</p>
      </div>
    );
  }

  const activeIndex = lines!.findIndex((line, i) => {
    const nextLine = lines![i + 1];
    return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
  });
  const safeIndex = activeIndex === -1 ? 0 : activeIndex;
  const currentLine = lines![safeIndex];
  const nextLine = lines![safeIndex + 1];

  return (
    <div className="flex flex-col h-full w-full justify-between py-2 max-w-6xl mx-auto">
      <div className="h-[75%] w-full flex items-center justify-center p-1 relative">
        <AutoSizeText
          text={currentLine?.text}
          maxFontSize={400}
          minFontSize={40}
          color="text-white"
        />
      </div>

      <div className="h-[25%] w-full flex items-center justify-center p-1 border-t border-white/10">
        <AutoSizeText
          text={nextLine?.text}
          maxFontSize={120}
          minFontSize={20}
          color="text-gray-200"
          opacity={80}
        />
      </div>
    </div>
  );
}
