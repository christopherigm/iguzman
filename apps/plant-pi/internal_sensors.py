from machine import ADC

internal_sensor_temp_pin = 4
internal_sensor_temp = ADC(internal_sensor_temp_pin)

def read_cpu_temperature():
    conversion_factor = 3.3 / (65535)
    reading = internal_sensor_temp.read_u16() * conversion_factor
    value = 27 - (reading - 0.706)/0.001721
    return value

