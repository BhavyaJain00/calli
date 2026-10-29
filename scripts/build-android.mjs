#!/usr/bin/env node
// Builds the Android companion app and publishes it on the dashboard.
//
//   npm run android:build
//
// Requires a JDK (17+) and the Android SDK (ANDROID_HOME, or Android Studio's
// local.properties). Steps:
//   1. Creates a release signing key on first run (mobile/android/keystore/).
//      BACK IT UP — every future update must be signed with the same key.
//   2. Builds a signed release APK with the Gradle wrapper.
//   3. Copies it to public/downloads/calliser.apk and writes
//      src/generated/mobile-app.json (version, size, SHA-256) for the
//      dashboard's "Mobile app" page.
//
// Set APP_URL (in .env) to pre-fill the server address on the sign-in screen.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "mobile", "android");
const isWin = process.platform === "win32";

try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // .env is optional for this script.
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) {
    throw new Error(`${path.basename(cmd)} exited with code ${res.status ?? res.error?.message}`);
  }
}

function javaTool(name) {
  const exe = isWin ? `${name}.exe` : name;
  return process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", exe) : name;
}

function readProps(file) {
  const props = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([^#=\s][^=]*?)\s*=\s*(.*)\s*$/.exec(line);
    if (m) props[m[1]] = m[2];
  }
  return props;
}

// 1) Release signing key
const keystoreProps = path.join(androidDir, "keystore.properties");
if (!fs.existsSync(keystoreProps)) {
  const keystoreDir = path.join(androidDir, "keystore");
  const keystoreFile = path.join(keystoreDir, "calliser-release.jks");
  fs.mkdirSync(keystoreDir, { recursive: true });
  const password = crypto.randomBytes(24).toString("base64url");
  console.log("Creating release signing key…");
  run(javaTool("keytool"), [
    "-genkeypair", "-noprompt",
    "-keystore", keystoreFile,
    "-storetype", "PKCS12",
    "-storepass", password,
    "-keypass", password,
    "-alias", "calliser",
    "-keyalg", "RSA",
    "-keysize", "4096",
    "-validity", "36500",
    "-dname", "CN=Calliser, O=Calliser",
  ]);
  fs.writeFileSync(
    keystoreProps,
    [
      "# Release signing key for the Calliser Android app. Keep private and backed up.",
      "storeFile=keystore/calliser-release.jks",
      `storePassword=${password}`,
      "keyAlias=calliser",
      `keyPassword=${password}`,
      "",
    ].join("\n")
  );
  console.log(
    "\n*** Created mobile/android/keystore/ and keystore.properties.\n" +
      "*** Back both up somewhere safe. Without them you cannot publish updates\n" +
      "*** that install over the current app.\n"
  );
}

// 2) Build
const gradleArgs = ["assembleRelease", "--no-daemon", "--console=plain"];
const serverUrl = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
if (serverUrl) gradleArgs.push(`-Pcalliser.serverUrl=${serverUrl}`);
console.log(`Server address pre-filled in the app: ${serverUrl || "(none; set APP_URL)"}`);
const gradlew = path.join(androidDir, isWin ? "gradlew.bat" : "gradlew");
console.log("Building the Android app…");
if (isWin) {
  // .bat files must run through the shell; pass one pre-quoted command line.
  run(`"${gradlew}" ${gradleArgs.map((a) => `"${a}"`).join(" ")}`, [], { cwd: androidDir, shell: true });
} else {
  run(gradlew, gradleArgs, { cwd: androidDir });
}

// 3) Publish
const apk = path.join(androidDir, "app", "build", "outputs", "apk", "release", "app-release.apk");
if (!fs.existsSync(apk)) throw new Error(`Build finished but ${apk} was not found`);

const downloads = path.join(root, "public", "downloads");
fs.mkdirSync(downloads, { recursive: true });
const target = path.join(downloads, "calliser.apk");
fs.copyFileSync(apk, target);

const bytes = fs.readFileSync(target);
const props = readProps(path.join(androidDir, "gradle.properties"));
const info = {
  available: true,
  versionName: props["calliser.versionName"] || "1.0.0",
  versionCode: Number(props["calliser.versionCode"] || 1),
  sizeBytes: bytes.length,
  sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  builtAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(root, "src", "generated", "mobile-app.json"), JSON.stringify(info, null, 2) + "\n");

console.log(`\nPublished public/downloads/calliser.apk (v${info.versionName}, ${(info.sizeBytes / 1048576).toFixed(1)} MB)`);
console.log(`SHA-256 ${info.sha256}`);
console.log("Rebuild/redeploy the web app so the dashboard offers this version.");
