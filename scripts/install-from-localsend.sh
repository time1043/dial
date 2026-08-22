#!/usr/bin/env bash
#
# install-from-localsend.sh — one-click Dial plugin installer for Termux / Obsidian on Android
#
# Usage:
#   Drop this script into <vault>/.obsidian/plugins/ and run it from your phone:
#       bash install-from-localsend.sh
#
# What it does:
#   1. Auto-detects the plugin directory from its own location (no hardcoded vault path).
#   2. Pulls dial.zip from your LocalSend download folder.
#   3. Replaces any existing `dial` plugin and unzips the new one.
#
# --- Configuration (edit here if yours differ) ---
# LocalSend download directory. Can also be overridden without editing:
#   LOCALSEND_DIR=/path/to/localsend bash install-from-localsend.sh
LOCALSEND_DIR="${LOCALSEND_DIR:-/data/data/com.termux/files/home/storage/downloads/localsend}"
# Name of the zip LocalSend sends to this folder.
DIA_ZIP_NAME="dial.zip"

set -euo pipefail

# --- Auto-detect the plugin directory (the folder this script lives in) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$SCRIPT_DIR"

echo "=================================================="
echo " Dial plugin — one-click install from LocalSend"
echo "=================================================="
echo " Plugin dir : $PLUGIN_DIR"
echo " LocalSend  : $LOCALSEND_DIR"
echo " Zip name   : $DIA_ZIP_NAME"
echo "--------------------------------------------------"

# --- Sanity: plugin directory must exist ---
if [[ ! -d "$PLUGIN_DIR" ]]; then
  echo "ERROR: plugin directory not found: $PLUGIN_DIR"
  exit 1
fi

# --- Confirm the zip actually exists before doing anything ---
ZIP_SRC="$LOCALSEND_DIR/$DIA_ZIP_NAME"
if [[ ! -f "$ZIP_SRC" ]]; then
  echo "ERROR: $ZIP_SRC not found."
  echo "  -> Make sure LocalSend has sent '$DIA_ZIP_NAME' to '$LOCALSEND_DIR',"
  echo "     or change LOCALSEND_DIR at the top of this script to match your phone."
  echo "  -> Nothing was changed. Exiting."
  exit 1
fi

# --- Replace the existing dial plugin ---
echo "Removing old dial plugin (if any)..."
rm -rf "$PLUGIN_DIR/dial"

echo "Moving $DIA_ZIP_NAME into plugin dir..."
mv "$ZIP_SRC" "$PLUGIN_DIR/$DIA_ZIP_NAME"

echo "Unzipping..."
( cd "$PLUGIN_DIR" && unzip -o "$PLUGIN_DIR/$DIA_ZIP_NAME" )

# Verify the plugin was actually extracted (guards against bad/empty zips)
if [[ ! -f "$PLUGIN_DIR/dial/main.js" ]]; then
  echo "ERROR: extraction did not produce dial/main.js."
  echo "  -> The zip may use unexpected paths. Inspect with:"
  echo "     unzip -l $PLUGIN_DIR/$DIA_ZIP_NAME"
  echo "  -> The zip was left in place for inspection. Exiting."
  exit 1
fi

echo "Cleaning up zip..."
rm -f "$PLUGIN_DIR/$DIA_ZIP_NAME"

echo "=================================================="
echo " Done. Enable / restart 'dial' in Obsidian settings."
echo " Plugin dir : $PLUGIN_DIR/dial"
echo "=================================================="
