# https://projects.raspberrypi.org/en/projects/get-started-pico-w/1
from machine import RTC

# https://www.w3schools.com/python/python_file_write.asp
def log(data):
    rtc=RTC()
    # https://forums.raspberrypi.com/viewtopic.php?t=321271#p1923176
    timestamp=rtc.datetime()
    timestring="%04d-%02d-%02d %02d:%02d:%02d"%(
        timestamp[0:3] + timestamp[4:7]
    )
    date = str("%04d-%02d-%02d"%(
        timestamp[0:3]
    ))
    data_to_log = str(timestring) + ': ' + str(data) + '\n'
    log_file_name = './logs-' + date
    f = open(log_file_name, "a")
    f.write(data_to_log)
    f.flush()
    f.close()
    print(data_to_log)
