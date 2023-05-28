from machine import Pin, ADC
from time import sleep
from log import log
from tools import get_percent_value

def read_analog_sensor(sensor_pin, raw_value=False):
    try:
        sensor = ADC(Pin(sensor_pin))
        sleep(0.5)
        reading = sensor.read_u16()
        if raw_value is True:
            return reading
        value = get_percent_value(reading)
        return value
    except OSError as e:
        log('Error reading analog sensor:' + str(e))
        return None

# Analog input
# https://projects.raspberrypi.org/en/projects/getting-started-with-the-pico/8

