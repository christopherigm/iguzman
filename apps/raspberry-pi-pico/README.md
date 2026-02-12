# Raspberry Pi Pico — RGB LED Fade Demo

This folder contains a compact MicroPython script to smoothly fade an RGB LED using PWM on a Raspberry Pi Pico, plus wiring/schematic and usage instructions.

Files

- `rgb_fade.py` — MicroPython script. Copy to your Pico as `main.py` to run on boot, or run from REPL.

Overview

- The script generates smooth color transitions using 3 phase-shifted sine waves (red, green, blue).
- Supports both common-cathode and common-anode RGB LEDs (toggle `COMMON_ANODE` in the script).

Bill of Materials (suggested)

- Raspberry Pi Pico (or RP2040 board running MicroPython)
- RGB LED (common-cathode or common-anode)
- 3 × current-limiting resistors, 220 Ω (one per color)
- Breadboard and jumper wires

Wiring

Common-cathode wiring (most common):

- RGB LED cathode -> GND on Pico
- Red LED pin -> resistor -> GPIO (default GP15)
- Green LED pin -> resistor -> GPIO (default GP14)
- Blue LED pin -> resistor -> GPIO (default GP13)

Pin mapping in the example script (change if needed):

- `PIN_RED = 15` (GP15)
- `PIN_GREEN = 14` (GP14)
- `PIN_BLUE = 13` (GP13)

Common-anode wiring (if your LED is common-anode):

- RGB LED anode -> 3.3V on Pico
- Red LED pin -> resistor -> GPIO
- Green LED pin -> resistor -> GPIO
- Blue LED pin -> resistor -> GPIO

Important: If using common-anode mode, set `COMMON_ANODE = True` in `rgb_fade.py`.

Simple ASCII schematic (common-cathode example)

Pico 3.3V o
|
--- (not used for common-cathode)

Pico GND o---------------------------------+ (LED cathode)
|
GP15 ----[220Ω]----> (Red LED pin)
GP14 ----[220Ω]----> (Green LED pin)
GP13 ----[220Ω]----> (Blue LED pin)

Notes on resistors and currents

- Use ~220 Ω resistors for typical 5–15 mA color currents at 3.3V; choose resistor values based on LED forward voltage and desired brightness.

Running the code

1. Install MicroPython on your Pico if not already done. Use the official UF2 or Thonny installer.
2. Copy `rgb_fade.py` to the Pico:

```bash
# with Thonny: open the file and "Save as" -> Raspberry Pi Pico -> main.py
# or using mpremote (pip install mpremote):
mpremote fs put rgb_fade.py /main.py
mpremote reboot
```

3. The script will start automatically if saved as `main.py`. To test from REPL, you can run `import rgb_fade` or `rgb_fade.main()`.

Customization

- Change `PIN_RED`, `PIN_GREEN`, `PIN_BLUE` to the GPIO pins you wired.
- Adjust `COMMON_ANODE` for your LED type.
- Tune `PWM_FREQ`, `UPDATE_MS`, and `period` (in `smooth_cycle`) for different fade smoothness or speed.

Troubleshooting

- No light: check wiring, ground connection, and resistors. Confirm the LED type (anode vs cathode).
- Flicker or weird colors: try a higher `PWM_FREQ` or increase `UPDATE_MS` to reduce update rate.

Safety

- Do not drive LEDs without resistors.
- Avoid drawing more current than the Pico's GPIOs support; keep each color current modest (<= 20 mA recommended).

License

- MIT-style: feel free to reuse and adapt.
