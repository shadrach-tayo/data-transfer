# build production package for frontend
npm run build:prod
# build container and tag using the last git commit SHA
docker build -t shadrach19/trans-app:lastest -t shadrach19/trans-app:$(git log -1 --format=%h) -f Dockerfile .

# PUSH container to dockerhub
docker push shadrach19/trans-app:lastest
docker push shadrach19/trans-app:$(git log -1 --format=%h)