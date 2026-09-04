# syncroom

An anonymous YouTube watch-party MVP. The client uses React Context for its room session; playback permissions are enforced by the Express/WebSocket server.

## Run locally

1. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI`.
2. Run `npm install` in `server` and `client/vite-project`.
3. Start the API with `npm run dev` in `server`.
4. Start Vite with `npm run dev` in `client/vite-project`.

The client defaults to `http://localhost:3000` for the API. Set `VITE_API_URL` when deploying.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
