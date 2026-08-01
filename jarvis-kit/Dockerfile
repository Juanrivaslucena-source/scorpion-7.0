# Dockerfile — packages Jarvis so a cloud host can run it 24/7.
#
# This is a sensible Node.js starting point. Codex should adjust the build and
# start commands to match how Jarvis is actually structured (check package.json
# "scripts"). The important part is: this container runs the SERVER (the part
# with the agents and the AI routes), which is what needs to stay on all the time.

FROM node:22-slim

WORKDIR /app

# Install dependencies first (faster rebuilds)
COPY package*.json ./
RUN npm ci

# Copy the rest of the app
COPY . .

# Build the frontend if there's a build step (Vite apps usually have one)
RUN npm run build || echo "no build step, skipping"

# The cloud host tells us which port to listen on via $PORT
ENV NODE_ENV=production
EXPOSE 8080

# Start the always-on server.
# ⚠️ Codex: change this to Jarvis's real start command if it isn't "npm start"
#    (e.g. "node server/index.js" or "npm run start:server").
CMD ["npm", "start"]
