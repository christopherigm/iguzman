from read_analog_sensor import read_analog_sensor

max_value=49300
#min_value=19200
min_value = 18000
diff = max_value - min_value

def read_soil_moisture_sensor(sensor_pin):
    value=read_analog_sensor(sensor_pin, True)
    print('value:', value)
    value=((max_value-value) * 100) / diff
    return value

# https://how2electronics.com/capacitive-soil-moisture-sensor-with-raspberry-pi-pico/