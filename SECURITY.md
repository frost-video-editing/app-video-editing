# Security Policy

## Supported Versions

Security updates currently target the latest `0.1.x` release.

| Version | Supported |
| --- | --- |
| `0.1.x` | Yes |
| `< 0.1` | No |

## Reporting a Vulnerability

Please do not disclose security vulnerabilities in a public issue or discussion.

Use a private GitHub Security Advisory for this repository. Include the following information where possible:

- A short description of the vulnerability.
- The affected version, platform, and architecture.
- Reproduction steps or a proof of concept.
- The potential impact, especially whether arbitrary files or commands can be accessed.
- Suggested mitigation or fix.

If a private advisory cannot be created, contact the project maintainer through the repository owner account before making any public disclosure.

## Scope

VideoEditing is a local Electron video editor. The application reads source video files selected by the user and invokes local FFmpeg or FFprobe binaries for metadata inspection and video export. It is not intended to upload video files to a remote service.

Security reports are especially important for issues involving:

- Remote code execution through a crafted video, project input, or renderer content.
- Arbitrary file read, write, overwrite, or deletion outside the user's intended paths.
- Command injection through source paths, output paths, or FFmpeg arguments.
- Unsafe Electron IPC or preload exposure.
- Dependency vulnerabilities that affect packaged desktop releases.
- Bypassing the application's local-only processing expectations.

## Electron Security Practices

The desktop window is configured with Electron isolation protections:

- `contextIsolation` is enabled.
- `nodeIntegration` is disabled in the renderer.
- Renderer code accesses desktop capabilities through the preload bridge.
- File dialogs, FFmpeg execution, export cancellation, and folder reveal operations are handled in the Electron main process.

Changes to the preload bridge, IPC handlers, path handling, or FFmpeg process arguments require particular care. Validate IPC payloads in the main process and avoid passing untrusted input to a shell. Do not expose general filesystem or process APIs to the renderer.

## User Security Guidance

- Download releases only from the project's official GitHub repository.
- Keep VideoEditing and the operating system updated.
- Open untrusted video files with care; media parsers and codecs are security-sensitive components.
- Check the output path before exporting so existing files are not unintentionally overwritten.
- Keep source videos and exported files in directories with appropriate operating-system permissions.
- Do not run the application with elevated administrator privileges unless required for a specific troubleshooting step.
- Review release checksums or signatures when they are provided.

## Dependencies and Releases

The application uses Electron, React, FFmpeg, FFprobe, and native or platform-specific packages. Dependency updates should be reviewed and tested before packaging releases.

The release workflow builds Windows installers for x64 and x86 targets. A build check must pass before the Windows release job can publish installers. Security-sensitive dependency or packaging changes should also be tested on the affected operating system and architecture.

## Response Process

After receiving a report, maintainers will validate the issue, assess affected versions and platforms, prepare a fix or mitigation, and coordinate public disclosure with the reporter. Do not include private source videos or other sensitive media in a report; use a minimal reproduction whenever possible.
