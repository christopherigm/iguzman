#!/bin/sh

picam_enabled=true
webcam_enabled=false
user='christopher'
home_path='/home/christopher'
remote_server='master'
picam_remote_path='/shared-volume/time-lapse/picam'

if $picam_enabled; then
  mkdir -p "$home_path/picam"
  ssh -i /home/christopher/.ssh/id_ed25519 christopher@master 'mkdir -p /shared-volume/time-lapse/picam'
fi

if $webcam_enabled; then
  mkdir -p "$home_path/webcam"
  ssh -i /home/christopher/.ssh/id_ed25519 christopher@master 'mkdir -p /shared-volume/time-lapse/webcam'
fi

while true; do 
  # File name
  date=$(date '+%Y-%m-%d %H-%M-%S')
  file_name="picture $date.jpg"

  # Raspberry PI Camera
  if $picam_enabled; then
    raspistill -o "$home_path/picam/$file_name" -w 2592 -h 1944 -q 100 -sh 90 -rot 90
    scp -i /home/christopher/.ssh/id_ed25519 "$home_path/picam/$file_name" christopher@master:/shared-volume/time-lapse/picam
    rm "$home_path/picam/$file_name"
    echo "[picam] Picture saved: picture $date.jpg"
  fi

  # Webcam
  if $webcam_enabled; then
    fswebcam \
      -d /dev/video1 \
      -r 2560x1440 \
      -S 10 \
      --quiet \
      --jpeg 100 \
      --no-banner "$home_path/webcam/$file_name"
    scp -i /home/christopher/.ssh/id_ed25519 "$home_path/webcam/$file_name" christopher@master:/shared-volume/time-lapse/webcam
    rm "$home_path/picam/$file_name"
    echo "[webcam] Picture saved: picture $date.jpg"
  fi

  sleep 10
done

exit 0
