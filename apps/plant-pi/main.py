# https://projects.raspberrypi.org/en/projects/get-started-pico-w/1
from machine import WDT
from utime import sleep
import _thread, gc
from log import log
from raspberry_pi import RaspberryPi
from plant import Plant
from plant_array_data import plant_array_data

# https://docs.micropython.org/en/latest/library/gc.html#module-gc
gc.enable()
debug=False
log('System init')

#wdt = WDT(timeout=8388)
wdt = None
def feed_the_dog():
    if wdt is not None:
        wdt.feed()

raspberry=RaspberryPi(feed_the_dog=feed_the_dog)
raspberry.lights_from_startup()
wlan=raspberry.setup_wifi_connection()

plants=[]

for plant in plant_array_data:
    if plant['enable'] is True:
        plants.append(
            Plant(
                wlan=wlan,
                feed_the_dog=feed_the_dog,
                version=plant['version'],
                slug=plant['slug'],
                debug=debug,
                plant_number=plant['plant_number'],
            )
        )

    
for plant in plants:
    raspberry.arduino.rgb_1.red()
    plant.get_plant_information()
    if plant.plant is None:
        sleep(10) # trigger watch dog
    else:
        raspberry.arduino.rgb_1.blue()
        sleep(1)
        raspberry.arduino.rgb_1.off()

log('{} plants enabled'.format(len(plants)))
log('Information for all plants collected!')

#while True:
#    print('Mem Free: {} KBs'.format(gc.mem_free()/1024))
#    sleep(1)

#baton = _thread.allocate_lock()

core_1_counter=80
def update_plant_sensors():
    global core_1_counter, plants, feed_the_dog, raspberry, baton
    while True:
        #baton.acquire()
        feed_the_dog()
        if core_1_counter > 70:
            raspberry.record_microcontroller_information()
            feed_the_dog()
            raspberry.record_is_day()
            feed_the_dog()
            raspberry.record_temperature()
            feed_the_dog()
            raspberry.record_humidity()
            feed_the_dog()
            raspberry.record_ldr()
            feed_the_dog()
            raspberry.record_cpu_temperature()
            feed_the_dog()
            core_1_counter=0
        gc.collect()
        core_1_counter=core_1_counter+1
        sleep(1)
        #baton.release()

_thread.start_new_thread(update_plant_sensors, ())

core_0_counter=0
while True:
    #baton.acquire()
    feed_the_dog()
    if core_0_counter >= len(plants):
        core_0_counter=0
    plants[core_0_counter].perform_measurement_operation()
    plants[core_0_counter].perform_update_operation(        
        temperature=raspberry.temperature,
        humidity=raspberry.humidity,
        ldr=raspberry.ldr,
        is_day=raspberry.is_day,
        cpu_temperature=raspberry.cpu_temperature,
        total_ram=raspberry.total_ram,
        allocated_ram=raspberry.allocated_ram,
        disk_total_space=raspberry.disk_total_space,
        disk_allocated_space=raspberry.disk_allocated_space,
    )
    core_0_counter=core_0_counter+1
    gc.collect()
    #print('Core 0: Mem Free: {} KBs'.format(gc.mem_free()/1024))
    #print("============ From Raspberry Pi Class ============")
    #print('Core 0: Mem Free: {} KBs'.format(gc.mem_free()/1024))
    #print("total_ram:", raspberry.total_ram)
    #print("allocated_ram:", raspberry.allocated_ram)
    #print("disk_total_space:", raspberry.disk_total_space)
    #print("disk_allocated_space:", raspberry.disk_allocated_space)
    #print("temperature:", raspberry.temperature)
    #print("humidity:", raspberry.humidity)
    #print("ldr:", raspberry.ldr)
    #print("cpu_temperature:", raspberry.cpu_temperature)
    #print("is_day:", raspberry.is_day)
    #print("============ From Raspberry Pi Class ============")
    sleep(1)
    #baton.release()

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