# Ensure DB
```
curl -X POST http://localhost:3000/api/admin/ensureDB -H "Content-Type: application/json"
```

# Create user
```curl
curl -i -sS -X POST http://localhost:3000/api/user \
  -H "Content-Type: application/json" \
  -d '{"name":"Jure","email":"jure@gmx.de"}'
```

# Check vocabulary sources
curl -X GET http://localhost:3000/api/vocabulary/sources


# Check vocabulary for source Unit 3 - Book A
curl -G "http://localhost:3000/api/vocabulary?source=Unit%203%20-%20Book%20A"


# Run mongo
docker run -d \
  --name mongo-dev \
  -p 27017:27017 \
  -v "$(pwd)/database:/data/db" \
  --restart unless-stopped \
  mongo:7