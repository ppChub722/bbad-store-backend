# BBad Store — Backend

REST API for BBad Store, a single-vendor e-commerce demo. Node.js, Express and
MongoDB, with JWT authentication.

Frontend repository: [bbad-store-frontend](https://github.com/ppChub722/bbad-store-frontend)
Live demo: [bbad-shop.netlify.app](https://bbad-shop.netlify.app)

---

## What it does

| Area | Endpoints |
|---|---|
| Products | list with pagination and category filter, detail by id, recommended products |
| Categories | category list with page counts |
| Users | register, login, profile read/update, change password, avatar upload |
| Cart & orders | add/remove items, place an order, order history and status |
| Reviews | create, edit, delete, list by product or by user |

Authentication is JWT via Passport. Product images are uploaded with Multer and
served from `/images`.

---

## Running it

```bash
npm install
node scripts/generate-demo-data.js   # only needed for the no-database mode
npm start                            # http://localhost:10000
```

### Two data modes

The API reads from MongoDB when `MONGODB_URI` is set, and from JSON files in
`src/data/` when it is not.

```bash
# real database
MONGODB_URI="mongodb+srv://user:password@cluster.mongodb.net" npm start

# demo data, no database needed
npm start
```

The JSON mode exists because the public demo has no database behind it. A small
adapter in `src/database.js` implements the part of the MongoDB driver API this
codebase uses — `find`, `findOne`, `countDocuments`, `aggregate`, and the
cursor methods — so models, controllers and routes are identical in both modes.

**Writes in JSON mode are applied in memory only.** Adding to a cart or placing
an order behaves normally for the length of a session and is gone when the
process restarts. Nothing is written back to disk.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `10000` | HTTP port |
| `MONGODB_URI` | — | MongoDB connection string. Unset means JSON demo mode. |
| `MONGODB_DB` | `bbad` | Database name |
| `JWT_SECRET` | a key published in this repo | Signing secret for access tokens. Optional for the demo, which has nothing worth protecting; required once a real database is behind the API. See `src/config/secrets.js`. |

---

## Demo data

`src/data/*.json` is generated, not real:

```bash
node scripts/generate-demo-data.js
```

The script reads `images/products/` — the product images are the only part of
the original catalogue kept in this repository — and builds a catalogue around
the ids it finds there. Product names, prices and descriptions are invented and
do not describe the photographs.

The generated dataset includes three accounts so the signed-in parts of the
site can be viewed. The login page has a button for each of them.

```
fizri@bbad.com  ·  burni@bbad.com  ·  kuri@bbad.com
password: 12341234
```

The handles and the shared password are fixed by the frontend, which calls
`/api/user/login` with `<handle>@bbad.com`, so renaming them means changing
both repositories.

Registration and profile updates are blocked by a demo guard in
`src/routes/userRoutes.js`.

---

## Layout

```
src/
  app.js                 express app, middleware, route mounting
  server.js              entry point
  database.js            MongoDB client, or the JSON adapter
  config/
    config.json          categories, order statuses, user ranks, page sizes
    passport/            JWT strategy and the auth middleware
    services/            multer upload configuration
  controllers/           request handling per resource
  models/                data access per collection
  routes/                route definitions
  data/                  generated demo data (JSON mode)
scripts/
  generate-demo-data.js  builds src/data from the product images
images/                  product and user images served at /images
```

---

## Known limitations

- No automated tests.
- Checkout has no payment step. Orders are recorded, nothing is charged.
- No admin interface. Products are seeded, not managed through the API.
- Database credentials were once committed to this repository. They have been
  moved to environment variables and the cluster they pointed at no longer
  exists, but they remain in the git history.
