import urequests as requests
from utime import sleep
import ujson
from log import log
from constants import measurement_url

def create_measurement_record(
        wlan,
        feed_the_dog,
        plant_id=0,
        ldr=None,
        soil_moisture=None,
        temperature=None,
        humidity=None,
        is_day=False,
        cpu_temperature=None,
        #total_ram=None,
        allocated_ram=None,
        #disk_total_space=None,
        disk_allocated_space=None,
        debug_measurment_data=None,
        initial_measurement=False,
        debug=False,
        retries=0,
    ):
    feed_the_dog()

    headers = {
        'Content-Type': 'application/vnd.api+json',
    }
    payload = {
        'data': {
            'type': 'Measurement',
            'attributes': {
                'ldr': ldr,
                'soil_moisture': round(soil_moisture, 2),
                'temperature': round(temperature, 2),
                'humidity': round(humidity, 2),
                'is_day': is_day,
                'cpu_temperature': round(cpu_temperature, 2),
                #'total_ram_capacity': round(total_ram, 3),
                'ram_allocated': round(allocated_ram, 3),
                #'total_storage_capacity': round(disk_total_space, 3),
                'storage_allocated': round(disk_allocated_space, 3),
                'debug_measurment_data': debug_measurment_data,
                'initial_measurement': initial_measurement,
            },
            'relationships': {
                'plant': {
                    'data': {
                        'type': 'Plant',
                        'id': plant_id
                    }
                }
            }
        }
    }
    payload=ujson.dumps(payload)
    
    try:
        #start_time = ticks_ms()
        response=requests.post(
            measurement_url,
            headers=headers,
            data=payload
        )
        #end_time = ticks_ms()
        status_code = response.status_code
        response.close()
        feed_the_dog()
        #elapsed_time = end_time - start_time
        #print("Request time: {} seconds".format(elapsed_time/1000))
        
        if status_code == 201:
            return status_code
        else:
            log('Error on create_measurement_record status_code: ' + str(status_code))
            log('Error on create_measurement_record payload:' + payload)
    except Exception as e:
        log('Exception on create_measurement_record:' + str(e))
        feed_the_dog()
        retries=retries+1
        if retries <= 5:
            feed_the_dog()
            sleep(7)
            feed_the_dog()
            return create_measurement_record(
                wlan=wlan,
                feed_the_dog=feed_the_dog,
                plant_id=plant_id,
                ldr=ldr,
                soil_moisture=soil_moisture,
                temperature=temperature,
                humidity=humidity,
                is_day=is_day,
                cpu_temperature=cpu_temperature,
                #total_ram=total_ram,
                allocated_ram=allocated_ram,
                #disk_total_space=disk_total_space,
                disk_allocated_space=disk_allocated_space,
                debug_measurment_data=debug_measurment_data,
                initial_measurement=initial_measurement,
                debug=debug,
                retries=retries,
            )
        else:
            return 500

# https://datasheets.raspberrypi.com/picow/connecting-to-the-internet-with-pico-w.pdf
