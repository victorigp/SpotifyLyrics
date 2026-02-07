'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import YouTube from 'react-youtube';

interface VideoBackgroundProps {
    artist: string;
    track: string;
    userId: string;
    skipTrigger?: number;
    onLoadStatus?: (status: 'searching' | 'playing' | 'error') => void;
    onError?: () => void;
}

export default function VideoBackground({ artist, track, userId, skipTrigger, onLoadStatus, onError: onParentError }: VideoBackgroundProps) {
    const [videoQueue, setVideoQueue] = useState<string[]>([]);
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const [isReady, setIsReady] = useState(false);
    const playerRef = useRef<any>(null);

    const onLoadStatusRef = useRef(onLoadStatus);
    useEffect(() => {
        onLoadStatusRef.current = onLoadStatus;
    }, [onLoadStatus]);

    const badIndicesRef = useRef<Set<number>>(new Set());
    const manuallySkippedRef = useRef(false);

    const currentVideoId = videoQueue[currentVideoIndex] || null;

    const getNextValidIndex = useCallback((startIndex: number, queueLength: number) => {
        if (queueLength === 0) return -1;
        let nextIndex = (startIndex + 1) % queueLength;
        let attempts = 0;
        while (badIndicesRef.current.has(nextIndex) && attempts < queueLength) {
            nextIndex = (nextIndex + 1) % queueLength;
            attempts++;
        }
        if (attempts >= queueLength) return -1;
        return nextIndex;
    }, []);

    const lastSkipTriggerRef = useRef(skipTrigger || 0);

    useEffect(() => {
        if (skipTrigger && skipTrigger > lastSkipTriggerRef.current && videoQueue.length > 0) {
            lastSkipTriggerRef.current = skipTrigger;
            manuallySkippedRef.current = true;

            const nextIndex = getNextValidIndex(currentVideoIndex, videoQueue.length);

            if (nextIndex !== -1) {
                setCurrentVideoIndex(nextIndex);
                setIsReady(false);
                if (onLoadStatusRef.current) onLoadStatusRef.current('searching');
            }
        }
    }, [skipTrigger, videoQueue.length, currentVideoIndex, getNextValidIndex]);

    useEffect(() => {
        lastSavedIdRef.current = null;
        badIndicesRef.current.clear();
        manuallySkippedRef.current = false;
        setVideoQueue([]);
        setCurrentVideoIndex(0);
        setIsReady(false);
        if (onLoadStatusRef.current) onLoadStatusRef.current('searching');
    }, [artist, track, userId]);

    useEffect(() => {
        let active = true;
        const fetchVideo = async () => {
            if (videoQueue.length === 0 && onLoadStatusRef.current) onLoadStatusRef.current('searching');

            try {
                // Add timestamp to avoid caching logic issues
                const res = await fetch(`/api/video?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}&userId=${encodeURIComponent(userId)}&_t=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();

                    if (active) {
                        if (data.videoIds && data.videoIds.length > 0) {
                            setVideoQueue(data.videoIds);

                            // Navigation Logic: Jump to preferred video if exists
                            let startIndex = 0;
                            const prefId = data.preferredVideoId || data.debugPref;

                            if (prefId) {
                                const foundIndex = data.videoIds.indexOf(prefId);
                                if (foundIndex !== -1) {
                                    startIndex = foundIndex;
                                }
                            }

                            setCurrentVideoIndex(startIndex);
                            badIndicesRef.current.clear();
                            setIsReady(false);
                        } else {
                            if (onParentError) onParentError();
                            if (onLoadStatusRef.current) onLoadStatusRef.current('error');
                        }
                    }
                }
            } catch (e) {
                console.error("Video fetch error", e);
                if (onParentError) onParentError();
                if (onLoadStatusRef.current) onLoadStatusRef.current('error');
            }
        };

        const timer = setTimeout(() => {
            fetchVideo();
        }, 1000);

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [artist, track, userId, onParentError]);

    const opts = {
        height: '100%',
        width: '100%',
        playerVars: {
            autoplay: 1,
            controls: 0,
            rel: 0,
            showinfo: 0,
            mute: 1,
            loop: 1,
            playlist: currentVideoId,
            modestbranding: 1,
            iv_load_policy: 3,
            cc_load_policy: 0,
            fs: 0,
            playsinline: 1,
            origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
    };

    const onReady = (event: any) => {
        event.target.mute();
        event.target.playVideo();
        playerRef.current = event.target;
    };

    const lastSavedIdRef = useRef<string | null>(null);

    const handlePlay = (event: any) => {
        setIsReady(true);
        if (onLoadStatusRef.current) onLoadStatusRef.current('playing');

        const isDifferent = currentVideoId !== lastSavedIdRef.current;
        const isIndexZero = currentVideoIndex === 0;
        const hasInteracted = manuallySkippedRef.current;

        // Save if it's a new video AND (it's not the first one OR the user manually navigated to it)
        const shouldSave = isDifferent && (!isIndexZero || hasInteracted);

        if (shouldSave && currentVideoId) {
            lastSavedIdRef.current = currentVideoId;

            fetch('/api/video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    artist,
                    track,
                    videoId: currentVideoId,
                    userId
                })
            }).catch(console.error);
        }

        event.target.playVideo();
    };

    const onStateChange = (event: any) => {
        if (event.data === 1 || event.data === 3) handlePlay(event);
        if (event.data === 0) {
            event.target.playVideo();
        }
    };

    const onError = (e: any) => {
        console.warn(`Video play error (Index ${currentVideoIndex}/${videoQueue.length}):`, e);

        if (currentVideoId && userId) {
            fetch('/api/video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    artist,
                    track,
                    videoId: currentVideoId,
                    userId,
                    status: 'failed'
                })
            }).catch(err => console.error("Error reporting failure", err));
        }

        badIndicesRef.current.add(currentVideoIndex);

        if (videoQueue.length > 0) {
            let nextIndex = (currentVideoIndex + 1) % videoQueue.length;
            let attempts = 0;
            while (badIndicesRef.current.has(nextIndex) && attempts < videoQueue.length) {
                nextIndex = (nextIndex + 1) % videoQueue.length;
                attempts++;
            }

            if (attempts < videoQueue.length) {
                setCurrentVideoIndex(nextIndex);
                setIsReady(false);
                return;
            }
        }

        if (onParentError) onParentError();
        if (onLoadStatusRef.current) onLoadStatusRef.current('error');
    };

    if (!currentVideoId) return null;

    return (
        <div className={`absolute inset-0 w-full h-full overflow-hidden pointer-events-none transition-opacity duration-1000 ${isReady ? 'opacity-100' : 'opacity-0'}`}>
            <div className="absolute inset-0 w-full h-full">
                <YouTube
                    key={currentVideoId}
                    videoId={currentVideoId}
                    opts={opts}
                    onReady={onReady}
                    onStateChange={onStateChange}
                    onError={onError}
                    className="absolute inset-0 w-full h-full object-cover"
                    iframeClassName="w-full h-full object-cover"
                />
            </div>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
        </div>
    );
}
