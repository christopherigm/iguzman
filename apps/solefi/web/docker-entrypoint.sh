#!/bin/bash

cp -r build/assets /
cp -r build/static /

node server/app.js
