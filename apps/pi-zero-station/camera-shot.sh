#!/bin/sh

# To copy to raspberry pi:
# scp camera-shot.sh christopher@raspberrypi:/home/christopher

picam_enabled=true;
webcam_enabled=true;
user='christopher';
home_path='/home/christopher';
remote_server='master';
picam_remote_path='/shared-volume/time-lapse/picam';

if $picam_enabled; then
  mkdir -p "$home_path/picam";
  # ssh -i /home/christopher/.ssh/id_ed25519 christopher@master 'mkdir -p /shared-volume/time-lapse/picam'
fi

if $webcam_enabled; then
  mkdir -p "$home_path/webcam";
  # ssh -i /home/christopher/.ssh/id_ed25519 christopher@master 'mkdir -p /shared-volume/time-lapse/webcam'
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
    v4l2-ctl -d /dev/video1 -c white_balance_automatic=0
    v4l2-ctl -d /dev/video1 -c brightness=90
    fswebcam \
      -d /dev/video1 \
      -r 1920x1080 \
      -S 1 \
      --quiet \
      --jpeg 95 \
      --rotate 180 \
      --no-banner "$home_path/webcam/$file_name"
    scp -i /home/christopher/.ssh/id_ed25519 "$home_path/webcam/$file_name" christopher@master:/shared-volume/time-lapse/webcam
    rm "$home_path/webcam/$file_name"
    echo "[webcam] Picture saved: picture $date.jpg"
  fi

  sleep 10
done

exit 0
