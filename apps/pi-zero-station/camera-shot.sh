#!/bin/bash

#Folders
mkdir -p webcam
mkdir -p picam

ssh christopher@master 'mkdir -p /shared-volume/time-lapse/picam'
ssh christopher@surface 'mkdir -p /home/christopher/Videos/time-lapse/picam'

ssh christopher@master 'mkdir -p /shared-volume/time-lapse/webcam'
ssh christopher@surface 'mkdir -p /home/christopher/Videos/time-lapse/webcam'

# File name
date=$(date '+%Y-%m-%d %H-%M-%S')
file_name="picture $date.jpg"

# Raspberry PI Camera
raspistill -o "picam/$file_name" -w 2592 -h 1944 -q 100 -sh 90
scp "picam/$file_name" christopher@master:/shared-volume/time-lapse/picam
scp "picam/$file_name" christopher@surface:/home/christopher/Videos/time-lapse/picam

# Webcam
fswebcam \
  -d /dev/video1 \
  -r 2560x1440 \
  -S 10 \
  --quiet \
  --jpeg 100 \
  --no-banner "webcam/$file_name"
scp "webcam/$file_name" christopher@master:/shared-volume/time-lapse/webcam
scp "webcam/$file_name" christopher@surface:/home/christopher/Videos/time-lapse/webcam

# Done
echo "Picture saved: picture $date.jpg";
