from machine import ADC
from utime import sleep

internal_sensor_temp_pin = 4

def read_cpu_temperature():
    internal_sensor_temp = ADC(internal_sensor_temp_pin)
    conversion_factor = 3.3 / (65535)
    reading=None
    while reading is None:
        reading = internal_sensor_temp.read_u16()
        #sleep(0.1)
    reading = reading * conversion_factor
    value = 27 - (reading - 0.706)/0.001721
    return value
