#!/bin/bash

while IFS= read -r repo; do
  # Construct the URL and perform the GET request
  url="http://143.47.226.125:8080/allStars?repo=$repo"
  response=$(curl -s "$url")

  # You can process the response here if needed
  echo "Response from $repo: $response"

  sleep 600
done < repositories.txt
