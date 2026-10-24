# Publishing and privacy

## Runtime requirements

Cirrus 1.1.0 targets Windows 10 / 11 x64. Electron bundles Chromium, Node.js and the application code. End users need no additional development runtime, account, API key, server or weather service. Normal observations work offline.

| Feature | Source and requirements |
| --- | --- |
| CPU / memory | Built-in Node.js system interfaces; no additional monitoring software |
| NVIDIA GPU | Driver-provided `nvidia-smi`, with a Windows performance counter fallback |
| Other GPUs | Windows PowerShell / CIM performance counters; support depends on the system and driver |
| Fan RPM | Optional: a running LibreHardwareMonitor / OpenHardwareMonitor instance exposing WMI Fan sensors; availability depends on hardware and permissions |

Cirrus itself installs no drivers, changes no fan settings, and requires no administrator privileges for basic observations. Device policies may restrict PowerShell, hardware queries or unsigned applications. macOS, Linux and Windows ARM64 distributions have not been validated.

Development requires Node.js 22.12+, npm and network access to download dependencies. Use `npm ci`, `npm test` and `npm run dist` on Windows. If the official Electron distribution is already available locally, `npm run dist -- --config.electronDist=node_modules/electron/dist` can reuse it.

## Commit the dark themes edition

The repository is [yeze5421/weather-forecast](https://github.com/yeze5421/weather-forecast). Versions 1.0.0 and 1.0.1 are already published; the dark themes edition uses **1.1.0**.

From the project directory:

```powershell
git add -A
git diff --cached --stat
git diff --cached --name-only
git commit -m "Add dark themes and prepare v1.1.0"
git push
```

Review the staged files before committing. `git add -A` records new theme files and the demo GIF as well as file edits. A normal Git push uploads source code; it does not upload the ignored executable or create a Release.

## Publish the executable

The local build produces `release/Cirrus-Weather-1.1.0.exe` and a matching `release/SHA256.txt`. After pushing the source commit, create a new Release:

```powershell
gh release create v1.1.0 "release/Cirrus-Weather-1.1.0.exe" "release/SHA256.txt" --repo yeze5421/weather-forecast --target main --title "Cirrus v1.1.0 - Dark Themes" --notes-file RELEASE_NOTES.md
```

GitHub attaches the executable and checksum file, and creates source archives for the tagged commit. Download links will appear at `https://github.com/yeze5421/weather-forecast/releases/tag/v1.1.0`. Keep each published version's executable and checksum together; build a new version instead of replacing an older release's binary.

If rebuilding before publication, refresh the checksum:

```powershell
$cirrusHash = (Get-FileHash -LiteralPath "release/Cirrus-Weather-1.1.0.exe" -Algorithm SHA256).Hash.ToLowerInvariant()
"$cirrusHash  Cirrus-Weather-1.1.0.exe" | Set-Content -LiteralPath "release/SHA256.txt" -Encoding utf8
```

The executable is currently **unsigned**. Windows may show an unknown publisher or SmartScreen prompt. Configure Windows code signing for a formal distribution if needed; keep certificates, private keys and passwords outside the repository. Signing does not guarantee that every system prompt disappears.

## Public file scope

Commit first-party source, tests, scripts, `public/favicon.svg`, `shared/themes.json`, `docs/cirrus-preview.gif`, the two application icons in `build/`, manifests, the lockfile, documentation, `Launch-Cirrus.cmd` and `LICENSE`.

Release assets should contain only the portable executable and its checksum file. Exclude `node_modules/`, `dist/`, `artifacts/`, `publish/`, the rest of `release/`, browser profiles, exported CSVs, screenshots, logs, `builder-debug.yml`, environment files and signing material.

Git author names and email addresses remain in commit history. Use a public handle and GitHub noreply email when privacy matters. `package.json` contains `private: true` to prevent accidental npm publication; this does not control GitHub visibility.

## Privacy review scope

The review covers first-party code, configuration, dependency download URLs, the packaged app archive and the external sensor script. The portable payload is compared with the tested folder build using SHA-256.

- No account credentials, API keys, private keys, actual user profile paths or project absolute paths were found in the reviewed first-party content. The copyright notice uses the public GitHub handle `yeze5421`.
- Dependency download URLs use the public npm registry without embedded credentials. One upstream deprecation notice contains a maintainer's public contact email.
- Application code reads hardware names, utilization, memory, temperature, fan RPM, timestamps and uptime. It contains no account, hostname, MAC address, serial number or personal document collection, telemetry uploads, remote API calls or automatic update service. Development readiness checks contact the local Vite server.
- Preferences stay in the user's application data directory. History retains the most recent 30 minutes and clears on exit. User-exported CSVs contain timestamps and readings. Electron may also create local cache and configuration files.
- Local test JSON, CSVs and screenshots contain actual hardware and usage information. Browser test profiles and build diagnostics may contain local paths. These remain in ignored local directories and are not application or source release content.
- `.gitignore` excludes generated data, environment files, common credentials, signing material and editor state. Ignore rules do not protect manual folder uploads or remove anything already present in Git history. Example environment files still need review.

This is a source and package content review, not a full third-party dependency audit or a complete network capture. Recheck future code, assets, configuration and dependency changes before publishing.

Cirrus uses [MIT License](LICENSE); distributed first-party code must retain it. The portable executable includes the license, and Electron / Chromium license notices remain in the package.

References: [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases), [GitHub CLI release create](https://cli.github.com/manual/gh_release_create), [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing), [GitHub commit email settings](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address).
