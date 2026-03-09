#!/bin/bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial
# Kill any existing node processes on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 2
# Run the API
node apps/api/dist/index.js
