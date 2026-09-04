import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import roomRoutes from './routes/room.routes.js';

const app = express();
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,https://syncroom-gray.vercel.app')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: (requestOrigin, callback) => {
        if (!requestOrigin || allowedOrigins.includes(requestOrigin.replace(/\/$/, ''))) {
            return callback(null, true);
        }
        return callback(null, false);
    },
}));
app.use('/api/rooms', roomRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' })
})

export default app;

