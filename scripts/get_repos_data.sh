#!/bin/bash

while IFS= read -r repo; do
  url="http://143.47.226.125:8080/allStars?repo=$repo"

  response=$(curl -s -w "%{http_code}" "$url") # Fetch the full response and include the status code
  status_code=$(echo "$response" | tail -c 4)  # Extract the last 3 characters (status code)

  if [ -n "$status_code" ]; then
    echo "Repo: $repo Status Code: $status_code"
  else
    echo "Failed to fetch data for $repo"
  fi

  sleep 600
done <preloaded-repositories.txt
