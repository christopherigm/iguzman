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

force=false;

if [[ "$1" == "--force" ]]; then
  force=true;
fi



if $picam_enabled || $force; then
  mkdir -p "$home_path/picam";
  # ssh -i /home/christopher/.ssh/id_ed25519 christopher@master 'mkdir -p /shared-volume/time-lapse/picam'
fi

if $webcam_enabled || $force; then
  mkdir -p "$home_path/webcam";
  # ssh -i /home/christopher/.ssh/id_ed25519 christopher@master 'mkdir -p /shared-volume/time-lapse/webcam'
fi

echo "force: $force";

while true; do
  source "$home_path/.env"

  logs_file_name="$home_path/logs/`date "+%Y-%m-%d"`.txt";
  touch $logs_file_name;
  # current_hour
  current_hour=`date "+%H"`;
  # cast string to int
  current_hour=`expr $current_hour + 0`;

  date=$(date '+%Y-%m-%d %H-%M-%S');

  if [[ $current_hour -ge $sunrise && $current_hour -le $sunset ]] || $force ; then
    echo "===== Photos are enabled: $date. =====";

    # File name
    file_name="picture $date.jpg";

    #Foto time
    photo_time=`date "+%m/%d/%Y - %H\:%M"`;
    echo "[Photo time]: $photo_time";
    fontfile="fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
    fontcolor="fontcolor=white";
    fontsize="fontsize=50"
    textbox="box=1:boxcolor=black@0.5:boxborderw=20"
    

    # Raspberry PI Camera
    if $picam_enabled; then
      raspistill -o "$home_path/picam/tmp-$file_name" -w $picam_width -h $picam_height -q 100 -sh 90 -rot $picam_rotation;
      text1="drawtext=$fontfile:text='$photo_time':$fontcolor:$fontsize:$textbox:x=(w-text_w)-50:y=(h-text_h)-50"
      text2="drawtext=$fontfile:text='Longmont CO':$fontcolor:$fontsize:$textbox:x=50:y=(h-text_h)-50"
      ffmpeg -i "$home_path/picam/tmp-$file_name" \
        -vf "$text1,$text2" \
        -y "$home_path/picam/$file_name";
      # ffmpeg -i "$home_path/picam/tmp-$file_name" \
      #   -vf "drawtext=$fontfile:text='$photo_time':$fontcolor:$fontsize:$textbox:x=(w-text_w)-50:y=(h-text_h)-50" \
      #   -vf "drawtext=$fontfile:text='Longmont CO':$fontcolor:$fontsize:$textbox:x=50:y=(h-text_h)-50" \
      #   -y "$home_path/picam/$file_name";
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
        --no-banner "$home_path/webcam/tmp-$file_name";
      text1="drawtext=$fontfile:text='$photo_time':$fontcolor:$fontsize:$textbox:x=(w-text_w)-50:y=(h-text_h)-50"
      text2="drawtext=$fontfile:text='Longmont CO':$fontcolor:$fontsize:$textbox:x=50:y=(h-text_h)-50"
      ffmpeg -i "$home_path/webcam/tmp-$file_name" \
        -vf "$text1,$text2" \
        -y "$home_path/webcam/$file_name";
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

# https://stackoverflow.com/questions/17623676/text-on-video-ffmpeg
