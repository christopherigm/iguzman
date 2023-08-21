const int led = 3;
const int trigPin = 7;
const int echoPin = 8;
int mapValue = 0;

float duration, distance;

void setup() {
  pinMode(led, OUTPUT);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  //Serial.begin(9600);
}

void loop() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  duration = pulseIn(echoPin, HIGH);
  distance = (duration*.0343)/2;
  //Serial.print("Distance: ");
  //Serial.print(distance);
  //Serial.print(", mapValue: ");
  mapValue = map(distance, 2, 165, 0, 255);
  //Serial.println(mapValue);
  analogWrite(led, mapValue);
  delay(10);
}
