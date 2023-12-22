#!/bin/bash

# To copy to raspberry pi:
# scp camera-shot.sh christopher@raspberrypi:/home/christopher
# scp .env christopher@raspberrypi:/home/christopher

# Add to rc.local file
# sudo vim /etc/rc.local
# > /bin/bash /home/christopher/camera-shot.sh

# Grant exec privileges
# sudo chmod +x /etc/rc.local

home_path="/home/christopher";
remote_path="christopher@master:/shared-volume/time-lapse";
mkdir -p "$home_path/logs";

source "$home_path/.env"
cat "$home_path/.env"

# [[ $picam_enabled ]] && picam_enabled=true || picam_enabled=false;
# webcam_enabled=false;
# if [[ $webcam_enabled ]]; then
#   webcam_enabled=true;
# fi
# sunrise=`expr $SUNRISE + 0`;
# sunset=`expr $sunset + 0`;

if $picam_enabled; then
  mkdir -p "$home_path/picam";
  # ssh -i /home/christopher/.ssh/id_ed25519 christopher@master 'mkdir -p /shared-volume/time-lapse/picam'
fi

if $webcam_enabled; then
  mkdir -p "$home_path/webcam";
  # ssh -i /home/christopher/.ssh/id_ed25519 christopher@master 'mkdir -p /shared-volume/time-lapse/webcam'
fi

while true; do
  source "$home_path/.env"

  logs_file_name="$home_path/logs/`date "+%Y-%m-%d"`.txt";
  touch $logs_file_name;
  # current_hour
  current_hour=`date "+%H"`;
  # cast string to int
  current_hour=`expr $current_hour + 0`;

  date=$(date '+%Y-%m-%d %H-%M-%S');

  if [[ $current_hour -ge $sunrise && $current_hour -le $sunset ]]; then
    echo "===== Photos are enabled: $date. =====";

    # File name
    file_name="picture $date.jpg";

    # Raspberry PI Camera
    if $picam_enabled; then
      raspistill -o "$home_path/picam/$file_name" -w $picam_width -h $picam_height -q 100 -sh 90 -rot $picam_rotation;
      scp -i "$home_path/.ssh/id_ed25519" "$home_path/picam/$file_name" "$remote_path/picam";
      rm "$home_path/picam/$file_name";
      echo "[picam] Picture saved: picture $date.jpg" >> $logs_file_name;
    fi

    # Webcam
    if $webcam_enabled; then
      v4l2-ctl -d /dev/video1 -c white_balance_automatic=0;
      v4l2-ctl -d /dev/video1 -c brightness=$webcam_brightness;
      fswebcam \
        -d $webcam_source \
        -r $webcam_resolution \
        -S $webcam_frames_skiped \
        --quiet \
        --jpeg 95 \
        --rotate $webcam_rotation \
        --no-banner "$home_path/webcam/$file_name";
      scp -i "$home_path/.ssh/id_ed25519" "$home_path/webcam/$file_name" "$remote_path/webcam";
      rm "$home_path/webcam/$file_name";
      echo "[webcam] Picture saved: picture $date.jpg" >> $logs_file_name;
    fi
  else
    echo "===== Night time, photos are disabled: $date. =====" >> $logs_file_name;
  fi
  echo "  -Sleep time: $sleep_time seconds." >> $logs_file_name;
  echo "  -Sunrise: $sunrise hrs. Sunset: $sunset hrs. Current: $current_hour hrs." >> $logs_file_name;
  echo "  -Webcam enabled: $webcam_enabled, brightness: $webcam_brightness" >> $logs_file_name;
  echo "  -Picam enabled: $picam_enabled" >> $logs_file_name;
  scp -i "$home_path/.ssh/id_ed25519" $logs_file_name "$remote_path/logs";

  if [[ $current_hour -ge 4 ]]; then
    sleep_time=$(($sleep_time/2))
  fi
  sleep $sleep_time
done

exit 0
