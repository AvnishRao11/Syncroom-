import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import roomRoutes from './routes/room.routes.js';

const app=express();

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: 'https://syncroom-gray.vercel.app/',
}));
app.use('/api/rooms', roomRoutes);

app.get('/health',(req,res)=>{
    res.json({ status: 'ok' })
})

export default app;

