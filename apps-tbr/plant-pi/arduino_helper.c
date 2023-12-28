const unsigned int MAX_MESSAGE_LENGTH = 12;

int led_D2_P4 = 2;
int led_D3_pwm_P5 = 3;
int led_D4_P6 = 4;
int led_D5_pwm_P11 = 5;
int led_D6_P12 = 6;
int led_D7_P13 = 7;
int led_D8_P14 = 8;

int rgb_blue_D9_P15 = 9;
int rgb_green_D10_P16 = 10;
int rgb_red_D11_P17 = 11;

int pump_1_D12_P18 = 12;
int pump_2_D13_P19 = 13;

int general_pwm_input_A0_P23 = A0;

int soil_moisture_A1_P24 = A1;
int soil_moisture_A2_P25 = A2;
int soil_moisture_A3_P26 = A3;
int soil_moisture_A4_P27 = A4;
int soil_moisture_A5_P28 = A5;

int sensorValue = 0;
int intValue = 0;

const int dry = 520;
const int wet = 208;

void setup() {
  Serial.begin(9600);
  pinMode(led_D2_P4, OUTPUT);
  pinMode(led_D3_pwm_P5, OUTPUT);
  pinMode(led_D4_P6, OUTPUT);
  pinMode(led_D5_pwm_P11, OUTPUT);
  pinMode(led_D6_P12, OUTPUT);
  pinMode(led_D7_P13, OUTPUT);
  pinMode(led_D8_P14, OUTPUT);
  pinMode(rgb_blue_D9_P15, OUTPUT);
  pinMode(rgb_green_D10_P16, OUTPUT);
  pinMode(rgb_red_D11_P17, OUTPUT);
  pinMode(pump_1_D12_P18, OUTPUT);
  pinMode(pump_2_D13_P19, OUTPUT);
}

// the loop function runs over and over again forever
void loop() {
  while (Serial.available() > 0) {
    static char message[MAX_MESSAGE_LENGTH];
    static unsigned int message_pos = 0;

    char inByte = Serial.read();

    if ( inByte != '\n' && (message_pos < MAX_MESSAGE_LENGTH - 1) ) {
      message[message_pos] = inByte;
      message_pos++;
    } else {
      Serial.println(message);
      message[message_pos] = '\0';
      int number = atoi(message);

      if(number == 4) {
        digitalWrite(led_D2_P4, HIGH);
      }
      if(number == 4 * 10) {
        digitalWrite(led_D2_P4, LOW);
      }

      if(number == 5) {
        digitalWrite(led_D3_pwm_P5, HIGH);
      }
      if(number == 5 * 10) {
        digitalWrite(led_D3_pwm_P5, LOW);
      }

      if(number == 6) {
        digitalWrite(led_D4_P6, HIGH);
      }
      if(number == 6 * 10) {
        digitalWrite(led_D4_P6, LOW);
      }

      if(number == 11) {
        digitalWrite(led_D5_pwm_P11, HIGH);
      }
      if(number == 11 * 10) {
        digitalWrite(led_D5_pwm_P11, LOW);
      }

      if(number == 12) {
        digitalWrite(led_D6_P12, HIGH);
      }
      if(number == 12 * 10) {
        digitalWrite(led_D6_P12, LOW);
      }

      if(number == 13) {
        digitalWrite(led_D7_P13, HIGH);
      }
      if(number == 13 * 10) {
        digitalWrite(led_D7_P13, LOW);
      }

      if(number == 14) {
        digitalWrite(led_D8_P14, HIGH);
      }
      if(number == 14 * 10) {
        digitalWrite(led_D8_P14, LOW);
      }

      // RGB Led
      if(number == 15) {
        digitalWrite(rgb_blue_D9_P15, HIGH);
      }
      if(number == 15 * 10) {
        digitalWrite(rgb_blue_D9_P15, LOW);
      }
      if(number == 16) {
        digitalWrite(rgb_green_D10_P16, HIGH);
      }
      if(number == 16 * 10) {
        digitalWrite(rgb_green_D10_P16, LOW);
      }
      if(number == 17) {
        digitalWrite(rgb_red_D11_P17, HIGH);
      }
      if(number == 17 * 10) {
        digitalWrite(rgb_red_D11_P17, LOW);
      }

      if(number == 18) {
        digitalWrite(pump_1_D12_P18, HIGH);
      }
      if(number == 18 * 10) {
        digitalWrite(pump_1_D12_P18, LOW);
      }

      if(number == 19) {
        digitalWrite(pump_2_D13_P19, HIGH);
      }
      if(number == 19 * 10) {
        digitalWrite(pump_2_D13_P19, LOW);
      }

      if(number == 23) {
        Serial.print('0');
        Serial.write(' ');
        Serial.print(analogRead(general_pwm_input_A0_P23));
        Serial.write(' ');
        Serial.println(message);
        delay(100);
      } else if(number == 24) {
        Serial.print('1');
        Serial.write(' ');
        Serial.print(analogRead(soil_moisture_A1_P24));
        Serial.write(' ');
        Serial.println(message);
        delay(100);
      } else if(number == 25) {
        Serial.print('2');
        Serial.write(' ');
        Serial.print(analogRead(soil_moisture_A2_P25));
        Serial.write(' ');
        Serial.println(message);
        delay(100);
      } else if(number == 26) {
        Serial.print('3');
        Serial.write(' ');
        Serial.print(analogRead(soil_moisture_A3_P26));
        Serial.write(' ');
        Serial.println(message);
        delay(100);
      } else if(number == 27) {
        Serial.print('4');
        Serial.write(' ');
        Serial.print(analogRead(soil_moisture_A4_P27));
        Serial.write(' ');
        Serial.println(message);
        delay(100);
      } else if(number == 28) {
        Serial.print('5');
        Serial.write(' ');
        Serial.print(analogRead(soil_moisture_A5_P28));
        Serial.write(' ');
        Serial.println(message);
        delay(100);
      }

      message_pos = 0;
    }
  }
}

// https://electrocredible.com/raspberry-pi-pico-serial-uart-micropython/
