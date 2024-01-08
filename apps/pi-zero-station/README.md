# https://www.circuitbasics.com/how-to-power-your-raspberry-pi-with-a-lithium-battery/

POWER YOUR RASPBERRY PI WITH A BATTERY

photo_time=`date "+%Y/%m/%d - %H:%M"`;
echo $photo_time;

./ffmpeg.exe -i img.jpg -vf "drawtext=fontfile=/path/to/font.ttf:text='01/05/24 - 07\:00':fontcolor=white:fontsize=56:box=1:boxcolor=black@0.5:boxborderw=20:x=(w-text_w)-50:y=(h-text_h)-50" -y output.jpg

if [[$1 && $1 == "--force"]]; then
echo "FORCEEE";
fi

# https://projects.raspberrypi.org/en/projects/getting-started-with-picamera/3

raspistill -o image.jpg -w 640 -h 480
raspistill -o image.jpg -w 5000 -h 3000
raspistill -o image.jpg -w 2560 -h 1920
raspistill -o image.jpg -w 6000 -h 4000
raspistill -o image.jpg -w 2592 -h 1944 -q 100 -sh 90 -ss 1200000 -rot 180
raspistill -o image.jpg -w 2592 -h 1944 -q 100 -sh 90

raspistill -o image.jpg -w 2592 -h 1944 \
 -q 100 -sh 90 -rot 90 --exposure night -ss 60000 && \
 scp image.jpg christopher@master:/shared-volume/time-lapse/picam && \
 rm image.jpg

raspivid \
 --codec H264 \
 --timeout 600000 \
 --sharpness 70 \
 --width 1080 \
 --height 1920 \
 --output video.h264 \
 --rotation 180

raspivid \
 --codec H264 \
 --width 1080 \
 --height 1080 \
 --output video.h264 \
 --timeout 0 \
 --rotation 90 \
 --framerate 40 \
 --bitrate 25000000 \
 --brightness 80

--imxfx film \
 --drc low

--imxfx saturation

--exposure nightpreview

--saturation -30

scp christopher@raspberrypi:/home/christopher/image.jpg .
scp -r christopher@raspberrypi:/home/christopher/pictures .
scp christopher@raspberrypi:/home/christopher/video.h264 .

ffmpeg \
 -framerate 60 \
 -pattern_type glob \
 -i "/shared-volume/time-lapse/webcam/\*.jpg" \
 -s:v 1920x1080 \
 -c:v libx264 \
 -crf 17 \
 -pix_fmt yuv420p \
 timelapse.mp4

scp christopher@master:/home/christopher/timelapse.mp4 .

# https://www.raspberrypi-spy.co.uk/2013/05/how-to-disable-the-red-led-on-the-pi-camera-module/

# https://medium.com/@sekhar.rahul/creating-a-time-lapse-video-on-the-command-line-with-ffmpeg-1a7566caf877

# https://blog.programster.org/ffmpeg-create-smooth-videos-with-frame-interpolation

# https://www.gyan.dev/ffmpeg/builds/

ffmpeg \
 -i input.mp4 \
 -crf 10 \
 -c:v libx264 \
 -vf "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1" \
 -threads 4 \
 60fps.mp4

ffmpeg \
 -i input.mp4 \
 -crf 10 \
 -c:v libx264 \
 -preset slow \
 -vf "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=3840x2560:flags=lanczos" \
 -threads 16 \
 60fps.mp4

# https://github.com/yt-dlp/yt-dlp

# Music from youtube

Get video info

```sh
./yt-dlp-win.exe https://youtu.be/k1UCqCuGdck \
 --print "%(channel)s - %(duration>%H:%M:%S)s - %(title)s - %(purl)s"
```

Get video title

```sh
./yt-dlp-win.exe https://youtu.be/k1UCqCuGdck --print "%(title)s"
```

Get video formats

```sh
./yt-dlp https://youtu.be/k1UCqCuGdck --list-formats

./yt-dlp-win.exe https://www.instagram.com/reel/C1n1kxFrLvT/ --list-formats
./yt-dlp-win.exe https://youtu.be/k1UCqCuGdck --list-formats
```

Get video and convert it into mov

```sh
rm -rf media/* && rm -rf public/media/* && \
./yt-dlp-win.exe "https://youtube.com/shorts/l48BW7BKcBU?si=lEdKGj2Tp5FEK_nI" -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio" --remux-video mov --merge-output-format mov --postprocessor-args "-acodec aac -vcodec libx264" -o "media/659854d84d68229396c95e7c.%(ext)s"
```

./yt-dlp https://www.youtube.com/watch?v=1Tgu8aK0omo \
 -f 'bestaudio[ext=webm]/bestaudio' \
 -o "%(artist)s - %(title)s.mp3"

./yt-dlp https://youtu.be/k1UCqCuGdck \
 -f 'bestaudio[ext=webm]/bestaudio' \
 -o "%(artist)s - %(title)s.mp3" \
 --cookies /home/christopher/Downloads/cookies.txt

# Youtube

./yt-dlp https://youtu.be/d8OI9FllKfg \
 -f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio' \
 --merge-output-format mp4 \
 -o "%(title)s.%(ext)s"

# Tiktok

./yt-dlp https://www.tiktok.com/@wtfmoms/video/7292314796681186593 \
--add-header 'user-agent:Mozilla/5.0' -vU \
 -o "videos.%(ext)s

# Instagram

./yt-dlp https://www.instagram.com/reel/CzG-g_EuLJG \
--add-header 'user-agent:Mozilla/5.0' -vU \
 -o "%(title)s.%(ext)s"

# Twitter

./yt-dlp-win.exe https://x.com/FadeHubb/status/1731362761773318168?s=20 \
--add-header 'user-agent:Mozilla/5.0' -vU \
-o "%(title)s.%(ext)s"

# Facebook

./yt-dlp https://www.facebook.com/reel/881654479807536/ \
--add-header 'user-agent:Mozilla/5.0' -vU \
 -o "video.%(ext)s"

./yt-dlp https://youtu.be/9IQP6otIvh --list-formats

scp christopher@surface:/home/christopher/Videos/video.mp4 .
scp christopher@raspberrypi:/home/christopher/video.mp4 .

./yt-dlp https://youtu.be/DrKA7sKOhws \
 -f 'bestaudio[ext=m4a]/bestaudio' \
 --parse-metadata "title:%(artist)s - %(title)s" \
 -o "audio.%(ext)s"

scp christopher@surface:/home/christopher/Videos/audio.m4a .
scp christopher@raspberrypi:/home/christopher/audio.m4a .

# https://askubuntu

.com/questions/106770/take-a-picture-from-terminal

# 4MP is 2560 x 1440

streamer \
 -c /dev/video1 \
 -s 2560x1440 \
 -j 100 \
 -f jpeg \
 -o image.jpeg

# https://lbhtran.github.io/Camera-setting-and-photo-taking-schedule-to-get-the-best-result/

# https://www-users.york.ac.uk/~mjf5/shed_cam/src/USB%20webcam.html

v4l2-ctl -d /dev/video1 -c white_balance_automatic=0 && \
v4l2-ctl -d /dev/video1 -c brightness=190 && \
fswebcam \
 -d /dev/video1 \
 -r 2560x1440 \
 -S 10 \
 --jpeg 95 \
 --rotate 180 \
 --no-banner image.jpeg && \
 scp image.jpeg christopher@master:/shared-volume/time-lapse/webcam && \
 rm image.jpeg

v4l2-ctl -d /dev/video1 -l
v4l2-ctl -d /dev/video1 -c white_balance_automatic=0
v4l2-ctl -d /dev/video1 -c brightness=90
scp christopher@raspberrypi:/home/christopher/image.jpeg .

==============================================================

"raspistill" Camera App (commit )

Runs camera for specific time, and take JPG capture at end if requested

usage: raspistill [options]

Image parameter commands

-q, --quality : Set jpeg quality <0 to 100>
-r, --raw : Add raw bayer data to jpeg metadata
-l, --latest : Link latest complete image to filename <filename>
-t, --timeout : Time (in ms) before takes picture and shuts down (if not specified, set to 5s)
-th, --thumb : Set thumbnail parameters (x:y:quality) or none
-d, --demo : Run a demo mode (cycle through range of camera options, no capture)
-e, --encoding : Encoding to use for output file (jpg, bmp, gif, png)
-x, --exif : EXIF tag to apply to captures (format as 'key=value') or none
-tl, --timelapse : Timelapse mode. Takes a picture every <t>ms. %d == frame number (Try: -o img\_%04d.jpg)
-fp, --fullpreview : Run the preview using the still capture resolution (may reduce preview fps)
-k, --keypress : Wait between captures for a ENTER, X then ENTER to exit
-s, --signal : Wait between captures for a SIGUSR1 or SIGUSR2 from another process
-g, --gl : Draw preview to texture instead of using video render component
-gc, --glcapture : Capture the GL frame-buffer instead of the camera image
-bm, --burst : Enable 'burst capture mode'
-dt, --datetime : Replace output pattern (%d) with DateTime (MonthDayHourMinSec)
-ts, --timestamp : Replace output pattern (%d) with unix timestamp (seconds since 1970)  
-fs, --framestart : Starting frame number in output pattern(%d)
-rs, --restart : JPEG Restart interval (default of 0 for none)

GL parameter commands

-gs, --glscene : GL scene square,teapot,mirror,yuv,sobel,vcsm_square
-gw, --glwin : GL window settings <'x,y,w,h'>

Common Settings commands

-?, --help : This help information
-w, --width : Set image width <size>
-h, --height : Set image height <size>
-o, --output : Output filename <filename> (to write to stdout, use '-o -'). If not specified, no file is saved
-v, --verbose : Output verbose information during run
-cs, --camselect : Select camera <number>. Default 0
-md, --mode : Force sensor mode. 0=auto. See docs for other modes available
-gps, --gpsdexif : Apply real-time GPS information to output (e.g. EXIF in JPG, annotation in video (requires libgps.so.23)

Preview parameter commands

-p, --preview : Preview window settings <'x,y,w,h'>
-f, --fullscreen : Fullscreen preview mode
-op, --opacity : Preview window opacity (0-255)
-n, --nopreview : Do not display a preview window
-dn, --dispnum : Display on which to display the preview window (dispmanx/tvservice numbering)

Image parameter commands

-sh, --sharpness : Set image sharpness (-100 to 100)
-co, --contrast : Set image contrast (-100 to 100)
-br, --brightness : Set image brightness (0 to 100)
-sa, --saturation : Set image saturation (-100 to 100)
-ISO, --ISO : Set capture ISO
-vs, --vstab : Turn on video stabilisation
-ev, --ev : Set EV compensation - steps of 1/6 stop
-ex, --exposure : Set exposure mode (see Notes)
-fli, --flicker : Set flicker avoid mode (see Notes)
-awb, --awb : Set AWB mode (see Notes)
-ifx, --imxfx : Set image effect (see Notes)
-cfx, --colfx : Set colour effect (U:V)
-mm, --metering : Set metering mode (see Notes)
-rot, --rotation : Set image rotation (0, 90, 180, or 270)
-hf, --hflip : Set horizontal flip
-vf, --vflip : Set vertical flip
-roi, --roi : Set region of interest (x,y,w,d as normalised coordinates [0.0-1.0])
-ss, --shutter : Set shutter speed in microseconds
-awbg, --awbgains : Set AWB gains - AWB mode must be off
-drc, --drc : Set DRC Level (see Notes)
-st, --stats : Force recomputation of statistics on stills capture pass
-a, --annotate : Enable/Set annotate flags or text
-3d, --stereo : Select stereoscopic mode
-dec, --decimate : Half width/height of stereo image
-3dswap, --3dswap : Swap camera order for stereoscopic
-ae, --annotateex : Set extra annotation parameters (text size, text colour(hex YUV), bg colour(hex YUV), justify, x, y)
-ag, --analoggain : Set the analog gain (floating point)
-dg, --digitalgain : Set the digital gain (floating point)
-set, --settings : Retrieve camera settings and write to stdout
-fw, --focus : Draw a window with the focus FoM value on the image.

Notes

Exposure mode options :
off,auto,night,nightpreview,backlight,spotlight,sports,snow,beach,verylong,fixedfps,antishake,fireworks

Flicker avoid mode options :
off,auto,50hz,60hz

AWB mode options :
off,auto,sun,cloud,shade,tungsten,fluorescent,incandescent,flash,horizon,greyworld

Image Effect mode options :
none,negative,solarise,sketch,denoise,emboss,oilpaint,hatch,gpen,pastel,watercolour,film,blur,saturation,colourswap,washedout,posterise,colourpoint,colourbalance,cartoon

Metering Mode options :
average,spot,backlit,matrix

Dynamic Range Compression (DRC) options :
off,low,med,high

=================================================================

"raspivid" Camera App (commit )

Display camera output to display, and optionally saves an H264 capture at requested bitrate

usage: raspivid [options]

Image parameter commands

-b, --bitrate : Set bitrate. Use bits per second (e.g. 10MBits/s would be -b 10000000)  
-t, --timeout : Time (in ms) to capture for. If not specified, set to 5s. Zero to disable  
-d, --demo : Run a demo mode (cycle through range of camera options, no capture)
-fps, --framerate : Specify the frames per second to record
-e, --penc : Display preview image _after_ encoding (shows compression artifacts)
-g, --intra : Specify the intra refresh period (key frame rate/GoP size). Zero to produce an initial I-frame and then just P-frames.
-pf, --profile : Specify H264 profile to use for encoding
-td, --timed : Cycle between capture and pause. -cycle on,off where on is record time and off is pause time in ms
-s, --signal : Cycle between capture and pause on Signal
-k, --keypress : Cycle between capture and pause on ENTER
-i, --initial : Initial state. Use 'record' or 'pause'. Default 'record'
-qp, --qp : Quantisation parameter. Use approximately 10-40. Default 0 (off)
-ih, --inline : Insert inline headers (SPS, PPS) to stream
-sg, --segment : Segment output file in to multiple files at specified interval <ms>
-wr, --wrap : In segment mode, wrap any numbered filename back to 1 when reach number  
-sn, --start : In segment mode, start with specified segment number
-sp, --split : In wait mode, create new output file for each start event
-c, --circular : Run encoded data through circular buffer until triggered then save
-x, --vectors : Output filename <filename> for inline motion vectors
-if, --irefresh : Set intra refresh type
-fl, --flush : Flush buffers in order to decrease latency
-pts, --save-pts : Save Timestamps to file for mkvmerge
-cd, --codec : Specify the codec to use - H264 (default) or MJPEG
-lev, --level : Specify H264 level to use for encoding
-r, --raw : Output filename <filename> for raw video
-rf, --raw-format : Specify output format for raw video. Default is yuv
-l, --listen : Listen on a TCP socket
-stm, --spstimings : Add in h.264 sps timings
-sl, --slices : Horizontal slices per frame. Default 1 (off)

H264 Profile options :
baseline,main,high

H264 Level options :
4,4.1,4.2

H264 Intra refresh options :
cyclic,adaptive,both,cyclicrows

Raw output format options :
yuv,rgb,gray

Raspivid allows output to a remote IPv4 host e.g. -o tcp://192.168.1.2:1234or -o udp://192.168.1.2:1234
To listen on a TCP port (IPv4) and wait for an incoming connection use the -l option
e.g. raspivid -l -o tcp://0.0.0.0:3333 -> bind to all network interfaces,
raspivid -l -o tcp://192.168.1.1:3333 -> bind to a certain local IPv4 port

Common Settings commands

-?, --help : This help information
-w, --width : Set image width <size>
-h, --height : Set image height <size>
-o, --output : Output filename <filename> (to write to stdout, use '-o -'). If not specified, no file is saved
-v, --verbose : Output verbose information during run
-cs, --camselect : Select camera <number>. Default 0
-md, --mode : Force sensor mode. 0=auto. See docs for other modes available
-gps, --gpsdexif : Apply real-time GPS information to output (e.g. EXIF in JPG, annotation in video (requires libgps.so.23)

Preview parameter commands

-p, --preview : Preview window settings <'x,y,w,h'>
-f, --fullscreen : Fullscreen preview mode
-op, --opacity : Preview window opacity (0-255)
-n, --nopreview : Do not display a preview window
-dn, --dispnum : Display on which to display the preview window (dispmanx/tvservice numbering)

Image parameter commands

-sh, --sharpness : Set image sharpness (-100 to 100)
-co, --contrast : Set image contrast (-100 to 100)
-br, --brightness : Set image brightness (0 to 100)
-sa, --saturation : Set image saturation (-100 to 100)
-ISO, --ISO : Set capture ISO
-vs, --vstab : Turn on video stabilisation
-ev, --ev : Set EV compensation - steps of 1/6 stop
-ex, --exposure : Set exposure mode (see Notes)
-fli, --flicker : Set flicker avoid mode (see Notes)
-awb, --awb : Set AWB mode (see Notes)
-ifx, --imxfx : Set image effect (see Notes)
-cfx, --colfx : Set colour effect (U:V)
-mm, --metering : Set metering mode (see Notes)
-rot, --rotation : Set image rotation (0, 90, 180, or 270)
-hf, --hflip : Set horizontal flip
-vf, --vflip : Set vertical flip
-roi, --roi : Set region of interest (x,y,w,d as normalised coordinates [0.0-1.0])
-ss, --shutter : Set shutter speed in microseconds
-awbg, --awbgains : Set AWB gains - AWB mode must be off
-drc, --drc : Set DRC Level (see Notes)
-st, --stats : Force recomputation of statistics on stills capture pass
-a, --annotate : Enable/Set annotate flags or text
-3d, --stereo : Select stereoscopic mode
-dec, --decimate : Half width/height of stereo image
-3dswap, --3dswap : Swap camera order for stereoscopic
-ae, --annotateex : Set extra annotation parameters (text size, text colour(hex YUV), bg colour(hex YUV), justify, x, y)
-ag, --analoggain : Set the analog gain (floating point)
-dg, --digitalgain : Set the digital gain (floating point)
-set, --settings : Retrieve camera settings and write to stdout
-fw, --focus : Draw a window with the focus FoM value on the image.

Notes

Exposure mode options :
off,auto,night,nightpreview,backlight,spotlight,sports,snow,beach,verylong,fixedfps,antishake,fireworks

Flicker avoid mode options :
off,auto,50hz,60hz

AWB mode options :
off,auto,sun,cloud,shade,tungsten,fluorescent,incandescent,flash,horizon,greyworld

Image Effect mode options :
none,negative,solarise,sketch,denoise,emboss,oilpaint,hatch,gpen,pastel,watercolour,film,blur,saturation,colourswap,washedout,posterise,colourpoint,colourbalance,cartoon

Metering Mode options :
average,spot,backlit,matrix

Dynamic Range Compression (DRC) options :
off,low,med,high
