#!/bin/bash

docker run --init --rm -d -p 1984:1984 --name arlocal textury/arlocal:latest

set -e
EXIT_CODE=0

# Add grep support for arlocal mocha tests
if [ -z "$1" ];
then yarn nyc mocha || EXIT_CODE=$?; 
else yarn nyc mocha -g "$1" || EXIT_CODE=$?; 
fi

docker stop arlocal
exit $EXIT_CODE
