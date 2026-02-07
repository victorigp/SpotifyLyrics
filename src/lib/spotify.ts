export async function getSpotifyNowPlaying(accessToken: string) {
    const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (res.status === 204 || res.status > 400) {
        return null;
    }

    return res.json();
}
