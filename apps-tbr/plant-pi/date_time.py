from utime import time, localtime

class DateTime:
    time_stamp=None
    date_time=None
    
    year=None
    month=None
    day=None
    hour=None
    minute=None
    second=None
    week_day=None
    year_day=None
    
    leap_year=False

    def __init__(self, date_time=None):
        if date_time is None:
            self.time_stamp=time()
            self.date_time=localtime(self.time_stamp)
        self.year=self.date_time[0]
        self.month=self.date_time[1]
        self.day=self.date_time[2]
        self.hour=self.date_time[3]
        self.minute=self.date_time[4]
        self.second=self.date_time[5]
        self.week_day=self.date_time[6]
        self.year_day=self.date_time[7]
        self.leap_year=True if self.year%4==0 else False
    
    def get_date_time_minutes(self):
        minutes=0
        minutes=self.time_stamp*60
        return minutes

    def get_now(self):
        time_stamp=time()
        date_time=localtime(time_stamp)
        return date_time

    def add_minutes_to_date(self, min_to_add=0):
        seconds=min_to_add*60
        self.time_stamp=self.time_stamp+seconds
        self.date_time=localtime(self.time_stamp)
        
        self.year=self.date_time[0]
        self.month=self.date_time[1]
        self.day=self.date_time[2]
        self.hour=self.date_time[3]
        self.minute=self.date_time[4]
        self.second=self.date_time[5]
        self.week_day=self.date_time[6]
        self.year_day=self.date_time[7]
        
        return

    def get_days_of_current_month(self, month=None):
        m=month
        if m is None:
            m=self.month
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
        elif self.leap_year is True:
            return 29
        else:
            return 28

    def get_human_readable_date_time(self):
        return '{}, {}/{} - {}:{}:{}'.format(
            self.year,
            self.month,
            self.day,
            self.hour,
            self.minute,
            self.second,
        )

    def print_date_time(self, text=None):
        t='' if text is None else text
        print(
            '=========',
            text[0:10],
            ':',
            self.get_human_readable_date_time(),
            '===========\n'
        )

# https://docs.micropython.org/en/latest/library/time.html
