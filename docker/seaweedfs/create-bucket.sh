#!/bin/sh
set -eu

case "$S3_BUCKET" in
  ""|*[!a-z0-9.-]*) echo "Invalid development bucket name." >&2; exit 1 ;;
esac

status=$(curl --silent --show-error --retry 30 --retry-all-errors --retry-delay 2 \
  --connect-timeout 5 --max-time 15 \
  --aws-sigv4 "aws:amz:${S3_REGION}:s3" \
  --user "${S3_ACCESS_KEY}:${S3_SECRET_KEY}" \
  --request PUT --output /tmp/bucket-response --write-out '%{http_code}' \
  "${S3_ENDPOINT}/${S3_BUCKET}")

if [ "$status" = "200" ]; then
  echo "Development S3 bucket is ready."
elif [ "$status" = "409" ] && grep -q '<Code>BucketAlreadyOwnedByYou</Code>' /tmp/bucket-response; then
  echo "Development S3 bucket already exists."
else
  echo "S3 bucket initialization failed (HTTP ${status})." >&2
  exit 1
fi
