import urequests as requests
import ujson
from log import log

# https://datasheets.raspberrypi.com/picow/connecting-to-the-internet-with-pico-w.pdf
def create_measurement_record(
        url='',
        plant_id=0,
        ldr=None,
        soil_moisture=None,
        temperature=None,
        humidity=None,
        is_day=False,
        cpu_temperature=None,
        debug=False
    ):
    headers = {
        'Content-Type': 'application/vnd.api+json',
    }
    payload = {
        'data': {
            'type': 'Measurement',
            'attributes': {
                'ldr': ldr,
                'soil_moisture': soil_moisture,
                'temperature': temperature,
                'humidity': humidity,
                'is_day': is_day,
                'cpu_temperature': cpu_temperature
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
    try:
        response = requests.post(
            url,
            headers=headers,
            data=ujson.dumps(payload)
        )
        status_code = response.status_code
        response_text = str(response.text)
        response.close()
        
        if debug is True:
            log('Data sent: ' + ujson.dumps(payload))
            log('status_code: ' + str(status_code))
            log('response_text:' + response_text)
        
        if status_code is 201:
            return status_code
        
        log('Data sent: ' + ujson.dumps(payload))
        log('status_code: ' + str(status_code))
        log('response_text:' + response_text)
        return status_code
    except:
        log('could not connect')
        return None

