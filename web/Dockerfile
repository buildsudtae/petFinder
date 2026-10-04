FROM node:24-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# `docker build --target test ./web` runs the vitest suite (fails the build when a test fails)
FROM deps AS test
RUN npm test

FROM deps AS build
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
