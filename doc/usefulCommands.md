# Ensure DB
```
curl -X POST http://localhost:3000/api/admin/ensure -H "Content-Type: application/json"
```

# Create user
```curl
curl -i -sS -X POST http://localhost:3000/api/user \
  -H "Content-Type: application/json" \
  -d '{"name":"Jure","email":"jure@gmx.de"}'
```


# Run mongo
docker run -d \
  --name mongo-dev \
  -p 27017:27017 \
  -v "$(pwd)/database:/data/db" \
  --restart unless-stopped \
  mongo:7