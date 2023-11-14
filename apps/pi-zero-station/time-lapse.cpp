// C++ Program to show how to use
// sleep function
#include <iostream>

// Library effective with Linux
#include <unistd.h>

using namespace std;

// https://www.w3schools.com/cpp/cpp_functions.asp
void takeShot() {
  system("./camera-shot.sh");
  sleep(10);
  takeShot();
}

// Driver code
int main() {
  while(true) {
    system("./camera-shot.sh");
    sleep(10);
  }
}


