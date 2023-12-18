#!/bin/bash

# To copy to server (No raspberry pi):
# scp create-weekly-video.sh christopher@node3:/shared-volume/time-lapse

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
# 45 23 * * 6  sh /shared-volume/time-lapse/create-weekly-video.sh

home_path="/shared-volume/time-lapse";
input_dir="$home_path/daily-videos";
output_dir="$home_path/cumulative-weekly-videos";

mkdir -p $output_dir;
mkdir -p "$output_dir/webcam";
mkdir -p "$output_dir/picam";

date=$(date '+%Y-%m-%d');

cd $input_dir

# https://shotstack.io/learn/use-ffmpeg-to-concatenate-video/
ffmpeg -f concat -i webcam.txt -c copy webcam-output.mp4
mv $input_dir/webcam-output.mp4 "$output_dir/webcam/$date.mp4"

ffmpeg -f concat -i picam.txt -c copy picam-output.mp4
mv $input_dir/picam-output.mp4 "$output_dir/picam/$date.mp4"

echo "Done!";

exit 0
