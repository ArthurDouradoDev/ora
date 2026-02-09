
const testUrls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/playlist?list=PL1234567890ABCDEF',
    'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
    'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    'spotify:track:4cOdK2wGLETKBW3PvgPWqT',
    'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M',
    'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3'
];

function test(input) {
    console.log(`Testing: ${input}`);
    let newPlaylist = null;
    
    // YouTube detection
    if (input.includes('youtube.com') || input.includes('youtu.be')) {
        const playlistMatch = input.match(/[?&]list=([a-zA-Z0-9_-]+)/);
        const videoMatch = input.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
        
        if (playlistMatch) {
            console.log('  -> YouTube Playlist:', playlistMatch[1]);
        } else if (videoMatch) {
            console.log('  -> YouTube Video:', videoMatch[1]);
        } else {
            console.log('  -> YouTube regex failed');
        }
    }
    // Spotify detection
    else if (input.includes('spotify.com') || input.includes('spotify:')) {
        const urlMatch = input.match(/spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)/);
        const uriMatch = input.match(/spotify:(playlist|album|track):([a-zA-Z0-9]+)/);
        
        const match = urlMatch || uriMatch;
        
        if (match) {
            console.log(`  -> Spotify ${match[1]}:`, match[2]);
        } else {
            console.log('  -> Spotify regex failed');
        }
    } else {
        console.log('  -> Unknown URL type');
    }
}

testUrls.forEach(test);
