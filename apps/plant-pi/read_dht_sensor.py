from machine import Pin
import dht
from time import sleep
from log import log

dht_sensor = None

def read_temperature(dht_sensor_pin):
    global dht_sensor
    if dht_sensor is None:
        dht_sensor = dht.DHT11(Pin(dht_sensor_pin))
    try:
        dht_sensor.measure()
        sleep(2)
        return dht_sensor.temperature()
    except OSError as e:
        log('Error reading temperature:' + str(e))


def read_humidity(dht_sensor_pin):
    global dht_sensor
    if dht_sensor is None:
        dht_sensor = dht.DHT11(Pin(dht_sensor_pin))
    try:
        dht_sensor.measure()
        sleep(2)
        return dht_sensor.humidity()
    except OSError as e:
        log('Error reading humidity:' + str(e))

# DHT Temperture and Humidity
# https://www.upesy.com/blogs/tutorials/use-dht11-humidity-temperature-sensor-on-pi-pico-with-micro-python-script#
