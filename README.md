# mmorpg

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser. Open multiple tabs to see multiplayer sync.

## Database (Postgres + Prisma)

Create local databases (one-time):

```bash
createdb mmorpg_dev
createdb mmorpg_test
createdb mmorpg_e2e
```

Copy `.env.example` to `.env` and update the connection strings.

Run the initial migration:

```bash
npm run db:migrate:dev
```

## Structure

- `server/` Node server (entry: `server/index.js`)
- `client/` Web client assets

## Test

```bash
npm test
```
