from log import log

def get_percent_value(val):
    if val is None or val is 0:
        return None
    return round(((val*100)/65535), 2)

def get_final_value(arr, sensor_name=None):
    if len(arr) is 0:
        return None
    total = 0
    value = None
    for x in arr:
        if x is not None and x is not 0:
            total = total + x
    if total is 0:
        return None
    value = round(total/len(arr), 2)
    if sensor_name is not None:
        log('Final result for: ' + sensor_name + ': ' + str(value))
    return value

