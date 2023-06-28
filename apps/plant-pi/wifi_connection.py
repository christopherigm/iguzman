import network
from time import sleep
from log import log
from constants import (
    wifi_ssid,
    wifi_password,
)

# Aggressive power management mode for optimal power usage at the cost of performance
CYW43_AGGRESSIVE_PM = 0xA11C82

# Performance power management mode where more power is used to increase performance
CYW43_PERFORMANCE_PM = 0x111022
    
def setup_wifi_connection(wlan, feed_the_dog):
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.config(pm=CYW43_PERFORMANCE_PM)
    wlan.connect(wifi_ssid, wifi_password)
    timeout=0
    while not wlan.isconnected() or not wlan.active():
        log('setup_wifi_connection: connecting...')
        timeout=timeout+1
        if timeout > 10:
            sleep(20) # trigger watch dog
        else:
            feed_the_dog()
            sleep(1)
    wlan.config(pm=CYW43_AGGRESSIVE_PM)
    sleep(2)
    feed_the_dog()
    log('WiFi Connected!')
    log('Wlan status: ' + str(wlan.status()))
    return wlan

def prepare_connection(wlan, feed_the_dog):
    wlan.active(True)
    while not wlan.isconnected() or not wlan.active():
        print('prepare_connection...')
        setup_wifi_connection(wlan, feed_the_dog)
    wlan.config(pm=CYW43_PERFORMANCE_PM)
    sleep(2)
    feed_the_dog()

def terminate_connection(wlan):
    wlan.active(False)
    wlan.config(pm=CYW43_AGGRESSIVE_PM)
    sleep(1)
