int sensorPin1 = A0;
int sensorPin2 = A1;
int sensorPin3 = A2;
int ledPin1 = 3;
int ledPin2 = 5;
int ledPin3 = 6;
int sensorValue1 = 0;
int sensorValue2 = 0;
int sensorValue3 = 0;
int mappedValue1 = 0;
int mappedValue2 = 0;
int mappedValue3 = 0;

const int buttonPin = 2;
const int buttonOff = 4;
const int ledPin = 13;
int buttonState = 0;
int buttonOffState = 0;

const int trigPin = 7;
const int echoPin = 8;
int mapValue = 0;
float duration, distance;

void setup() {
  pinMode(buttonPin, INPUT);
  pinMode(buttonOff, INPUT);
  pinMode(ledPin1, OUTPUT);
  pinMode(ledPin2, OUTPUT);
  pinMode(ledPin3, OUTPUT);

  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
}

double timeout = 100 * 60 * 60;
int counter = 0;
int active = 0;

void loop() {
  buttonState = digitalRead(buttonPin);
  buttonOffState = digitalRead(buttonOff);
  if (buttonState == HIGH) {
    active = 1;
  }
  if (buttonOffState == HIGH) {
    active = 0;
    counter = 0;
  }

  if (active == 1) {
    counter++;
    sensorValue1 = analogRead(sensorPin1);
    mappedValue1 = map(sensorValue1, 0, 1020, 0, 255);
    analogWrite(ledPin1, mappedValue1);
    sensorValue2 = analogRead(sensorPin2);
    mappedValue2 = map(sensorValue2, 0, 1020, 0, 255);
    analogWrite(ledPin2, mappedValue2);
    sensorValue3 = analogRead(sensorPin3);
    mappedValue3 = map(sensorValue3, 0, 1020, 0, 255);
    analogWrite(ledPin3, mappedValue3);
  } else {
    analogWrite(ledPin1, 255);
    analogWrite(ledPin2, 255);
    analogWrite(ledPin3, 255);
  }

  if (counter > timeout) {
    active = 0;
    counter = 0;
  }

  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  duration = pulseIn(echoPin, HIGH);
  distance = (duration*.0343)/2;

  if (distance < 15) {
    active = 1;
  }
  delay(1);
}
