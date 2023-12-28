int sensorPin = A0;
int ledPin = 3;
int sensorValue = 0;
int mappedValue = 0;

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  sensorValue = analogRead(sensorPin);
  mappedValue = map(sensorValue, 0, 1020, 255, 0);
  analogWrite(ledPin, mappedValue);
  delay(1);
}
