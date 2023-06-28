from machine import Pin, ADC
from time import sleep
from log import log

def read_digital_sensor(sensor_pin):
    value=None
    sensor = Pin(sensor_pin, Pin.IN, Pin.PULL_UP)
    while value is None:
        try:
            value=sensor.value()
        except OSError as e:
            log('Error reading digital sensor:' + str(e))
    return value

