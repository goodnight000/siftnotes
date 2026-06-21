# Auto Updates Design

## Goal

SiftNotes should keep itself current with minimal interruption: when the app is opened from a fully quit state, it should install an available update before normal use; when the app is already open, it should ask before installing and then restore the user's previous app location after relaunch.

## Constraints

Tauri updater code only runs while a SiftNotes process is running. A fully quit app cannot download or install updates until the user launches it again, unless the product ships a separate OS background helper. This design uses an early-launch update gate rather than a helper process.

Active recordings are not safe to interrupt. If a recording is in progress, the app must not silently install an update; the interactive path should ask the user to finish or stop recording first.

## Recommended Approach

Use the existing Tauri 2 updater plugin and split update behavior into two modes:

- `startup`: check immediately after launch and before normal app interaction. If an update is available and no recording is active, install and relaunch automatically.
- `interactive`: keep the existing update dialog while the app is open. If the user accepts, persist restore state, install the update, then relaunch.

Before installing, persist a small restore snapshot in `localStorage`: current path, query string, selected meeting metadata, and a timestamp. On startup after relaunch, consume the snapshot and navigate back to the saved route if it is still fresh.

## Restore Scope

Restore durable navigation state only:

- `/`
- `/meeting-details?id=...`
- `/settings`
- current sidebar meeting selection when available

Do not attempt to restore unsaved modal state, active downloads, active summary polling, or an in-progress recording. Existing transcript recovery remains responsible for interrupted recording artifacts.

## Release Metadata

The updater config already points at:

`https://github.com/charleszheng/siftnotes/releases/latest/download/latest.json`

The manifest generator must emit asset URLs for the same repository. The old `Zackriya-Solutions/meeting-minutes` URL is legacy and should be replaced.

## Testing

Use focused unit tests around pure update policy and restore-state helpers:

- startup checks auto-install when an update is available and no recording is active.
- interactive checks open the update dialog instead of auto-installing.
- active recordings block automatic update installation.
- restore snapshots serialize, expire, and generate safe in-app destinations.
- manifest generation emits the configured repository URLs.
