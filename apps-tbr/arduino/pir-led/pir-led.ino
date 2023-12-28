int led = 3;
int sensor = 2;
int state = LOW;
int val = 0;

void setup() {
  pinMode(led, OUTPUT);
  pinMode(sensor, INPUT);
  Serial.begin(9600);
}

void loop() {
  val = digitalRead(sensor);
  if (val == HIGH) {
    analogWrite(led, 5);
    delay(2000);
  } else {
    analogWrite(led, 0);
  }
  delay(1);
}