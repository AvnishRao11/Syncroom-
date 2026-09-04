import { createRoom, getRoom } from '../services/room.service.js';

export async function createRoomController(req, res) {
    try {
        const name = String(req.body?.name || '').trim().slice(0, 40) || 'Host';
        const room = await createRoom(name);
        return res.status(201).json(room);
    } catch (error) {
        return res.status(500).json({ error: 'Unable to create room' });
    }
}

export async function getRoomController(req, res) {
    const room = await getRoom(req.params.code);

    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }

    return res.json(room);
}