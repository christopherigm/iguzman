from machine import RTC
import math
from log import log

def get_percent_value(val):
    if val is None or val is 0:
        return None
    return round(((val*100)/65535), 2)

def get_final_value(arr, sensor_name=None):
    if len(arr) is 0:
        return None
    total = 0
    value = None
    for x in arr:
        if x is not None and x is not 0:
            total = total + x
    if total is 0:
        return None
    value = round(total/len(arr), 2)
    if sensor_name is not None:
        log('Final result for: ' + sensor_name + ': ' + str(value))
    return value

def get_now():
    rtc=RTC()
    now=rtc.datetime()
    return now

def get_leap_year():
    rtc=RTC()
    now=rtc.datetime()
    year=now[0]
    leap_year=True if year%4==0 else False
    return leap_year

def get_days_of_current_month(month=None):
    m=month
    if m is None:
        rtc=RTC()
        now=rtc.datetime()
        m=now[1]
    leap_year=get_leap_year()
    if (m == 1 or
            m == 3 or
            m == 5 or
            m == 7 or
            m == 8 or
            m == 10 or
            m == 12
        ):
        return 31
    elif (m == 2 or
            m == 4 or
            m == 6 or
            m == 9 or
            m== 11
        ):
        return 30
    elif leap_year is True:
        return 29
    else:
        return 28

def print_date_time(date_time=None):
    if date_time is not None:
        year=date_time[0]
        month=date_time[1]
        day=date_time[2]
        week_day=date_time[3]
        hour=date_time[4]
        minute=date_time[5]
        second=date_time[6]
        print('{}, {}/{} - {}:{}:{}'.format(
            year,
            month,
            day,
            hour,
            minute,
            second
        ))

def add_minutes_to_date(date_time, min_to_add):
    #date_time=date
    #if date_time is None:
    year=date_time[0]
    month=date_time[1]
    day=date_time[2]
    week_day=date_time[3]
    hour=date_time[4]
    minute=date_time[5]
    second=date_time[6]
    
    minute=minute+min_to_add
    
    if minute >= 60:
        hours_to_add=math.floor(minute/60)
        hour=hour+hours_to_add
        minute=minute-(hours_to_add*60)
        
        if hour >= 24:
            days_to_add=math.floor(hour/24)
            day=day+days_to_add
            hour=hour-(days_to_add*24)
            
            # To be fixed
            days_of_current_month=get_days_of_current_month()
            if day >= days_of_current_month:
                months_to_add=math.floor(day/days_of_current_month)
                month=month+months_to_add
                day=day-(months_to_add*days_of_current_month)
                
    rtc=RTC()
    rtc.datetime((
        year,
        month,
        day,
        week_day,
        hour,
        minute,
        second,
        0
    ))
    rtc.datetime()
    new_datetime=rtc.datetime()
    return new_datetime