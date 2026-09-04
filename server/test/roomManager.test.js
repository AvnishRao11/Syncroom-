import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { WebSocketServer, WebSocket } from 'ws';
import Room from '../src/models/room.model.js';
import { createRoom } from '../src/services/room.service.js';
import { attachSocket } from '../src/services/roomManager.js';

function listen(server) {
    return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
    return new Promise((resolve) => server.close(resolve));
}

function waitForMessage(socket, type) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            socket.off('message', onMessage);
            reject(new Error(`Timed out waiting for ${type}`));
        }, 3000);
        const onMessage = (raw) => {
            const message = JSON.parse(raw.toString());
            if (message.type !== type) return;
            clearTimeout(timeout);
            socket.off('message', onMessage);
            resolve(message);
        };
        socket.on('message', onMessage);
    });
}

function openClient(port) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        socket.once('open', () => resolve(socket));
        socket.once('error', reject);
    });
}

test('synchronizes joins and permits playback only for the host', { skip: !process.env.MONGODB_URI }, async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const created = await createRoom('Test Host');
    const httpServer = createServer();
    const webSocketServer = new WebSocketServer({ server: httpServer, path: '/ws' });
    webSocketServer.on('connection', attachSocket);
    await listen(httpServer);
    const port = httpServer.address().port;
    const host = await openClient(port);
    const participant = await openClient(port);

    try {
        const hostSync = waitForMessage(host, 'sync_state');
        host.send(JSON.stringify({ type: 'join_room', code: created.code, name: 'Test Host', userId: created.hostId }));
        assert.equal((await hostSync).room.participants[0].name, 'Test Host');

        const joined = waitForMessage(host, 'user_joined');
        const participantSync = waitForMessage(participant, 'sync_state');
        participant.send(JSON.stringify({ type: 'join_room', code: created.code, name: 'Test Viewer' }));
        assert.equal((await participantSync).room.participants.at(-1).name, 'Test Viewer');
        assert.equal((await joined).participant.name, 'Test Viewer');
        const participantId = (await participantSync).userId;

        const hostTransfer = waitForMessage(host, 'host_transferred');
        const participantTransfer = waitForMessage(participant, 'host_transferred');
        host.send(JSON.stringify({ type: 'transfer_host', participantId }));
        assert.equal((await hostTransfer).hostId, participantId);
        assert.equal((await participantTransfer).hostId, participantId);
        assert.equal((await Room.findOne({ code: created.code }).lean()).hostId, participantId);

        const transferBack = waitForMessage(host, 'host_transferred');
        participant.send(JSON.stringify({ type: 'transfer_host', participantId: created.hostId }));
        assert.equal((await transferBack).hostId, created.hostId);

        const roleUpdate = waitForMessage(participant, 'role_assigned');
        host.send(JSON.stringify({ type: 'assign_role', participantId, role: 'participant' }));
        assert.equal((await roleUpdate).role, 'participant');

        const hostPlayback = waitForMessage(participant, 'seek');
        host.send(JSON.stringify({ type: 'seek', currentTime: 42 }));
        assert.equal((await hostPlayback).currentTime, 42);
        assert.equal((await Room.findOne({ code: created.code }).lean()).currentTime, 42);

        const hostVideoChange = waitForMessage(host, 'change_video');
        const participantVideoChange = waitForMessage(participant, 'change_video');
        host.send(JSON.stringify({ type: 'change_video', videoId: 'dQw4w9WgXcQ' }));
        assert.equal((await hostVideoChange).videoId, 'dQw4w9WgXcQ');
        assert.equal((await participantVideoChange).videoId, 'dQw4w9WgXcQ');

        const participantError = waitForMessage(participant, 'error');
        participant.send(JSON.stringify({ type: 'seek', currentTime: 99 }));
        assert.match((await participantError).message, /watch-only access/i);
        const stored = await Room.findOne({ code: created.code }).lean();
        assert.equal(stored.currentTime, 0);

        const left = waitForMessage(host, 'user_left');
        participant.send(JSON.stringify({ type: 'leave_room' }));
        assert.equal((await left).participantId, (await participantSync).userId);

        const replacement = await openClient(port);
        try {
            const replacementSync = waitForMessage(replacement, 'sync_state');
            const replacementJoined = waitForMessage(host, 'user_joined');
            replacement.send(JSON.stringify({ type: 'join_room', code: created.code, name: 'Remove Me' }));
            const replacementState = await replacementSync;
            const replacementParticipant = (await replacementJoined).participant;
            assert.equal(replacementParticipant.name, 'Remove Me');

            const removed = waitForMessage(replacement, 'participant_removed');
            host.send(JSON.stringify({ type: 'remove_participant', participantId: replacementState.userId }));
            await removed;
            assert.equal((await Room.findOne({ code: created.code }).lean()).participants.some((item) => item.id === replacementState.userId), false);
        } finally {
            replacement.close();
        }
    } finally {
        host.close();
        participant.close();
        await new Promise((resolve) => webSocketServer.close(resolve));
        await close(httpServer);
        await Room.deleteOne({ code: created.code });
        await mongoose.disconnect();
    }
});
