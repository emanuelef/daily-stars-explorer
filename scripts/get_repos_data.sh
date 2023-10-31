#!/bin/bash

while IFS= read -r repo; do
  # Construct the URL and perform the GET request
  url="http://143.47.226.125:8080/allStars?repo=$repo"
  response=$(curl -sI "$url") # Use -I to get only the headers
  status_code=$(echo "$response" | grep -i "HTTP" | cut -d ' ' -f 2)

  if [ -n "$status_code" ]; then
    json_lines=$(curl -s "$url" | jq -c '.[]' | wc -l)
    echo "Repo: $repo"
    echo "Status Code: $status_code"
    echo "Number of Lines in JSON Array: $json_lines"
  else
    echo "Failed to fetch data for $repo"
  fi

  sleep 300
done <preloaded-repositories.txt
