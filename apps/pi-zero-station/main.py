import cv2

minutes_to_record = 10
is_ok = False
index = 0

# while is_ok is False:
#     cap = cv2.VideoCapture(index)
#     if cap.isOpened():
#         is_ok = True
#     index = index + 1

index = 4
cap = cv2.VideoCapture(index, cv2.CAP_ANY)

if not cap.isOpened():
    print("Cannot open camera")
    exit()

frame_width = int(cap.get(3))
frame_height = int(cap.get(4))

size = (frame_width, frame_height)

result = cv2.VideoWriter(
    'filename.avi',
    cv2.VideoWriter_fourcc(*'MJPG'),
    30,
    size
)

counter = 0
target = minutes_to_record * 30 * 60

while True:
    ret, frame = cap.read()
    if ret:
        # cv2.imwrite('image.jpg', frame)
        result.write(frame)
    key = cv2.waitKey(0)
    if counter == target:
        break
    counter = counter + 1

cap.release()
result.release()
cv2.destroyAllWindows()

# 1) Install venv
# $ sudo apt-get install python3-venv

# 2) Create virtual env
# $ python3 -m venv venv

# 3) Install opencv-python
# $ python3 -m pip install opencv-python

# Picture
# ffmpeg -f video4linux2 -input_format mjpeg -video_size 1280x720 -i /dev/video0 -vframes 1 -f mjpeg out.jpg

# https://trac.ffmpeg.org/wiki/Capture/Webcam