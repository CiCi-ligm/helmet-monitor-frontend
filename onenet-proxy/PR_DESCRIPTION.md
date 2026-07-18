# Pull Request: Add OneNet proxy

This PR adds a simple Node/Express proxy that accepts navigation text from the browser and forwards it to OneNet (HEClouds) as datapoints. The proxy keeps the OneNet Access Key on the server and prevents exposing it in the frontend.

Files added under onenet-proxy/:
- server.js
- package.json
- .env.example
- .gitignore
- README.md

Usage and notes are in onenet-proxy/README.md. Please review and test locally before merging. If you want any header name changes (api-key vs access-key) or CORS restrictions, I can update the branch.
