export async function getSpotifyNowPlaying(accessToken: string) {
    const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (res.status === 204) {
        return null;
    }

    if (!res.ok) {
        const error: any = new Error(`Spotify API Error: ${res.status} ${res.statusText}`);
        error.status = res.status;
        throw error;
    }

    return res.json();
}
