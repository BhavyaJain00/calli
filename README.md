# Calliser

Sales call management for teams. An Android app on each salesperson's phone uploads
their work calls and call recordings; the web dashboard lets admins and agents browse
calls, play recordings, read AI transcripts and summaries, and manage the team.

| Part | What it does | Tech |
| --- | --- | --- |
| Web dashboard + API | Login, team management, calls, recordings, transcripts | Next.js 16, React 19, TypeScript, Tailwind 4 |
| Android app | Reads the call log, finds each call's recording, uploads both | Kotlin, WorkManager |
| Database | Organizations, users, devices, calls, transcripts | PostgreSQL (Supabase) via Prisma 6 |
| Recording storage | Audio files | Supabase Storage (private bucket) or local disk |
| AI | Speech-to-text, then summary, sentiment, keywords and follow-ups | OpenAI transcription + Claude |

Roles: **Admins** create accounts for the sales team, see every call, manage devices and can
delete calls. **Agents** see only their own calls.

---

## 1. First run

```bash
npm install
npx prisma db push        # creates the tables (already done for the configured Supabase project)
npm run build
npm start                 # http://localhost:3000
```

Open the site. A fresh install sends you to **/setup**: enter the `SETUP_TOKEN` from `.env`,
your company name, and your admin email and password. Setup only works once; afterwards
`/setup` redirects to the login page.

Then go to **Team** to create accounts for your salespeople.

Lost every admin login? Run:

```bash
npm run create-admin -- --email you@company.com --password "new-strong-password"
```

## 2. Configuration (`.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Pooled Postgres URL (Supabase transaction pooler, port 6543, `?pgbouncer=true`) |
| `DIRECT_URL` | yes | Direct/session Postgres URL (port 5432), used for schema changes |
| `AUTH_SECRET` | yes | 32+ random characters; signs login sessions |
| `SETUP_TOKEN` | yes | Random string entered once on `/setup` |
| `APP_URL` | recommended | Public HTTPS address, e.g. `https://calls.yourcompany.com` |
| `SUPABASE_SECRET_KEY` | on serverless hosts | Supabase secret key (`sb_secret_…`). Stores recordings in a private bucket |
| `SUPABASE_STORAGE_BUCKET` | no | Bucket name, created automatically (default `call-recordings`) |
| `RECORDINGS_DIR` | no | Local folder for recordings when no Supabase secret key is set |
| `MAX_UPLOAD_MB` | no | Largest recording accepted (default 50) |
| `OPENAI_API_KEY` | for transcripts | Speech-to-text. Without it, recordings are kept but not transcribed |
| `ANTHROPIC_API_KEY` | for summaries | Claude summaries, sentiment and follow-ups |
| `ANTHROPIC_MODEL` | no | Default `claude-opus-5-5` |

Nothing is ever faked: if an AI key is missing, the call page says so instead of showing
placeholder text.

## 3. Deploying

The Android app only connects over **HTTPS**, so deploy behind a real domain with TLS.

**Recommended: a Node.js host** (Railway, Render, Fly.io, a VPS, Docker). Run
`npm ci && npm run build && npm start` with the environment variables above. For
recordings, either set `SUPABASE_SECRET_KEY` or mount a persistent volume at
`RECORDINGS_DIR`.

**Vercel works with two caveats.** You must set `SUPABASE_SECRET_KEY`, because function disks are
wiped. Vercel also limits request bodies to 4.5 MB, so long recordings over that size are
rejected and only the call details are saved. Use a Node host if your calls are long.

After deploying, set `APP_URL` and rebuild the Android app (section 4) so the server
address is pre-filled for your team.

## 4. Android app

A signed APK (v1.0.0) is already built at `public/downloads/calliser.apk`. Agents get it
from the dashboard: **Mobile app → Download Calliser for Android**. The page walks them
through installing, signing in, granting permissions and turning on call recording.

How it works on the phone:

- The agent signs in with their Calliser email and password and confirms the
  recording-consent notice. The server issues a token for that phone, listed under
  **Devices**, where an admin can revoke it.
- Only calls made after sign-in are uploaded: right after each call ends, and every
  15 minutes in the background.
- Android does not let third-party apps record call audio. Calliser uploads the recordings
  made by the phone's **built-in call recorder** (Samsung, Xiaomi, OnePlus, Oppo, Realme,
  Vivo, Motorola and others), so auto-recording must be on in the phone's dialer. A file is
  only matched to a call if it is in a call-recording folder or carries the caller's number,
  and its timing matches. Other audio on the phone is never uploaded.
- Phones without a built-in recorder, or that keep recordings private, sync call details
  only. iPhones cannot read call history at all, so iPhone users use the dashboard only.
- The app is installed directly from your site, not the Play Store. Google Play restricts
  call-log access to default dialer apps.
- Transcription accepts mp3, m4a/mp4, wav, ogg, webm and flac. Recordings in AMR or 3GP
  (some older phones) still play in the dashboard but cannot be transcribed.

### Rebuilding the APK

Requires JDK 17+ and the Android SDK (install Android Studio, or set `ANDROID_HOME`).

```bash
# bump calliser.versionCode and calliser.versionName in mobile/android/gradle.properties
npm run android:build     # builds, signs and publishes public/downloads/calliser.apk
npm run build             # so the dashboard shows the new version
```

The first build created the release signing key in `mobile/android/keystore/` and
`mobile/android/keystore.properties`. They are git-ignored. **Back them up.** Updates
signed with a different key will not install over the existing app.

## 5. Security and privacy

- Passwords are hashed with bcrypt. Sessions are signed, httpOnly cookies. Disabling a
  user immediately blocks their dashboard session and their phone.
- Sign-in endpoints are rate-limited per email and per IP (stored in the database).
- Device tokens are stored only as SHA-256 hashes. The app keeps its token in private
  storage that is excluded from backups.
- Recordings are private: playback checks the user's role and organization, and cloud
  recordings are served through short-lived signed URLs.
- Admins can permanently delete a call, its transcript and its recording from the call page.
- Call-recording consent laws differ by country and state. The app requires each agent to
  confirm that the people they call are informed.

## Project layout

```
src/app/            pages (dashboard, login, setup) and API routes (src/app/api)
src/lib/            auth, database, storage, AI pipeline, validation
src/components/     UI components
prisma/schema.prisma database schema
mobile/android/     Android app (Kotlin)
scripts/            create-admin, build-android
```
