# build container and tag using the last git commit SHA
docker build -t shadrach19/trans-app:lastest -t shadrach19/trans-app:$SHA -f Dockerfile .

# PUSH container to dockerhub
docker push shadrach19/trans-app:lastest
docker push shadrach19/trans-app:$SHA