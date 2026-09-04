import app from './src/app.js';
import config from './src/config/config.js';
import mongoConnect from './src/config/db.config.js';
import { WebSocketServer } from 'ws';
import { attachSocket } from './src/services/roomManager.js';
const port = config.port;
const server = app.listen(port, () => {
    console.log(`server is running on port ${port}`)
})

const webSocketServer = new WebSocketServer({ server, path: '/ws' });
webSocketServer.on('connection', attachSocket);

mongoConnect();



