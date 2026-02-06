"use client";

import { useEffect, useState, useRef, useLayoutEffect } from "react";
import Image from "next/image";

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
  const [lyricOffset, setLyricOffset] = useState(0);

  const [track, setTrack] = useState<Track | null>(null);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [currentSearchType, setCurrentSearchType] = useState<string>("auto");

  const [trackStartTime, setTrackStartTime] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [feedbacks, setFeedbacks] = useState<FloatingFeedback[]>([]);

  const lockingTrackNameRef = useRef<string | null>(null);
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("lastfm_username");
    if (stored) {
      setUsername(stored);
      setIsSet(true);
    }
  }, []);

  const handleSetUser = () => {
    if (username.trim()) {
      localStorage.setItem("lastfm_username", username.trim());
      setIsSet(true);
    }
  };

  const handleClearUser = () => {
    localStorage.removeItem("lastfm_username");
    setIsSet(false);
    setTrack(null);
    setLyrics(null);
    setUsername("");
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

  const adjustOffset = (amount: number) => {
    setLyricOffset(prev => prev + amount);
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


  useEffect(() => {
    if (!isSet || !username) return;

    lockingTrackNameRef.current = null;

    const fetchNowPlaying = async () => {
      try {
        const res = await fetch(`/api/now-playing?username=${encodeURIComponent(username)}`);
        if (!res.ok) return;

        const data = await res.json();

        if (data.isPlaying && data.track) {
          if (!lockingTrackNameRef.current || lockingTrackNameRef.current !== data.track.name) {
            lockingTrackNameRef.current = data.track.name;
            if (searchAbortControllerRef.current) {
              searchAbortControllerRef.current.abort();
            }

            setTrack(data.track);
            setLyrics(null);
            setLyricOffset(0);
            setCurrentSearchType("auto");

            const now = Date.now();
            setTrackStartTime(USE_LASTFM_COMPENSATION ? (now - LASTFM_LATENCY_OFFSET) : now);
            fetchLyricsWithSteps(data.track);
          }
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
  }, [isSet, username]);

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

    const handleSuccess = (data: any, type: string) => {
      if (signal.aborted) return;
      setLyrics(data);
      setCurrentSearchType(type);
      setLoadingStatus(null);
      setCachedProvider(currentTrack.artist, currentTrack.name, type);
    };

    if (!specificType) {
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
      <div className="flex flex-col items-center justify-center min-vh-100 h-dvh p-4 bg-black text-white">
        <h1 className="text-4xl font-bold mb-8 text-green-500 text-center">Spotify Lyrics</h1>
        <div className="flex flex-col gap-4 max-w-sm w-full">
          <input
            type="text"
            placeholder="Introduce tu usuario de Last.fm"
            className="p-4 rounded-lg bg-gray-800 text-white border border-gray-700"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button onClick={handleSetUser} className="px-8 py-4 bg-green-600 rounded-lg font-bold hover:bg-green-700 transition">
            Comenzar a Escuchar
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
            src={track.albumArt}
            alt="Background"
            fill
            className="object-cover opacity-60 blur-sm"
            priority
          />
        )}
        <div className="absolute inset-0 bg-black/20" />
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
          ) : (
            <p className="text-xs text-gray-400">Esperando música...</p>
          )}
        </header>

        <main className="flex-1 h-[90%] w-full flex justify-center items-center px-2 md:px-8 overflow-hidden relative">
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
        </main>

        <footer className="h-[5%] min-h-[50px] shrink-0 flex justify-center items-center gap-4 md:gap-12 px-2 z-20 pb-safe w-full">
          <button onClick={handleClearUser} title="Inicio" className="text-gray-300 hover:text-white transition group p-2 min-w-[30px] drop-shadow-md flex justify-center">
            <span className="text-xl md:text-2xl">🏠</span>
          </button>

          <button onClick={toggleFullScreen} title="Pantalla Completa" className="text-gray-300 hover:text-white transition group p-2 min-w-[30px] drop-shadow-md flex justify-center">
            <span className="text-xl md:text-2xl">⛶</span>
          </button>

          <button onClick={() => setKaraokeMode(!karaokeMode)} title="Modo Karaoke" className={`transition group p-2 drop-shadow-md flex justify-center ${karaokeMode ? "text-green-400" : "text-gray-300 hover:text-white"}`}>
            <span className="text-xl md:text-2xl">🎤</span>
          </button>

          <button onClick={handleRetrySearch} title="Re-buscar Letra" className="text-gray-300 hover:text-white transition group p-2 min-w-[30px] drop-shadow-md flex justify-center hover:rotate-180 duration-500">
            <span className="text-3xl md:text-4xl font-bold">↻</span>
          </button>

          <div className="flex justify-center gap-4 md:gap-8 items-center">
            <button
              onClick={() => adjustOffset(0.5)}
              title="Adelantar 0.5s"
              className="text-green-600 hover:text-green-500 transition text-2xl md:text-3xl font-black bg-transparent px-1 md:px-2"
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
              className="text-red-600 hover:text-red-500 transition text-2xl md:text-3xl font-black bg-transparent px-1 md:px-2"
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

  useLayoutEffect(() => {
    setReady(false);
    setFontSize(maxFontSize);
  }, [text, maxFontSize]);

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
          textShadow: "0 4px 16px rgba(0,0,0,0.8)",
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          maxWidth: '100%'
        }}
      >
        {content}
      </p>
    </div>
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
        <p key={i} className={`transition-all duration-300 text-center max-w-3xl cursor-pointer ${i === activeIndex ? "text-3xl md:text-5xl font-bold text-white scale-105" : "text-xl md:text-3xl text-gray-400 blur-[0.5px] hover:blur-none hover:text-gray-300"}`}>
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
