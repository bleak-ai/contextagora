FROM node:22-alpine AS build
WORKDIR /app

# Copy landing package files and install dependencies
COPY landing/package.json landing/package-lock.json ./
RUN npm ci

# Copy landing source and the docs directory (needed by @docs alias)
COPY landing/ ./
COPY docs/ /docs/

# Build the Astro site
RUN npm run build

# Serve with a minimal static server
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
