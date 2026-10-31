# Publishing and privacy

## Runtime requirements

Cirrus 1.2.4 targets Windows 10 / 11 x64. Electron bundles Chromium, Node.js and the application code. End users need no additional development runtime, account, API key, server or weather service. Normal observations work offline.

| Feature | Source and requirements |
| --- | --- |
| CPU / memory | Built-in Node.js system interfaces; no additional monitoring software |
| NVIDIA GPU | Driver-provided `nvidia-smi`, with a Windows performance counter fallback |
| Other GPUs | Windows PowerShell / CIM performance counters; support depends on the system and driver |
| Fan RPM | Compatible WMI fan sensors, or direct NVIDIA NVML RPM through an existing driver; recent LibreHardwareMonitor 0.9.5+ no longer exposes WMI |

Cirrus itself installs no drivers, changes no fan settings, and requires no administrator privileges for basic observations. Device policies may restrict PowerShell, hardware queries or unsigned applications. macOS, Linux and Windows ARM64 distributions have not been validated.

Development requires Node.js 22.12+, npm and network access to download dependencies. Use `npm ci`, `npm test` and `npm run dist` on Windows. If the official Electron distribution is already available locally, `npm run dist -- --config.electronDist=node_modules/electron/dist` can reuse it.

## Commit the next desktop edition

The repository is [yeze5421/weather-forecast](https://github.com/yeze5421/weather-forecast). The next release is **1.2.4**, with a softer Daylight theme.

From the project directory:

```powershell
git add -A
git diff --cached --stat
git diff --cached --name-only
git commit -m "Soften Daylight theme"
git push
```

Review the staged files before committing. A normal Git push uploads source and triggers a build; it does not create a public Release until a version tag is pushed.

## Automated Windows builds and releases

The workflow in .github/workflows/windows.yml runs on pushes to main, pull requests and manual dispatch. It installs the locked dependencies, runs unit and desktop integration tests, builds a portable EXE, tests the unpacked build, generates SHA256.txt and verifies the packaged sources against the checkout. Build artifacts contain only the EXE, checksum and release notes, with fourteen-day retention.

A tag matching package.json publishes the tested artifact in a public GitHub Release. The publication job alone receives contents: write; the build job has contents: read and no signing secrets. Actions are pinned to their verified commit SHAs. The workflow refuses to replace an existing release.

After committing and pushing a new version:

```powershell
git tag v1.2.4
git push origin v1.2.4
gh run list --workflow windows.yml
```

Wait for the tagged workflow to succeed. The public download appears on the Releases page. Regular main-branch builds are workflow artifacts; downloading them requires GitHub access, while published Release attachments are public.

For a local build:

```powershell
npm ci
npm test
npm run test:desktop
npm run dist -- --config.electronDist=node_modules/electron/dist
npm run release:checksum
npm run release:verify
```

A manual fallback may create a Release with gh release create, using the exact versioned EXE, matching SHA256.txt and RELEASE_NOTES.md. Do not publish the whole release directory. Do not run manual publication concurrently with tagged automatic publication.

The executable remains unsigned. No signing certificate or paid service is required for this workflow. Windows can display an unknown publisher or SmartScreen prompt. Future signing credentials must remain outside the repository.

## Public file scope

Commit first-party source, tests, scripts, `public/favicon.svg`, `shared/`, the demo GIF and mini preview in `docs/`, the two application icons in `build/`, the workflow in `.github/`, manifests, the lockfile, documentation, `Launch-Cirrus.cmd` and `LICENSE`.

Release assets should contain only the portable executable and its checksum file. Exclude `node_modules/`, `dist/`, `artifacts/`, `publish/`, the rest of `release/`, browser profiles, exported CSVs, screenshots, logs, `builder-debug.yml`, environment files and signing material.

Git author names and email addresses remain in commit history. Use a public handle and GitHub noreply email when privacy matters. `package.json` contains `private: true` to prevent accidental npm publication; this does not control GitHub visibility.

## Privacy review scope

The review covers first-party code, configuration, dependency download URLs, the packaged app archive and the external sensor script. The portable payload is compared with the tested folder build using SHA-256.

- No account credentials, API keys, private keys, actual user profile paths or project absolute paths were found in the reviewed first-party content. The copyright notice uses the public GitHub handle `yeze5421`.
- Dependency download URLs use the public npm registry without embedded credentials. One upstream deprecation notice contains a maintainer's public contact email.
- Application code reads hardware names, utilization, memory, temperature, fan RPM, timestamps and uptime. It contains no account, hostname, MAC address, serial number or personal document collection, telemetry uploads, remote API calls or automatic update service. Development readiness checks contact the local Vite server.
- Preferences stay in the user's application data directory. History retains up to the most recent 24 hours of the current session, sampled every 10 seconds, and clears on exit. User-exported CSVs contain timestamps and readings. Electron may also create local cache and configuration files.
- Local test JSON, CSVs and screenshots contain actual hardware and usage information. Browser test profiles and build diagnostics may contain local paths. These remain in ignored local directories and are not application or source release content.
- `.gitignore` excludes generated data, environment files, common credentials, signing material and editor state. Ignore rules do not protect manual folder uploads or remove anything already present in Git history. Example environment files still need review.

This is a source and package content review, not a full third-party dependency audit or a complete network capture. Recheck future code, assets, configuration and dependency changes before publishing.

Cirrus uses [MIT License](LICENSE); distributed first-party code must retain it. The portable executable includes the license, and Electron / Chromium license notices remain in the package.

References: [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases), [GitHub CLI release create](https://cli.github.com/manual/gh_release_create), [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing), [GitHub commit email settings](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address).
