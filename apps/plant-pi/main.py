# https://projects.raspberrypi.org/en/projects/get-started-pico-w/1
from machine import Pin, Timer, PWM, ADC, RTC
from time import sleep
import network
import urequests as requests
import ujson
import _thread
from log import log
from wifi_connection import (
    setup_wifi_connection,
    prepare_connection,
    terminate_connection
)
from get_plant_id import get_plant_id
from create_measurement_record import create_measurement_record
from tools import (
    get_percent_value,
    get_final_value
)
from read_analog_sensor import read_analog_sensor
from read_digital_sensor import read_digital_sensor
from read_dht_sensor import (
    read_temperature,
    read_humidity
)
from internal_sensors import read_cpu_temperature

debug = False
plant_slug = 'green-beans'
plant_url = str('https://api.plant.iguzman.com.mx/v1/plants/?filter%5Bslug%5D=' + plant_slug)
measurement_url = 'https://api.plant.iguzman.com.mx/v1/measurements/'

green_led_pin = 21
red_pin = 20
ldr_pin = 27
light_sensor_pin = 22
dht_sensor_pin = 19
soil_sensor_1_pin = 26
ldr_pin = 27

sleep_interval_core_1 = 30 # Seconds
time_to_update_core_1 = 10 * 2 # 10 Minutes
sleep_interval_core_2 = 30 # Seconds
if debug is True:
    time_to_update_core_1 = 5
    sleep_interval_core_1 = 3 # Seconds
    sleep_interval_core_2 = 1 # Seconds
    plant_slug = 'test-plant'


plant_id = None
ldr = 0
soil_moisture = 0
temperature = 0
humidity = 0
is_day = None
cpu_temperature = 0

soil_moisture_measures = []
temperature_measures = []
ldr_measures = []
humidity_measures = []
cpu_temperature_measures = []
clean_all_measures = False

wlan = network.WLAN(network.STA_IF)
    
internal_led = machine.Pin("LED", machine.Pin.OUT)
internal_led.off()

# Green Led
green_led = Pin(green_led_pin, Pin.OUT)
red_led = Pin(red_pin, Pin.OUT)
        
green_led.off()
red_led.off()

log('System init')

red_led.on()

setup_wifi_connection(wlan)

while plant_id is None:
    prepare_connection(wlan)
    plant_id = get_plant_id(plant_url)
    sleep(5)
    
red_led.off()

def read_sensors():
    global soil_moisture_measures, ldr_measures, temperature_measures, humidity_measures, cpu_temperature_measures, clean_all_measures
    
    while True:
        green_led.on()
        soil_moisture_measures.append(read_analog_sensor(soil_sensor_1_pin))
        ldr_measures.append(read_analog_sensor(ldr_pin))
        temperature_measures.append(read_temperature(dht_sensor_pin))
        humidity_measures.append(read_humidity(dht_sensor_pin))
        cpu_temperature_measures.append(read_cpu_temperature())
        if clean_all_measures is True:
            soil_moisture_measures = []
            temperature_measures = []
            ldr_measures = []
            humidity_measures = []
            cpu_temperature_measures = []
            clean_all_measures = False
        green_led.off()
        sleep(sleep_interval_core_2)

_thread.start_new_thread(read_sensors, ())

core_1_counter = 0
while True:
    core_1_counter = core_1_counter + 1
    
    if core_1_counter is time_to_update_core_1:
        red_led.on()
        
        prepare_connection(wlan)

        soil_moisture = get_final_value(soil_moisture_measures)
        ldr = get_final_value(ldr_measures)
        temperature = get_final_value(temperature_measures)
        humidity = get_final_value(humidity_measures)
        cpu_temperature = get_final_value(cpu_temperature_measures)
        is_day = False if read_digital_sensor(light_sensor_pin) is 1 else True
        
        clean_all_measures = True
        print('>>> All soil measurements: ' + str(len(soil_moisture_measures)))
        
        create_measurement_record(
            measurement_url,
            plant_id,
            ldr,
            soil_moisture,
            temperature,
            humidity,
            is_day,
            cpu_temperature,
            debug
        )
        terminate_connection(wlan)
        
        red_led.off()
        
        core_1_counter = 0
        
    sleep(sleep_interval_core_1)

# Raspberry pinout
# https://www.raspberrypi.com/documentation/microcontrollers/raspberry-pi-pico.html

# Analog output
# https://projects.raspberrypi.org/en/projects/getting-started-with-the-pico/7

# Power raspberry pi pico
# https://projects.raspberrypi.org/en/projects/introduction-to-the-pico/12

# Servo
# https://microcontrollerslab.com/servo-motor-raspberry-pi-pico-micropython/

# Fix faulty soil moisture sensor
# https://www.youtube.com/watch?v=QGCrtXf8YSs

# Use the second onboard CPU core
# https://www.youtube.com/watch?v=9vvobRfFOwk&t=336s

#pwm = PWM(Pin(18))
#pwm.freq(50)

#while True:
#    for position in range(1000,9000,50):
#        pwm.duty_u16(position)
#        sleep(0.01)
#    for position in range(9000,1000,-50):
#        pwm.duty_u16(position)
#        sleep(0.01)

#timer = Timer()
#def blink(timer):
#    green_led.toggle()
#timer.init(freq=20, mode=Timer.PERIODIC, callback=blink)
