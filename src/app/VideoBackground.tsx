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
    onProgress?: (progress: { current: number; total: number; isDiscoveryComplete: boolean }) => void;
}

export default function VideoBackground({ artist, track, userId, skipTrigger, onLoadStatus, onError: onParentError, onProgress }: VideoBackgroundProps) {
    const [videoQueue, setVideoQueue] = useState<string[]>([]);
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const [isReady, setIsReady] = useState(false);
    const playerRef = useRef<any>(null);

    const onLoadStatusRef = useRef(onLoadStatus);
    useEffect(() => {
        onLoadStatusRef.current = onLoadStatus;
    }, [onLoadStatus]);

    const playedVideoIdsRef = useRef<Set<string>>(new Set());
    const [remoteDiscoveryComplete, setRemoteDiscoveryComplete] = useState(false);
    const manuallySkippedRef = useRef(false);

    const currentVideoId = videoQueue[currentVideoIndex] || null;

    const getNextValidIndex = useCallback((startIndex: number, queueLength: number) => {
        if (queueLength === 0) return -1;
        return (startIndex + 1) % queueLength;
    }, []);

    const checkDiscoveryComplete = useCallback((queue: string[]) => {
        // If remote complete, return true
        if (remoteDiscoveryComplete) return true;
        // If we have played all videos in the current queue
        return queue.length > 0 && queue.every(id => playedVideoIdsRef.current.has(id));
    }, [remoteDiscoveryComplete]);

    const lastSkipTriggerRef = useRef(skipTrigger || 0);

    useEffect(() => {
        if (skipTrigger && skipTrigger > lastSkipTriggerRef.current && videoQueue.length > 0) {
            lastSkipTriggerRef.current = skipTrigger;
            manuallySkippedRef.current = true;

            const nextIndex = getNextValidIndex(currentVideoIndex, videoQueue.length);

            if (nextIndex !== -1) {
                const nextId = videoQueue[nextIndex];
                setCurrentVideoIndex(nextIndex);
                playedVideoIdsRef.current.add(nextId);
                setIsReady(false);
                if (onLoadStatusRef.current) onLoadStatusRef.current('searching');
                if (onProgress) onProgress({ current: nextIndex + 1, total: videoQueue.length, isDiscoveryComplete: checkDiscoveryComplete(videoQueue) });
            }
        }
    }, [skipTrigger, videoQueue.length, currentVideoIndex, getNextValidIndex, checkDiscoveryComplete]);

    useEffect(() => {
        lastSavedIdRef.current = null;
        lastSavedIdRef.current = null;
        playedVideoIdsRef.current.clear();
        setRemoteDiscoveryComplete(false);
        manuallySkippedRef.current = false;
        setVideoQueue([]);
        setCurrentVideoIndex(0);
        setIsReady(false);
        if (onLoadStatusRef.current) onLoadStatusRef.current('searching');
        if (onProgress) onProgress({ current: 0, total: 0, isDiscoveryComplete: false }); // Reset progress
    }, [artist, track, userId, onProgress]);

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
                            setRemoteDiscoveryComplete(!!data.isDiscoveryComplete);

                            // Navigation Logic
                            let startIndex = 0;
                            const prefId = data.preferredVideoId;

                            if (prefId) {
                                const foundIndex = data.videoIds.indexOf(prefId);
                                if (foundIndex !== -1) {
                                    startIndex = foundIndex;
                                }
                            }

                            const startId = data.videoIds[startIndex];
                            setCurrentVideoIndex(startIndex);
                            playedVideoIdsRef.current.clear();
                            if (startId) playedVideoIdsRef.current.add(startId);
                            setIsReady(false);

                            // Calculate initial completion status
                            const isComplete = !!data.isDiscoveryComplete;
                            if (onProgress) onProgress({ current: startIndex + 1, total: data.videoIds.length, isDiscoveryComplete: isComplete });
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
        if (event.data === 1) handlePlay(event);
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

        const failedId = currentVideoId;

        // Remove failed video from queue
        // This is key: Reduce the queue size so "Total" reflects remaining candidates.
        const newQueue = videoQueue.filter(id => id !== failedId);
        setVideoQueue(newQueue);

        if (newQueue.length === 0) {
            if (onParentError) onParentError();
            if (onLoadStatusRef.current) onLoadStatusRef.current('error');
            return;
        }

        // Find next index (stay on same if middle, reset to 0 if end)
        let nextIndex = currentVideoIndex;
        if (nextIndex >= newQueue.length) nextIndex = 0;

        const nextId = newQueue[nextIndex];
        setCurrentVideoIndex(nextIndex);
        playedVideoIdsRef.current.add(nextId);
        setIsReady(false);

        if (onProgress) onProgress({
            current: nextIndex + 1,
            total: newQueue.length,
            isDiscoveryComplete: checkDiscoveryComplete(newQueue)
        });
        if (onLoadStatusRef.current) onLoadStatusRef.current('searching');
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
