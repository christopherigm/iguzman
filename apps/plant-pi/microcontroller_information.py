import micropython
import gc
import os

def get_disk_free_space():
  s = os.statvfs('//')
  return (s[0]*s[3])/1024

def get_disk_allocated_space():
  s = os.statvfs('//')
  return (s[0]*s[2])/1024

def get_microcontroller_information():
    gc.collect()
    micropython.mem_info()
    
    free_ram = int(gc.mem_free()) / 1024
    allocated_ram = int(gc.mem_alloc()) / 1024
    total_ram = free_ram + allocated_ram
    disk_free_space = get_disk_free_space()
    disk_allocated_space = get_disk_allocated_space()
    disk_total_space = disk_free_space + disk_allocated_space
    
    return {
        'total_ram': total_ram,
        'allocated_ram': allocated_ram,
        'free_ram': free_ram,
        'disk_total_space': disk_total_space,
        'disk_allocated_space': disk_allocated_space,
        'disk_free_space': disk_free_space
    }
