# Syncroom

Syncroom is an anonymous YouTube watch-party MVP. People join a shared room, watch the same video, and receive synchronized playback updates without creating an account.

## Stack

- Frontend: React, Vite, Tailwind CSS, React Context API
- Backend: Node.js, Express, native WebSockets (`ws`)
- Database: MongoDB with Mongoose
- Video: YouTube IFrame Player API

The frontend deliberately uses React Context instead of Redux or another state-management library.

## Project Structure

```text
client/vite-project/
  src/App.jsx       React UI, Context state, WebSocket client, YouTube player
  src/App.css       Application visual system and light/dark themes
server/
  server.js         Express and WebSocket server entry point
  src/controllers/ HTTP request handlers
  src/models/      MongoDB schemas
  src/routes/      Express route definitions
  src/services/    Room persistence, URL validation, WebSocket room manager
  test/             Node test runner and WebSocket integration tests
PROGRESS.md        Implementation status and remaining work
```

## Local Setup

### Requirements

- Node.js 18 or newer
- A reachable MongoDB database

### Backend

```powershell
cd server
npm install
Copy-Item .env.example .env
npm run dev
```

Set these values in `server/.env`:

```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/syncroom
```

The backend exposes HTTP on `http://localhost:3000` and WebSockets at `ws://localhost:3000/ws`.

### Frontend

```powershell
cd client/vite-project
npm install
npm run dev
```

Open the Vite URL shown in the terminal, normally `http://localhost:5173`. The client defaults to the API at `http://localhost:3000`; set `VITE_API_URL` when the backend uses another URL.

## User Flow

1. Enter a display name.
2. Create a room or enter a six-character room code.
3. Share the generated `?room=ROOMCODE` URL.
4. Load a valid YouTube URL from the host or moderator controls.
5. Use play, pause, and seek controls to synchronize viewers.
6. The host can assign moderator status, transfer ownership, or remove participants.
7. Anyone can leave using the Leave room action.

## Roles and Permissions

| Capability         | Host | Moderator | Participant |
| ------------------ | ---- | --------- | ----------- |
| Watch video        | Yes  | Yes       | Yes         |
| Play/pause         | Yes  | Yes       | No          |
| Seek               | Yes  | Yes       | No          |
| Change video       | Yes  | Yes       | No          |
| Assign moderator   | Yes  | No        | No          |
| Remove participant | Yes  | No        | No          |
| Transfer host      | Yes  | No        | No          |
| Leave room         | Yes  | Yes       | Yes         |

Permissions are enforced on the backend. The frontend also hides or disables participant playback controls and blocks interaction with the YouTube timeline for watch-only users.

## HTTP API

- `GET /health` returns `{ "status": "ok" }`.
- `POST /api/rooms` creates a room. Optional JSON body: `{ "name": "Host name" }`.
- `GET /api/rooms/:code` retrieves persisted room state.

## WebSocket Events

Client messages:

- `join_room`: join by code with `name` and optional `userId`.
- `leave_room`: leave the active room.
- `play`, `pause`, `seek`: playback actions with a timestamp.
- `change_video`: load a validated YouTube URL or video ID.
- `assign_role`: host assigns `moderator` or `participant`.
- `remove_participant`: host removes an active participant.
- `transfer_host`: host transfers ownership to another active participant.

Server messages:

- `sync_state`: current room, participants, video, and playback state.
- `user_joined`, `user_left`: live participant changes.
- `play`, `pause`, `seek`, `change_video`: synchronized playback updates.
- `role_assigned`: participant role update.
- `participant_removed`: removal notification.
- `error`: validation or permission error.

## Validation and Tests

Run backend tests from `server`:

```powershell
npm test
```

The test suite covers YouTube URL parsing, supported URL formats, invalid domains, named joins, initial synchronization, real-time join notifications, host playback propagation, participant permission rejection, explicit leaving, and host removal.

Run frontend checks from `client/vite-project`:

```powershell
npm run lint
npm run build
```

## Manual Two-Browser Test

1. Start MongoDB, the backend, and the frontend.
2. In browser window A, enter a name and create a room.
3. Copy the room URL.
4. Open the URL in browser window B or an incognito window and enter another name.
5. Confirm B appears immediately in A's participant list.
6. Load a YouTube video from A and confirm it appears in B.
7. Play, pause, and seek from A; confirm B follows.
8. Try changing the timeline in B; confirm B cannot change shared state.
9. Promote B to moderator and verify playback controls become available.
10. Remove B from A and confirm B returns to the removed state.
11. Close and reopen a browser connection to verify reconnect behavior.

## Vercel Frontend Deployment

Deploy only `client/vite-project` as the Vercel project root.

1. Push the repository to GitHub and import it into Vercel.
2. Set the Vercel **Root Directory** to `client/vite-project`.
3. Use the Vite defaults: build command `npm run build`, output directory `dist`, install command `npm install`.
4. Add this frontend environment variable in Vercel for Production, Preview, and Development:

```env
VITE_API_URL=https://your-deployed-backend.example.com
```

Use the backend origin only. Do not append `/ws` or `/api/rooms`; the client adds those paths itself. Because Vercel environment variables are embedded into the browser bundle, never put `MONGODB_URI` or any secret in the frontend project.

The backend must be deployed separately with WebSocket support. Its public HTTPS origin is automatically converted to `wss://` by the client for the `/ws` connection. Update backend CORS settings with the Vercel domain if you later restrict CORS.

## Deployment Notes

The app can be deployed as two services on Render or Railway:

- Backend service: working directory `server`, start command `npm start`.
- Frontend service: working directory `client/vite-project`, build command `npm run build`, serve the `dist` directory.
- Backend environment: `PORT`, `MONGODB_URI`, and `CLIENT_ORIGIN` set to the Vercel origin, for example `https://syncroom-gray.vercel.app` without a trailing slash.
- Frontend environment: `VITE_API_URL` set to the public backend origin; see the Vercel instructions above.
- Configure the frontend host as a static site and ensure the backend allows its origin through CORS.
- Use a MongoDB Atlas database with network access restricted to the deployment service where possible.
- Do not commit `server/.env` or expose database credentials.

There is no live deployment URL yet.

## Scope Limits

Authentication, chat,Redis scaling, multi-server room state, and continuous per-second playback persistence are outside the current MVP scope.
