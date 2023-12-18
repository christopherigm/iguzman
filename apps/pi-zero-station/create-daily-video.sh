#!/bin/bash

# To copy to server (No raspberry pi):
# scp create-daily-video.sh christopher@node3:/shared-volume/time-lapse

# https://cronitor.io/guides/cron-jobs
# Check cron service on Linux system
# sudo systemctl status cron.service

# crontab -e: edits crontab entries to add, delete, or edit cron jobs.
# crontab -l: list all the cron jobs for the current user.
# crontab -u username -l: list another user's crons.
# crontab -u username -e: edit another user's crons.

# *   *   *   *   *  sh /path/to/script/script.sh
# |   |   |   |   |              |
# |   |   |   |   |      Command or Script to Execute        
# |   |   |   |   |
# |   |   |   |   |
# |   |   |   |   |
# |   |   |   | Day of the Week(0-6)
# |   |   |   |
# |   |   | Month of the Year(1-12)
# |   |   |
# |   | Day of the Month(1-31)  
# |   |
# | Hour(0-23)  
# |
# Min(0-59)

# timedatectl list-timezones
# sudo timedatectl set-timezone America/Denver
# sudo apt install ntpdate
# sudo ntpdate time.nist.gov

# sudo systemctl enable cron
# sudo crontab -u root -e && sudo service cron restart
# Add:
# 00 22 * * *  sh /shared-volume/time-lapse/create-daily-video.sh

home_path="/shared-volume/time-lapse";
output_dir="$home_path/daily-videos";

mkdir -p $output_dir;
mkdir -p "$output_dir/webcam";
mkdir -p "$output_dir/picam";
touch "$output_dir/webcam.txt"
touch "$output_dir/picam.txt"

date=$(date '+%Y-%m-%d');

ffmpeg \
  -framerate 60 \
  -pattern_type glob \
  -i "$home_path/webcam/*.jpg" \
  -s:v 2560x1440 \
  -c:v libx264 \
  -crf 17 \
  -pix_fmt yuv420p \
  "$output_dir/webcam/$date.mp4";
echo "$output_dir/webcam/$date.mp4" >> "file $output_dir/webcam.txt";

ffmpeg \
  -framerate 60 \
  -pattern_type glob \
  -i "$home_path/picam/*.jpg" \
  -s:v 2592x1944 \
  -c:v libx264 \
  -crf 17 \
  -pix_fmt yuv420p \
  "$output_dir/picam/$date.mp4";
echo "$output_dir/picam/$date.mp4" >> "file $output_dir/picam.txt";

echo "Done!";

rm -rf $home_path/webcam/*
rm -rf $home_path/picam/*

exit 0

# Check cron logs.
# cat /var/log/syslog
