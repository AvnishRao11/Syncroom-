import crypto from 'node:crypto';
import Room from '../models/room.model.js';

const makeCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const makeId = () => crypto.randomUUID();

export async function createRoom(name = 'Host') {
    let code = makeCode();
    while (await Room.exists({ code })) code = makeCode();
    const hostId = makeId();
    const room = await Room.create({ code, hostId, participants: [{ id: hostId, name, role: 'host' }] });
    return { code: room.code, hostId, videoId: room.videoId, isPlaying: room.isPlaying, currentTime: room.currentTime };
}

export function getRoom(code) {
    return Room.findOne({ code: code.toUpperCase() }).lean();
}

export function videoIdFromUrl(value) {
    if (typeof value !== 'string') return null;
    const candidate = value.trim();

    if (/^[A-Za-z0-9_-]{11}$/.test(candidate)) return candidate;

    try {
        const url = new URL(candidate);
        const hostname = url.hostname.toLowerCase();
        let videoId = null;

        if (hostname === 'youtu.be') {
            videoId = url.pathname.split('/').filter(Boolean)[0];
        } else if (hostname === 'youtube.com' || hostname === 'www.youtube.com' || hostname === 'm.youtube.com') {
            videoId = url.searchParams.get('v');
            if (!videoId) {
                const pathParts = url.pathname.split('/').filter(Boolean);
                if (['shorts', 'embed', 'live'].includes(pathParts[0])) videoId = pathParts[1];
            }
        }

        return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
    } catch { return null; }
}