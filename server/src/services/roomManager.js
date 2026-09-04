import crypto from 'node:crypto';
import Room from '../models/room.model.js';
import { videoIdFromUrl } from './room.service.js';

const rooms = new Map();
const send = (socket, type, payload) => socket.readyState === 1 && socket.send(JSON.stringify({ type, ...payload }));
const broadcast = (room, type, payload, except) => room.clients.forEach((client) => client.socket !== except && send(client.socket, type, payload));

async function snapshot(code) {
    const saved = await Room.findOne({ code }).lean();
    const active = rooms.get(code);
    return { ...saved, participants: active ? [...active.clients.values()].map(({ id, name, role }) => ({ id, name, role })) : saved.participants };
}

function leaveSession(session, notify = true) {
    if (!session) return;
    const active = rooms.get(session.code);
    if (!active) return;

    active.clients.delete(session.socket);
    if (notify) {
        broadcast(active, 'user_left', { participantId: session.id });
    }
    if (active.clients.size === 0) {
        rooms.delete(session.code);
    }
}

export async function attachSocket(socket) {
    let session;
    socket.on('message', async (raw) => {
        try {
            const message = JSON.parse(raw.toString());
            if (message.type === 'join_room') {
                const code = String(message.code || '').toUpperCase();
                if (!/^[A-Z0-9]{6}$/.test(code)) {
                    return send(socket, 'error', { message: 'Room codes must be six characters.' });
                }
                const room = await Room.findOne({ code });
                if (!room) return send(socket, 'error', { message: 'That room does not exist.' });
                const id = message.userId || crypto.randomUUID();
                const name = String(message.name || '').trim().slice(0, 40);
                if (!name) return send(socket, 'error', { message: 'Choose a name before joining the room.' });
                const role = room.hostId === id ? 'host' : (room.participants.find((item) => item.id === id)?.role || 'participant');
                if (!rooms.has(code)) rooms.set(code, { clients: new Map() });
                const active = rooms.get(code);
                const previousSession = [...active.clients.values()].find((client) => client.id === id);
                if (previousSession) {
                    active.clients.delete(previousSession.socket);
                    previousSession.socket.close();
                }
                if (session) leaveSession(session);
                session = { id, name, role, code, socket };
                active.clients.set(socket, session);
                await Room.updateOne({ code, 'participants.id': { $ne: id } }, { $push: { participants: { id, name, role } } });
                await Room.updateOne({ code, 'participants.id': id }, { $set: { 'participants.$.name': name } });
                send(socket, 'sync_state', { room: await snapshot(code), userId: id });
                broadcast(active, 'user_joined', { participant: { id, name, role } }, socket);
                return;
            }
            if (!session) return send(socket, 'error', { message: 'Join a room first.' });
            const active = rooms.get(session.code);
            if (message.type === 'leave_room') {
                leaveSession(session);
                session = undefined;
                return socket.close();
            }
            if (['play', 'pause', 'seek', 'change_video'].includes(message.type) && !['host', 'moderator'].includes(session.role)) {
                return send(socket, 'error', { message: 'Participants have watch-only access. Only the host or a moderator can change playback.' });
            }
            if (message.type === 'change_video') {
                const videoId = videoIdFromUrl(message.url || '') || videoIdFromUrl(message.videoId || '');
                if (!videoId) return send(socket, 'error', { message: 'Enter a valid YouTube URL.' });
                await Room.updateOne({ code: session.code }, { videoId, isPlaying: false, currentTime: 0 });
                broadcast(active, 'change_video', { videoId, currentTime: 0, isPlaying: false });
                return send(socket, 'change_video', { videoId, currentTime: 0, isPlaying: false });
            }
            if (['play', 'pause', 'seek'].includes(message.type)) {
                const currentTime = Math.max(0, Number(message.currentTime) || 0);
                const update = message.type === 'seek'
                    ? { currentTime }
                    : { isPlaying: message.type === 'play', currentTime };
                await Room.updateOne({ code: session.code }, update);
                return broadcast(active, message.type, { currentTime }, socket);
            }
            if (message.type === 'assign_role' && session.role === 'host') {
                const target = [...active.clients.values()].find((client) => client.id === message.participantId);
                if (target && ['moderator', 'participant'].includes(message.role)) {
                    target.role = message.role;
                    await Room.updateOne({ code: session.code, 'participants.id': target.id }, { $set: { 'participants.$.role': target.role } });
                    return broadcast(active, 'role_assigned', { participantId: target.id, role: target.role });
                }
            }
            if (message.type === 'transfer_host' && session.role === 'host') {
                const target = [...active.clients.values()].find((client) => client.id === message.participantId);
                if (!target || target.id === session.id) {
                    return send(socket, 'error', { message: 'Choose another active participant as the new host.' });
                }
                session.role = 'moderator';
                target.role = 'host';
                await Room.updateOne({ code: session.code }, {
                    $set: {
                        hostId: target.id,
                        'participants.$[oldHost].role': 'moderator',
                        'participants.$[newHost].role': 'host',
                    },
                }, { arrayFilters: [{ 'oldHost.id': session.id }, { 'newHost.id': target.id }] });
                return broadcast(active, 'host_transferred', { previousHostId: session.id, hostId: target.id });
            }
            if (message.type === 'remove_participant' && session.role === 'host') {
                const target = [...active.clients.values()].find((client) => client.id === message.participantId);
                if (target) {
                    await Room.updateOne({ code: session.code }, { $pull: { participants: { id: target.id } } });
                    send(target.socket, 'participant_removed', {});
                    target.socket.close();
                }
            }
        } catch { send(socket, 'error', { message: 'Invalid message.' }); }
    });
    socket.on('close', () => {
        leaveSession(session);
        session = undefined;
    });
}