import { Router } from 'express';
import { createRoomController, getRoomController } from '../controllers/room.controller.js';

const router = Router();
router.post('/', createRoomController);
router.get('/:code', getRoomController);

export default router;