from machine import Pin, ADC
from time import sleep
from log import log

def read_digital_sensor(sensor_pin):
    try:
        sensor = Pin(sensor_pin, Pin.IN, Pin.PULL_UP)
        sleep(0.5)
        return sensor.value()
    except OSError as e:
        log('Error reading analog sensor:' + str(e))
        return 0

