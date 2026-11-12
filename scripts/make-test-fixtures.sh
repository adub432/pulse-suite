#!/bin/sh
# Regenerate the smoke-test fixtures in /tmp/pulse-test/ (lost on VM /tmp wipes).
# Requires: node, python3 + PIL, ffmpeg.
set -e
node "$(dirname "$0")/make-tone.js"
python3 "$(dirname "$0")/make-gradient.py"
mkdir -p /tmp/pulse-test/clips
ffmpeg -y -v error -f lavfi -i testsrc=duration=2:size=320x240:rate=30 -c:v libx264 -pix_fmt yuv420p /tmp/pulse-test/clip1.mp4
ffmpeg -y -v error -f lavfi -i smptebars=duration=2:size=320x240:rate=30 -c:v libx264 -pix_fmt yuv420p /tmp/pulse-test/clip2.mp4
cp /tmp/pulse-test/clip1.mp4 /tmp/pulse-test/clip2.mp4 /tmp/pulse-test/clips/
echo "fixtures ready in /tmp/pulse-test/"
