#!/bin/bash

while IFS= read -r repo; do
  url="http://143.47.226.125:8080/allStars?repo=$repo"

  response=$(curl -s "$url")  # Fetch the full response
  status_code=$(echo "$response" | head -n 1 | grep -i "HTTP" | cut -d ' ' -f 2)

  if [ -n "$status_code" ]; then
    json_lines=$(echo "$response" | jq -c '.[]' | wc -l)
    echo "Repo: $repo"
    echo "Status Code: $status_code"
    echo "Number of Lines in JSON Array: $json_lines"
  else
    echo "Failed to fetch data for $repo"
  fi

  sleep 60
done <preloaded-repositories.txt
