#!/bin/bash

docker run --init --rm -d -p 1984:1984 --name arlocal textury/arlocal:latest

# Add grep support for arlocal mocha tests
if [ -z "$1" ];
then yarn nyc mocha; 
else yarn nyc mocha -g "$1"; 
fi

docker stop arlocal
