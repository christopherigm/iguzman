#! /bin/bash

rm -rf views
mkdir views

cp build/index.html views/index.hbs
sed -i 's/\.\/cordova\.js//g' views/index.hbs

cat views/index.hbs

echo "Index done";