import { createContext, useContext, useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");
const PartyContext = createContext(null);
const ThemeContext = createContext(null);

function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("syncroom-theme") === "dark",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    localStorage.setItem("syncroom-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  return (
    <ThemeContext.Provider
      value={{
        darkMode,
        toggleTheme: () => setDarkMode((current) => !current),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

function ThemeToggle() {
  const { darkMode, toggleTheme } = useContext(ThemeContext);
  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span>{darkMode ? "☼" : "◐"}</span>
      <small>{darkMode ? "Light" : "Dark"}</small>
    </button>
  );
}

function PartyProvider({ children }) {
  const [room, setRoom] = useState(null);
  const [socket, setSocket] = useState(null);
  const [connection, setConnection] = useState("offline");
  const [error, setError] = useState("");
  const reconnectRef = useRef({
    code: null,
    name: null,
    userId: null,
    attempt: 0,
    timer: null,
    activeSocket: null,
    intentional: false,
    retryable: true,
  });
  useEffect(() => () => socket?.close(), [socket]);

  const joinRoom = (
    code,
    name,
    userId = sessionStorage.getItem("party-user"),
    isRetry = false,
  ) => {
    const normalizedCode = code.trim().toUpperCase();
    const normalizedName = (name || sessionStorage.getItem("party-name") || "")
      .trim()
      .slice(0, 40);
    if (!normalizedName)
      return setError("Enter your name before joining the room.");
    if (!/^[A-Z0-9]{6}$/.test(normalizedCode))
      return setError("Enter a six-character room code.");
    if (!isRetry) {
      window.clearTimeout(reconnectRef.current.timer);
      reconnectRef.current = {
        ...reconnectRef.current,
        code: normalizedCode,
        name: normalizedName,
        userId,
        attempt: 0,
        intentional: false,
        retryable: true,
      };
    }
    if (!isRetry) {
      socket?.close();
      setRoom(null);
    }
    setError("");
    setConnection("connecting");
    const nextSocket = new WebSocket(`${API_URL.replace(/^http/, "ws")}/ws`);
    reconnectRef.current.activeSocket = nextSocket;
    nextSocket.onopen = () => {
      setConnection("live");
      nextSocket.send(
        JSON.stringify({
          type: "join_room",
          code: normalizedCode,
          name: normalizedName,
          userId,
        }),
      );
    };
    nextSocket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "sync_state") {
        sessionStorage.setItem("party-user", message.userId);
        sessionStorage.setItem("party-name", normalizedName);
        reconnectRef.current.userId = message.userId;
        reconnectRef.current.attempt = 0;
        window.history.replaceState({}, "", `?room=${message.room.code}`);
        setRoom({ ...message.room, userId: message.userId });
      } else if (message.type === "user_joined")
        setRoom(
          (current) =>
            current && {
              ...current,
              participants: [...current.participants, message.participant],
            },
        );
      else if (message.type === "user_left")
        setRoom(
          (current) =>
            current && {
              ...current,
              participants: current.participants.filter(
                (item) => item.id !== message.participantId,
              ),
            },
        );
      else if (message.type === "role_assigned")
        setRoom(
          (current) =>
            current && {
              ...current,
              participants: current.participants.map((item) =>
                item.id === message.participantId
                  ? { ...item, role: message.role }
                  : item,
              ),
            },
        );
      else if (message.type === "host_transferred")
        setRoom(
          (current) =>
            current && {
              ...current,
              hostId: message.hostId,
              participants: current.participants.map((item) =>
                item.id === message.hostId
                  ? { ...item, role: "host" }
                  : item.id === message.previousHostId
                    ? { ...item, role: "moderator" }
                    : item,
              ),
            },
        );
      else if (message.type === "error") {
        setError(message.message);
        setConnection("offline");
        reconnectRef.current.retryable = false;
      } else if (message.type === "participant_removed") {
        setRoom(null);
        setError("You were removed from this room.");
        nextSocket.close();
      } else
        setRoom(
          (current) =>
            current && {
              ...current,
              ...(message.type === "play" ? { isPlaying: true } : {}),
              ...(message.type === "pause" ? { isPlaying: false } : {}),
              ...(message.type === "seek"
                ? { currentTime: message.currentTime }
                : {}),
              ...(message.type === "change_video"
                ? { videoId: message.videoId, currentTime: 0, isPlaying: false }
                : {}),
            },
        );
    };
    nextSocket.onerror = () => {
      setConnection("offline");
      setError("Unable to connect to the party server.");
    };
    nextSocket.onclose = () => {
      if (reconnectRef.current.activeSocket !== nextSocket) return;
      setConnection("offline");
      if (
        reconnectRef.current.intentional ||
        !reconnectRef.current.retryable ||
        reconnectRef.current.attempt >= 5
      )
        return;
      const attempt = reconnectRef.current.attempt + 1;
      reconnectRef.current.attempt = attempt;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      setError(
        `Connection lost. Reconnecting in ${Math.round(delay / 1000)}s...`,
      );
      reconnectRef.current.timer = window.setTimeout(
        () =>
          joinRoom(
            reconnectRef.current.code,
            reconnectRef.current.name,
            reconnectRef.current.userId,
            true,
          ),
        delay,
      );
    };
    setSocket(nextSocket);
  };

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("room");
    if (!code) return undefined;
    const connectionTask = window.setTimeout(
      () => joinRoom(code, sessionStorage.getItem("party-name")),
      0,
    );
    return () => window.clearTimeout(connectionTask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRoom = async (name) => {
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!response.ok) throw new Error("Could not create a room.");
      const created = await response.json();
      joinRoom(created.code, name, created.hostId);
    } catch (createError) {
      setError(createError.message);
    }
  };
  const send = (type, payload = {}) =>
    socket?.readyState === WebSocket.OPEN &&
    (() => {
      socket.send(JSON.stringify({ type, ...payload }));
      if (type === "play" || type === "pause")
        setRoom(
          (current) => current && { ...current, isPlaying: type === "play" },
        );
      if (type === "seek")
        setRoom(
          (current) =>
            current && { ...current, currentTime: payload.currentTime },
        );
      return true;
    })();
  const leaveRoom = () => {
    reconnectRef.current.intentional = true;
    window.clearTimeout(reconnectRef.current.timer);
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type: "leave_room" }));
    socket?.close();
    setSocket(null);
    setRoom(null);
    window.history.replaceState({}, "", window.location.pathname);
  };
  return (
    <PartyContext.Provider
      value={{ room, error, connection, createRoom, joinRoom, send, leaveRoom }}
    >
      {children}
    </PartyContext.Provider>
  );
}

const useParty = () => useContext(PartyContext);

function Landing() {
  const { createRoom, joinRoom, error, connection } = useParty();
  const [code, setCode] = useState("");
  const [name, setName] = useState(
    () => sessionStorage.getItem("party-name") || "",
  );
  return (
    <main className="landing">
      <header className="landing-top">
        <div className="brand">
          <span className="brand-mark">&gt;</span> syncroom
        </div>
        <div className="top-tools">
          <span className="status-pill">
            <i />{" "}
            {connection === "connecting" ? "Connecting" : "All systems ready"}
          </span>
          <ThemeToggle />
        </div>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">01 / Watch together</p>
          <h1>
            Same screen.
            <br />
            <em>Different places.</em>
          </h1>
          <p className="intro">
            A focused room for shared moments. Drop in a video, invite your
            people, and let the room handle the timing.
          </p>
        </div>
        <div className="entry-panel">
          <div className="panel-label">
            <span>GET STARTED</span>
            <span>NO ACCOUNT</span>
          </div>
          <button
            className="primary"
            onClick={() => createRoom(name)}
            disabled={!name.trim()}
          >
            Start a new room <span>-&gt;</span>
          </button>
          <div className="divider">
            <span>or join an existing room</span>
          </div>
          <form
            className="join-line"
            onSubmit={(event) => {
              event.preventDefault();
              joinRoom(code, name);
            }}
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value.slice(0, 40))}
              placeholder="YOUR NAME"
              maxLength="40"
              aria-label="Your name"
            />
            <input
              value={code}
              onChange={(event) =>
                setCode(
                  event.target.value
                    .replace(/[^a-z0-9]/gi, "")
                    .slice(0, 6)
                    .toUpperCase(),
                )
              }
              placeholder="ROOM CODE"
              maxLength="6"
              aria-label="Room code"
            />
            <button disabled={code.length !== 6 || !name.trim()}>
              Enter room
            </button>
          </form>
          {error && <p className="error">{error}</p>}
        </div>
      </section>
      <footer>
        <span>PRIVATE ROOMS</span>
        <span>LIVE SYNC</span>
        <span>YOUTUBE READY</span>
        <span className="footer-note">
          MAKE A MOMENT OF IT <b>↗</b>
        </span>
      </footer>
    </main>
  );
}

function YouTubePlayer({ room, playerApiRef, canControl, send }) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const initialTimeRef = useRef(room.currentTime);
  const applyingRemoteRef = useRef(false);
  const previousTimeRef = useRef(room.currentTime || 0);
  const playerControlRef = useRef({ canControl, send });

  useEffect(() => {
    playerControlRef.current = { canControl, send };
  }, [canControl, send]);

  useEffect(() => {
    if (!room.videoId || !containerRef.current) return undefined;
    const createPlayer = () => {
      playerApiRef.current = new window.YT.Player(containerRef.current, {
        videoId: room.videoId,
        playerVars: {
          playsinline: 1,
          rel: 0,
          controls: playerControlRef.current.canControl ? 1 : 0,
          disablekb: playerControlRef.current.canControl ? 0 : 1,
        },
        events: {
          onReady: () => {
            setReady(true);
            playerApiRef.current.seekTo(initialTimeRef.current || 0, true);
          },
          onStateChange: (event) => {
            if (
              !playerControlRef.current.canControl ||
              applyingRemoteRef.current ||
              !playerApiRef.current
            )
              return;
            const currentTime = playerApiRef.current.getCurrentTime();
            if (event.data === window.YT.PlayerState.PLAYING)
              playerControlRef.current.send("play", { currentTime });
            if (event.data === window.YT.PlayerState.PAUSED)
              playerControlRef.current.send("pause", { currentTime });
          },
        },
      });
    };
    if (window.YT?.Player) createPlayer();
    else {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
      window.onYouTubeIframeAPIReady = createPlayer;
    }
    return () => {
      playerApiRef.current?.destroy();
      playerApiRef.current = null;
      setReady(false);
    };
  }, [room.videoId, playerApiRef]);

  useEffect(() => {
    if (!ready || !playerApiRef.current) return;
    applyingRemoteRef.current = true;
    if (room.isPlaying) playerApiRef.current.playVideo();
    else playerApiRef.current.pauseVideo();
    playerApiRef.current.seekTo(room.currentTime || 0, true);
    previousTimeRef.current = room.currentTime || 0;
    const release = window.setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 250);
    return () => window.clearTimeout(release);
  }, [room.isPlaying, room.currentTime, ready, playerApiRef]);

  useEffect(() => {
    if (!ready || !playerApiRef.current) return undefined;
    const seekWatcher = window.setInterval(() => {
      if (
        applyingRemoteRef.current ||
        !playerControlRef.current.canControl ||
        playerApiRef.current.getPlayerState() !== window.YT.PlayerState.PLAYING
      )
        return;
      const currentTime = playerApiRef.current.getCurrentTime();
      if (Math.abs(currentTime - previousTimeRef.current) > 2) {
        previousTimeRef.current = currentTime;
        playerControlRef.current.send("seek", { currentTime });
      } else {
        previousTimeRef.current = currentTime;
      }
    }, 500);
    return () => window.clearInterval(seekWatcher);
  }, [ready, playerApiRef]);

  return room.videoId ? (
    <div className="player">
      <div ref={containerRef} className="youtube-frame" />
      {!canControl && (
        <div
          className="watch-only-overlay"
          aria-label="Playback is controlled by the host or moderator"
        />
      )}
    </div>
  ) : (
    <div className="player empty-player">
      <div className="empty-icon">&gt;</div>
      <p>Your room is ready.</p>
      <span>Paste a YouTube link below to set the scene.</span>
    </div>
  );
}

function Room() {
  const { room, send, leaveRoom, error } = useParty();
  const currentUser = room.participants?.find(
    (item) => item.id === room.userId,
  );
  const canControl = ["host", "moderator"].includes(currentUser?.role);
  const [url, setUrl] = useState("");
  const playerApiRef = useRef(null);
  const control = (type, payload = {}) => {
    if (type === "play") playerApiRef.current?.playVideo();
    if (type === "pause") playerApiRef.current?.pauseVideo();
    if (type === "seek")
      playerApiRef.current?.seekTo(payload.currentTime, true);
    send(type, payload);
  };
  return (
    <main className="room">
      <header className="room-header">
        <div className="brand">
          <span className="brand-mark">&gt;</span> syncroom
        </div>
        <div className="room-actions">
          <ThemeToggle />
          <span className="connection live">
            <i /> Live
          </span>
          <span className="room-code">
            ROOM <strong>{room.code}</strong>
            <button
              onClick={() =>
                navigator.clipboard?.writeText(window.location.href)
              }
            >
              COPY LINK
            </button>
          </span>
          <button className="leave-button" onClick={leaveRoom}>
            Leave room
          </button>
        </div>
      </header>
      <div className="room-grid">
        <section className="player-wrap">
          <YouTubePlayer
            key={room.videoId || "empty-player"}
            room={room}
            playerApiRef={playerApiRef}
            canControl={canControl}
            send={control}
          />
          <div className="video-bar">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="Paste a YouTube URL"
              disabled={!canControl}
            />
            <button
              onClick={() => {
                control("change_video", { url });
                setUrl("");
              }}
              disabled={!canControl || !url}
            >
              Load video
            </button>
            {canControl && (
              <div className="transport">
                <button
                  onClick={() => control(room.isPlaying ? "pause" : "play")}
                >
                  {room.isPlaying ? "Pause" : "Play"}
                </button>
                <button
                  onClick={() =>
                    control("seek", {
                      currentTime: Math.max(0, room.currentTime - 10),
                    })
                  }
                >
                  -10s
                </button>
                <button
                  onClick={() =>
                    control("seek", { currentTime: room.currentTime + 10 })
                  }
                >
                  +10s
                </button>
              </div>
            )}
          </div>
          {error && <p className="error">{error}</p>}
        </section>
        <aside className="sidebar">
          <div className="side-heading">
            <div>
              <p className="eyebrow">THE ROOM</p>
              <h2>Watching now</h2>
            </div>
            <span className="live-dot">LIVE</span>
          </div>
          <div className="people">
            {(room.participants || []).map((person, index) => (
              <div className="person" key={person.id}>
                <span className={`avatar avatar-${index % 4}`}>
                  {String.fromCharCode(65 + index)}
                </span>
                <div>
                  <strong>
                    {person.id === room.userId
                      ? `${person.name || "You"} (you)`
                      : person.name || `Guest ${index + 1}`}
                  </strong>
                  <small>{person.role}</small>
                </div>
                {currentUser?.role === "host" && person.id !== room.userId && (
                  <div className="person-actions">
                    <select
                      value={person.role}
                      onChange={(event) =>
                        send("assign_role", {
                          participantId: person.id,
                          role: event.target.value,
                        })
                      }
                    >
                      <option value="participant">Participant</option>
                      <option value="moderator">Moderator</option>
                    </select>
                    <button
                      className="transfer-button"
                      onClick={() =>
                        send("transfer_host", { participantId: person.id })
                      }
                    >
                      Make host
                    </button>
                    <button
                      className="remove-button"
                      onClick={() =>
                        send("remove_participant", { participantId: person.id })
                      }
                      aria-label={`Remove ${person.name || `guest ${index + 1}`}`}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="permission">
            {canControl
              ? "You can control playback."
              : "You are watching as a participant."}
          </p>
        </aside>
      </div>
    </main>
  );
}

function App() {
  const { room } = useParty();
  return room ? <Room /> : <Landing />;
}
export default function AppWithProvider() {
  return (
    <ThemeProvider>
      <PartyProvider>
        <App />
      </PartyProvider>
    </ThemeProvider>
  );
}
