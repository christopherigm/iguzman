from machine import Pin
import dht
from utime import sleep
from log import log

dht_sensor = None

def read_temperature(dht_sensor_pin):
    global dht_sensor
    if dht_sensor is None:
        dht_sensor = dht.DHT11(Pin(dht_sensor_pin))
        sleep(0.1)
    value=None
    while value is None:
        try:
            dht_sensor.measure()
            sleep(1)
            value=dht_sensor.temperature()
        except OSError as e:
            log('Error reading temperature:' + str(e))
    return value


def read_humidity(dht_sensor_pin):
    global dht_sensor
    if dht_sensor is None:
        dht_sensor = dht.DHT11(Pin(dht_sensor_pin))
        sleep(0.1)
    value=None
    while value is None:
        try:
            dht_sensor.measure()
            sleep(1)
            value=dht_sensor.humidity()
        except OSError as e:
            log('Error reading humidity:' + str(e))
    return value

# DHT Temperture and Humidity
# https://www.upesy.com/blogs/tutorials/use-dht11-humidity-temperature-sensor-on-pi-pico-with-micro-python-script#

# How Do You Measure Air Temperature Accurately?
# https://www.nist.gov/how-do-you-measure-it/how-do-you-measure-air-temperature-accurately

